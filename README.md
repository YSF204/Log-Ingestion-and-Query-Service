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
POST /logs          validate -> COPY logs -> append rollup deltas -> commit
GET /logs           parse filters/cursor -> parameterized SQL -> return page
GET /logs/aggregate use rollups, or raw logs for q and attr.* filters
```

The backend follows a layered structure:

| Directory | Responsibility |
|---|---|
| `domain` | Database-independent log and rollup types and rules |
| `validation` and `schemas` | Request validation and query parsing |
| `repositories` | PostgreSQL reads, writes, aggregation, and maintenance |
| `services` | Use-case orchestration and ingestion queueing |
| `controllers` and `routes` | HTTP request and response handling |
| `workers` | Scheduled retention execution |

The `logs` table uses:

| Column | Type | Purpose |
|---|---|---|
| `id` | `bigint identity` | Unique ID and pagination tie-breaker |
| `timestamp` | `timestamptz` | Event time and retention key |
| `level` | `text` | Severity |
| `service` | `text` | Source service |
| `message` | `text` | Log message |
| `attributes` | `jsonb` | Arbitrary flat attributes |

Indexes cover `(timestamp, id)` and `(service, timestamp, id)` for deterministic pagination and the high-frequency filters. The query index migration also provides `(level, timestamp, id)` for severity-filtered reads and a `pg_trgm` GIN index for message substring search. JSONB keeps attributes flexible. A compact `jsonb_path_ops` GIN index finds attribute candidates, and a final `attributes ->> key` predicate preserves the required text comparison. Its buffered pending list amortizes index maintenance so forced GIN flushes do not stall ingestion. SQL values are parameterized, while bucket sizes and grouping columns use validated allowlists.

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
| `DB_READ_POOL_MAX` | `4` | Reserved database connections for query and aggregation traffic |
| `INGEST_COALESCE_MS` | `10` | Maximum wait in milliseconds for combining concurrent ingest requests |
| `INGEST_MAX_COALESCED_LOGS` | `50000` | Maximum logs written in one coalesced transaction |
| `INGEST_MAX_CONCURRENT_WRITERS` | `2` | Number of bounded COPY transactions allowed in parallel |
| `GIN_CLEANUP_IDLE_MS` | `2000` | Idle time before merging buffered attribute-index entries |

Authentication, multi-tenancy, active rate limiting, and alerting are not implemented. Plain `docker compose up` always starts the unauthenticated core service with no quotas.

## Performance

Measured on 2026-08-13 under the required limits:

- Application: 0.5 CPU and 256 MiB RAM
- PostgreSQL 16: 1 CPU and 1 GiB RAM
- Dataset contained 3.6 million rows before the sustained test
- Batch size: 500
- Duration: 120 seconds
- Concurrent aggregation: 1 request/second

| Result | Measured value |
|---|---:|
| Ingestion rate | 14,986 logs/second over total wall time; all 1,800,500 scheduled logs accepted |
| Accepted / rejected | 1,800,500 / 0 |
| Dropped iterations | 0 |
| Ingestion HTTP failures | 0% |
| Overall HTTP p95 | 707.22 ms |
| Aggregation p95 | 242.59 ms |

A separate 30,000 logs/second headroom probe against more than 7.7 million existing rows completed 765,000 logs at 20,842 logs/second over total wall time. It did not meet the full 30,000 target (271 iterations were dropped), but demonstrates useful throughput above the required 15,000 baseline without increasing the container limits.

The main bottlenecks were concurrent small write transactions, application-side per-entry processing, synchronous contention around hot data, and forced GIN pending-list flushes. The service uses a single-pass validator and PostgreSQL text COPY, serializes and coalesces concurrent requests into bounded transactions, stores append-only rollup deltas, and buffers attribute-index maintenance during sustained bursts. After ingestion has been idle for two seconds, the application asks PostgreSQL to merge the pending GIN entries. The message trigram index remains disabled because its write cost was not justified under the one-CPU database limit.

The Compose PostgreSQL service uses an 8 GiB WAL budget, compressed WAL, a 64 MiB WAL buffer, a longer checkpoint interval, and write-oriented background-writer settings. This prevents frequent forced checkpoints and backend WAL-buffer flushes from pausing ingestion and aggregation under sustained write load. The log identity sequence caches 1,000 values; IDs remain unique but may contain gaps after a restart.

Run the default load test:

```bash
npm run test:load
```

Overrides: `LOAD_BATCH_SIZE` (500), `LOAD_LOGS_PER_SECOND` (15000), `LOAD_DURATION` (120s), `LOAD_MODE` (both), and `LOAD_AGGREGATION_RATE` (1). Set `LOAD_RATE_STAGES=15000:30s,22500:60s,30000:60s` to run the staged headroom profile; when provided, it replaces the fixed ingestion rate and duration.

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
