# Log Ingestion and Query Service

A high-throughput TypeScript API backed by PostgreSQL. It accepts structured log batches, supports filtered queries and cursor pagination, returns time-bucketed counts, and removes expired data.

## Quick start

```bash
docker compose up 
```

The operational dashboard and API are available at `http://localhost:8080`. No environment file, authentication, separate frontend process, or manual migration step is required.

```bash
curl http://localhost:8080/health
```

## Architecture

PostgreSQL is the source of truth. The application is stateless and organized by responsibility:

```text
src/
├── controllers/   HTTP request and response handling
├── schemas/       Validation, query parsing, and cursor encoding
├── services/      Ingestion, querying, aggregation, rollups, retention
├── db/            Database client, schema, and shared SQL filters
├── workers/       Scheduled retention cleanup
├── routes/        Endpoint registration
├── tests/         Unit and integration tests
└── smoke/         Docker contract smoke test
```

Data flow:

```text
POST /logs
  → validate each entry
  → COPY valid rows into PostgreSQL
  → update one-minute rollups
  → commit one transaction

GET /logs
  → parse filters and cursor
  → build parameterized SQL
  → return timestamp/ID ordered page

GET /logs/aggregate
  → use rollups for the primary query
  → use raw logs when q or attr.* requires exact filtering
```

The ingestion hot path remains small: one PostgreSQL `COPY` and one grouped rollup upsert per accepted batch.

## Dashboard

The built-in **Eventline** dashboard is enabled by default and served by the application container at `http://localhost:8080`. It is additive: all required API endpoints keep their exact paths and response contracts.

Every value comes from the live service—there are no placeholder metrics. The dashboard provides:

- An operational overview derived from time-bucketed aggregates, including event volume, current rate, error ratio, active services, previous-period comparison, severity distribution, and recent events
- A log explorer with message, service, level, time-range, and arbitrary `attr.<key>` filters, cursor pagination, JSON export, and full event inspection
- A batch-ingest console that sends the exact `POST /logs` format and displays per-entry acceptance and rejection feedback
- Manual refresh, optional 15-second live refresh, light/dark appearances, keyboard search focus (`Ctrl/⌘ K`), mobile navigation, and reduced-motion/transparency support

For frontend-only development, start the API and then run:

```bash
npm --prefix dashboard run dev
```

Vite proxies `/health` and `/logs` to `localhost:8080`. Production assets are built by `npm run build` and served from the same origin by Express.

## API

### Health

```http
GET /health
```

Returns `200` only after the database is connected and migrations have completed.

### Ingest logs

```http
POST /logs
Content-Type: application/json
```

```json
{
  "logs": [
    {
      "timestamp": "2026-08-08T12:00:00.000Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": {
        "user_id": "42",
        "region": "eu-west",
        "retries": 3
      }
    }
  ]
}
```

Validation rules:

- `timestamp`: valid ISO 8601 and no more than five minutes in the future
- `level`: `debug`, `info`, `warn`, or `error`
- `service` and `message`: non-empty strings
- `attributes`: optional flat object containing string, number, or boolean values

Entries are validated independently. Valid entries are stored even when other entries in the batch are rejected.

```json
{
  "accepted": 9,
  "rejected": [
    { "index": 3, "reason": "invalid log entry" }
  ]
}
```

Returns `200` when at least one entry is accepted. Returns `400` for malformed JSON, invalid top-level structure, or a completely rejected batch.

### Query logs

```http
GET /logs
```

| Parameter | Description |
|---|---|
| `service` | Exact service match |
| `level` | Exact level match |
| `since` | Inclusive start timestamp |
| `until` | Exclusive end timestamp |
| `attr.<key>` | Attribute equality compared as text |
| `q` | Case-insensitive message substring |
| `limit` | Default `100`, maximum `1000` |
| `cursor` | Opaque cursor from the previous response |

Results are ordered by timestamp descending and then ID descending.

```json
{
  "logs": [],
  "next_cursor": null
}
```

Keep the same filters when requesting the next page. Invalid parameters return `400` as `{"error":"<description>"}`.

### Aggregate logs

```http
GET /logs/aggregate
```

