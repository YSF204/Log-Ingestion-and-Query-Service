# Log Ingestion and Query Service

A TypeScript and PostgreSQL service for high-volume log ingestion, filtered search, cursor pagination, time-bucketed aggregation, and automatic retention.

## Quick start

```bash
docker compose up
```

The API and built-in Eventline dashboard are available at `http://localhost:8080`. No environment file, authentication, or manual migration is required.

```bash
curl http://localhost:8080/health
```

## API

### `GET /health`

Returns `200` after the database is connected and migrations are complete.

### `POST /logs`

Always accepts a batch:

```json
{
  "logs": [
    {
      "timestamp": "2026-08-08T12:00:00.000Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": { "user_id": "42", "retries": 3 }
    }
  ]
}
```

Each entry is validated independently:

- `timestamp`: valid ISO 8601, at most five minutes in the future
- `level`: `debug`, `info`, `warn`, or `error`
- `service` and `message`: non-empty strings
- `attributes`: optional flat object of strings, numbers, or booleans

Valid entries are stored even if others fail:

```json
{
  "accepted": 9,
  "rejected": [{ "index": 3, "reason": "invalid log entry" }]
}
```

Returns `200` if at least one entry is accepted. Returns `400` for malformed JSON, an invalid top-level body, or a fully rejected batch.

### `GET /logs`

All filters can be combined:

| Parameter | Meaning |
|---|---|
| `service` | Exact service match |
| `level` | Exact level match |
| `since` / `until` | Inclusive start / exclusive end |
| `attr.<key>` | Attribute equality as text |
| `q` | Case-insensitive message substring |
| `limit` | Default `100`, maximum `1000` |
| `cursor` | Opaque cursor from the previous response |

Results are ordered by timestamp and ID descending.

```json
{ "logs": [], "next_cursor": null }
```

Reuse the same filters with the next cursor. Invalid parameters return `400` as `{"error":"<description>"}`.

### `GET /logs/aggregate`

Requires `since`, `until`, and `bucket`. Buckets may be `1m`, `5m`, `1h`, or `1d`. Optional `group_by` values are `service` and `level`. The normal filters (`service`, `level`, `attr.*`, and `q`) are also supported.

```json
{
  "buckets": [
    {
      "start": "2026-08-08T12:00:00.000Z",
      "group": "checkout",
      "count": 118
    }
  ]
}
```

Buckets are ordered by start time. Empty buckets are omitted. `group` is `null` without `group_by`.

## Design

PostgreSQL is the source of truth and the application is stateless.

```text
POST /logs          validate → COPY logs → append rollup deltas → commit
GET /logs           parse filters/cursor → parameterized SQL → return page
GET /logs/aggregate use rollups, or raw logs for q and attr.* filters
```

The `logs` table uses:

| Column | Type | Purpose |
|---|---|---|
| `id` | `bigint identity` | Unique ID and pagination tie-breaker |
| `timestamp` | `timestamptz` | Event time and retention key |
| `level` | `text` | Severity |
| `service` | `text` | Source service |
| `message` | `text` | Log message |
| `attributes` | `jsonb` | Arbitrary flat attributes |

Indexes cover `(timestamp, id)`, `(service, timestamp, id)`, and `(level, timestamp, id)` for deterministic pagination and the high-frequency filters. JSONB keeps attributes flexible, and `attributes ->> key` preserves the required text comparison. Message and arbitrary-attribute filters intentionally use the time index plus residual filtering: maintaining GIN indexes on every ingested row reduced sustained throughput below the required target. SQL values are parameterized, while bucket sizes and grouping columns use validated allowlists.

`log_rollups` stores append-only one-minute count deltas by bucket, service, and level. This removes hot-row update contention from the ingestion transaction. Larger buckets sum these rows. Queries with `q` or `attr.*` use raw logs because those values are not in the rollup.

## Retention

Logs are retained for 30 days by default. Every minute, the worker deletes up to 10,000 expired rows with `FOR UPDATE SKIP LOCKED` and applies matching negative rollup counts in the same transaction.

```bash
RETENTION_DAYS=7 docker compose up --build
```

## Dashboard and configuration

The Eventline dashboard is the only optional product feature. It is enabled by default, needs no configuration, and does not change the required API. It provides live metrics, log filtering and inspection, JSON export, and a batch-ingest console.

For frontend development:

```bash
npm --prefix dashboard run dev
```

| Variable | Default | Purpose |
|---|---:|---|
| `RETENTION_DAYS` | `30` | Log retention period |
| `DB_POOL_MAX` | `20` | Database connection pool size |

Authentication, multi-tenancy, active rate limiting, and alerting are not implemented. Plain `docker compose up` always starts the unauthenticated core service with no quotas.

## Performance

Measured on 2026-08-10 under the required limits:

- Application: 0.5 CPU and 256 MiB RAM
- PostgreSQL 16: 1 CPU and 1 GiB RAM
- Dataset after test: 2,251,500 rows
- Batch size: 100
- Duration: 30 seconds
- Concurrent aggregation: 1 request/second

| Result | Measured value |
|---|---:|
| Ingestion rate | 15,000 logs/second |
| Accepted / rejected | 450,000 / 0 |
| Dropped iterations | 0 |
| Ingestion HTTP failures | 0% |
| Overall HTTP p95 | 38.13 ms |
| Aggregation p95 | 24.80 ms |
| Application memory | 71.66 MiB |
| PostgreSQL memory | 405.8 MiB |

The main bottleneck was synchronous rollup updates on one current-minute row. Append-only deltas remove that contention and keep aggregation well under one second during ingestion. GIN search indexes were also tested, but their pending-list flushes caused severe throughput stalls under the one-CPU database limit, so they are not enabled.

Run the default load test:

```bash
npm run test:load
```

Overrides: `LOAD_BATCH_SIZE` (500), `LOAD_LOGS_PER_SECOND` (15000), `LOAD_DURATION` (30s), `LOAD_MODE` (both), and `LOAD_AGGREGATION_RATE` (1).

## Tests and CI

```bash
npm ci
npm run db:migrate
npm run build
npm run lint:dashboard
npm test
npm run test:smoke
```

The test suite covers validation, partial batch acceptance, filters, time boundaries, pagination, aggregation, and retention consistency. GitHub Actions builds the project, runs migrations and tests, and checks the API contract against a zero-configuration Compose stack.

## Known limitations

- Message and arbitrary-attribute searches can become slower over broad time ranges; provide `since` and `until` whenever possible.
- Aggregations with `q` or `attr.*` group matching raw rows rather than using rollups.
- Rollup deltas are not compacted in the background.
- Retention is row-batched rather than partition-based.
- Cursors are encoded but not signed or tied to a filter set.