Required parameters are `since`, `until`, and `bucket`. Supported buckets are `1m`, `5m`, `1h`, and `1d`. Optional `group_by` values are `service` and `level`. All normal log filters except pagination are also supported.

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

Buckets are ordered by start time ascending. Empty buckets are omitted and `group` is `null` when `group_by` is absent.

## Database design

### Logs

The `logs` table contains:

| Column | Type | Purpose |
|---|---|---|
| `id` | `bigint identity` | Unique ID and pagination tie-breaker |
| `timestamp` | `timestamptz` | Event time and retention key |
| `level` | `text` | Severity |
| `service` | `text` | Producing service |
| `message` | `text` | Searchable message |
| `attributes` | `jsonb` | Arbitrary flat attributes |

Indexes match the main query patterns:

- `timestamp`
- `(service, timestamp)`
- `(level, timestamp)`

### Attributes

JSONB allows arbitrary attribute keys without schema changes. Filters use `attributes ->> key`, so strings, numbers, and booleans are compared using their text representation as required by the API contract.

SQL values are always parameterized. Bucket sizes and grouping columns come from validated allowlists.

### Rollups

`log_rollups` stores one-minute counts keyed by `(bucket_start, service, level)`. Larger buckets are calculated from these rows. This keeps the primary aggregation query fast while ingestion is active.

Queries containing message or attribute filters use raw logs because those dimensions are not present in the rollup table.

## Retention

`RETENTION_DAYS` defaults to `30`. Every minute the worker deletes at most 10,000 expired rows using `FOR UPDATE SKIP LOCKED`.

The same transaction decrements the matching rollup counts. This keeps raw queries and aggregate queries consistent without a long-running unbounded delete.

```bash
RETENTION_DAYS=7 docker compose up --build
```

## Performance

Measured on 2026-08-08 with the required limits:

- Application: 0.5 CPU, 256 MiB RAM
- PostgreSQL 16: 1 CPU, 1 GiB RAM
- Batch size: 500
- Concurrent aggregation: 1 request/second
- Dataset: 1,050,000 newly ingested rows

| Result | Measured value |
|---|---:|
| Ingestion rate | 15,000 logs/second |
| Rejected logs | 0 |
| Dropped iterations | 0 |
| HTTP failures | 0% |
| Overall HTTP p95 | 262.26 ms |
| Aggregation p95 | 100.37 ms |
| Application peak memory | 92.72 MiB |
| PostgreSQL peak memory | 372.4 MiB |

The main bottleneck was batch size. A batch size of 100 required 150 transactions/second and reached about 10.4k logs/second. Increasing the batch to 500 reduced that to 30 transactions/second and sustained the target without dropped work.

Run the default workload:

```bash
npm run test:load
```

Useful overrides:

| Variable | Default |
|---|---:|
| `LOAD_BATCH_SIZE` | `500` |
| `LOAD_LOGS_PER_SECOND` | `15000` |
| `LOAD_DURATION` | `30s` |
| `LOAD_MODE` | `both` |
| `LOAD_AGGREGATION_RATE` | `1` |

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `RETENTION_DAYS` | `30` | Log retention period |
| `DB_POOL_MAX` | `20` | PostgreSQL connection pool limit |

The dashboard is the only optional product feature currently implemented. It is enabled by default, requires no environment variables, and does not alter API behavior. Authentication, multi-tenancy, rate limiting, and alerting are not implemented. Therefore, plain `docker compose up` always starts the required unauthenticated core service with no quotas.

## Tests and CI

```bash
npm ci
npm run db:migrate
npm run build
npm run lint:dashboard
npm test
npm run test:smoke
```

The 47-test suite covers validation, partial batch acceptance, filters, time boundaries, cursor pagination, aggregation, and retention/rollup consistency.

GitHub Actions runs the type-check, migrations, tests, Docker build, and a contract smoke test against a zero-configuration Compose stack.

## Known limitations

- Maximum throughput depends on clients sending sufficiently large batches.
- Message and arbitrary-attribute searches do not have specialized indexes.
- Filtered aggregations using `q` or `attr.*` scan raw matching rows.
- Retention is row-batched rather than partition-based.
- Cursors are encoded but not signed or tied to a filter set.
