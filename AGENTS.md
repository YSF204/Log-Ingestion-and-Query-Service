# Final Project: Log Ingestion and Query Service

## 1. Overview

Build a service that ingests high volumes of structured logs, stores them efficiently, and allows users to query and aggregate them.

Think of it as a simplified version of Datadog or Grafana Loki: applications send logs to your API, and your service makes those logs searchable and analyzable.

**Expected timeline:** 1–2 weeks

---

# 2. What You Are Building

Your service must address three main concerns:

## 2.1 Ingestion

An API that accepts individual or batched structured log entries, validates them, and stores them efficiently.

## 2.2 Querying

An API that supports filtering logs by:

- Service
- Level
- Time range
- Attributes
- Message content

It must also support aggregating logs into time buckets and grouping them by supported dimensions.

## 2.3 Retention

Logs should not be stored indefinitely. Provide a configurable retention policy for deleting expired data.

---

# 3. Log Entry Structure

A log entry must contain:

- A timestamp
- A level: `debug`, `info`, `warn`, or `error`
- A service name
- A message
- A collection of arbitrary key/value attributes, such as:
  - `user_id`
  - `request_id`
  - `region`

How you store and query the attribute collection is one of the most important design decisions in this project.

---

# 4. Load and Performance Expectations

This service will be tested under load.

A load generator will run against the service and verify that:

- Ingestion remains reliable
- Queries remain fast
- The system contains more than one million rows

A solution that is correct but cannot meet the performance requirements is not considered complete.

---

# 5. Core Requirements

Implement the required API contract exactly as described below.

The service must:

- Support per-entry validation for ingestion batches
- Support freely combinable query filters
- Support time-bucketed aggregation
- Support cursor-based pagination

The complete system must start with:

```bash
docker compose up
```

The service must include a README covering:

- Setup and usage
- API documentation
- Schema and index design
- Attribute storage strategy
- Retention strategy
- Measured performance results
- Known limitations
- Any optional features implemented
- How to enable or disable optional features

---

# 6. Resource Limits

The solution will run with the following container limits:

| Container | Limits |
|---|---|
| Application container | 0.5 CPU and 256 MB RAM |
| PostgreSQL container | 1 CPU and 1 GB RAM |

Additional infrastructure may be used, provided that PostgreSQL remains the source of truth for both reads and writes.

---

# 7. Required API Contract

The same automated load generator will be run against every submission.

It expects the exact endpoints, paths, and response structures described below.

You may add additional endpoints, but the required endpoints must exist exactly as specified.

If the load generator cannot communicate with your service, the submission cannot be graded.

The service must:

- Listen on port `8080` inside the application container
- Be exposed as `localhost:8080` in `docker-compose.yml`

---

# 8. Health Endpoint

## `GET /health`

Returns HTTP `200` with any response body once the service is ready to accept traffic.

The service should only report itself as healthy after:

- The database connection has been established
- Database migrations have been applied
- The service is ready to accept logs

The load generator will poll this endpoint before starting.

---

# 9. Ingest Logs Endpoint

## `POST /logs`

This endpoint always accepts a batch.

A batch containing one log entry is valid.

## 9.1 Request Example

```json
{
  "logs": [
    {
      "timestamp": "2026-07-20T14:32:01.123Z",
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

---

## 9.2 Validation Rules

Each log entry must satisfy the following rules:

| Field | Rules |
|---|---|
| `timestamp` | Required. Must be a valid ISO 8601 timestamp. Must not be more than five minutes in the future. |
| `level` | Required. Must be one of: `debug`, `info`, `warn`, `error`. |
| `service` | Required. Must be a non-empty string. |
| `message` | Required. Must be a non-empty string. |
| `attributes` | Optional. Must be a flat object. Values may be strings, numbers, or booleans. Nested objects and arrays are not allowed. |

---

## 9.3 Batch Behavior

An invalid entry must not cause the entire batch to fail.

The service must:

- Accept valid entries
- Reject invalid entries
- Return the array index and rejection reason for each invalid entry

---

## 9.4 Response Rules

Return HTTP `200` when at least one entry is accepted.

Return HTTP `400` when:

- All entries are rejected
- The request body contains malformed JSON
- The request does not match the expected top-level structure

## 9.5 Example Response

```json
{
  "accepted": 9,
  "rejected": [
    {
      "index": 3,
      "reason": "invalid level: 'critical'"
    }
  ]
}
```

---

# 10. Query Logs Endpoint

## `GET /logs`

All query parameters are optional and may be freely combined.

## 10.1 Query Parameters

| Parameter | Meaning | Example |
|---|---|---|
| `service` | Exact service-name match | `service=checkout` |
| `level` | Exact level match | `level=error` |
| `since` | Inclusive start of the time range | `since=2026-07-20T14:00:00Z` |
| `until` | Exclusive end of the time range | `until=2026-07-20T15:00:00Z` |
| `attr.<key>` | Attribute equality, compared as strings | `attr.user_id=42` |
| `q` | Case-insensitive substring match on message | `q=declined` |
| `limit` | Maximum number of results. Default `100`, maximum `1000` | `limit=500` |
| `cursor` | Opaque cursor returned by a previous response | `cursor=eyJpZCI6...` |

---

## 10.2 Sorting

Results must be sorted by timestamp in descending order.

The ordering must remain deterministic when multiple logs have the same timestamp.

---

## 10.3 Response Example

```json
{
  "logs": [
    {
      "id": "any-unique-id",
      "timestamp": "2026-07-20T14:32:01.123Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": {
        "user_id": "42"
      }
    }
  ],
  "next_cursor": "eyJpZCI6..."
}
```

`next_cursor` must be `null` when no additional results are available.

The cursor format is implementation-defined. The load generator will treat it as an opaque value and pass it back unchanged.

---

## 10.4 Invalid Parameters

Return HTTP `400` with the following structure when query parameters are invalid:

```json
{
  "error": "<description>"
}
```

Examples of invalid input include:

- Invalid timestamps
- `until` earlier than `since`
- Unsupported log levels
- Non-numeric limits
- Limits outside the supported range
- Invalid or malformed cursors

---

# 11. Aggregate Logs Endpoint

## `GET /logs/aggregate`

This endpoint returns time-bucketed log counts.

It supports the same filters as `GET /logs`:

- `service`
- `level`
- `attr.<key>`
- `q`

It also accepts the following aggregation parameters:

| Parameter | Required | Meaning | Example |
|---|---|---|---|
| `since` | Yes | Inclusive start of the aggregation range | `since=2026-07-20T14:00:00Z` |
| `until` | Yes | Exclusive end of the aggregation range | `until=2026-07-20T15:00:00Z` |
| `bucket` | Yes | Bucket size: `1m`, `5m`, `1h`, or `1d` | `bucket=1m` |
| `group_by` | No | Group results by `service` or `level` | `group_by=service` |

---

## 11.1 Aggregate Response Rules

Return one row for each bucket and group combination.

Results must be ordered by bucket start time in ascending order.

Empty buckets may be omitted.

When `group_by` is not provided, `group` must be `null`.

## 11.2 Response Example

```json
{
  "buckets": [
    {
      "start": "2026-07-20T14:00:00Z",
      "group": "checkout",
      "count": 118
    },
    {
      "start": "2026-07-20T14:00:00Z",
      "group": "auth",
      "count": 42
    },
    {
      "start": "2026-07-20T14:01:00Z",
      "group": "checkout",
      "count": 97
    }
  ]
}
```

Invalid parameters must return HTTP `400` using the same error format as `GET /logs`.

---

# 12. Optional Features and the Load Generator Contract

Everything beyond this API contract, including retention configuration, administrative APIs, dashboards, and internal architecture, is left to your design, subject to the rules below.

We run one load generator against every submission.

It is written once and is not customized per candidate.

Anything you add on top of the core service must keep that single load generator working without any per-project configuration.

---

# 13. The Golden Rule

Extras are additive, never subtractive.

An optional feature may add:

- Endpoints
- Headers
- Response fields
- Configuration

It must never:

- Remove or rename a required endpoint
- Change the shape or types of a required response
- Introduce a new required request parameter or header on a required endpoint
- Cause a request that would have succeeded on the core service to fail

If a feature cannot satisfy this, it must be disabled by default.

---

# 14. Default Posture: Zero Configuration

A plain:

```bash
docker compose up
```

with no environment file, no arguments, and no manual setup must produce a service that:

- Serves `GET /health`, `POST /logs`, `GET /logs`, and `GET /logs/aggregate` exactly as specified
- Accepts unauthenticated requests on all four endpoints
- Applies no rate limit, quota, or tenancy restriction that the load generator could hit

This is the configuration used for performance grading.

If the README must be read to get a request through, the submission is treated as failing the contract.

---

# 15. Authentication and API Keys

If you implement authentication, API keys, or multi-tenancy, follow this contract exactly.

## 15.1 Configuration

| Variable | Default | Meaning |
|---|---|---|
| `AUTH_ENABLED` | `false` | Master switch for all authentication and authorization |
| `LOADGEN_API_KEY` | unset | Key seeded at startup with full ingest and query permissions |

---

## 15.2 Authentication Rules

`AUTH_ENABLED` must default to `false`.

With it unset or set to `false`, the service behaves exactly as the unauthenticated core service.

When `AUTH_ENABLED=true` and `LOADGEN_API_KEY` is set:

- The service must idempotently seed that key at startup
- The key must be seeded before the service reports healthy
- The key must have permission to ingest and query all data
- Restarting the service must not invalidate it

Seeding must be part of startup or migration.

No admin call, SQL snippet, or manual step may be required.

If `AUTH_ENABLED=true` and `LOADGEN_API_KEY` is unset:

- The service must still start
- The service must remain healthy
- It simply has no seeded key

---

## 15.3 Credential Transport

Primary credential format:

```http
Authorization: Bearer <key>
```

You may additionally accept:

```http
X-API-Key: <key>
```

But `Authorization: Bearer` must always work.

Credentials must never go in:

- Query string
- Request body

---

## 15.4 Authentication Status Codes

| Condition | Status | Body |
|---|---|---|
| Missing or malformed credential | `401` | `{"error": "<description>"}` |
| Valid credential, insufficient scope | `403` | `{"error": "<description>"}` |
| Rate limit or quota exceeded | `429` | `{"error": "<description>"}` plus `Retry-After` header |

Authentication failures must never return:

- `500`
- `200` with an empty result set

---

## 15.5 Exemptions

`GET /health` is always unauthenticated, regardless of `AUTH_ENABLED`.

The load generator polls it before it has any credentials.

The load generator is not told in advance whether your build has authentication.

It always sends:

```http
Authorization: Bearer <key>
```

on the three data endpoints.

When `AUTH_ENABLED=false`, an unrecognized `Authorization` header must be ignored, not rejected.

---

# 16. Multi-Tenancy

If logs are scoped per tenant:

- The seeded load generator key must resolve to exactly one tenant
- All four required endpoints must operate within that tenant transparently
- Tenant identity must never be a required request parameter
- Tenant identity must be derived from the credential
- Response shapes must not change

---

# 17. Rate Limiting and Backpressure

Rate limiting must be off by default, or must exempt the seeded load generator key.

Backpressure is legitimate engineering.

Shedding load with `429` or `503` plus `Retry-After` is better than crashing.

However, the load generator counts shed requests as not ingested. They do not contribute to your throughput number.

Never respond `200` to a batch you have not durably accepted.

---

# 18. CI Requirement

Your pipeline must run the required-contract smoke test in both configurations:

## 18.1 Configuration 1

```env
AUTH_ENABLED=false
```

All four endpoints must be reachable with no credentials.

## 18.2 Configuration 2

```env
AUTH_ENABLED=true
LOADGEN_API_KEY=<key>
```

All four endpoints must be:

- Reachable with the seeded bearer token
- Rejected with `401` without it

If you implement no optional features, only the first configuration applies.

---

# 19. README Requirement

The README must list:

- Every optional feature implemented
- Each optional feature’s default state
- The environment variables that control each optional feature
- Confirmation that `docker compose up` with no configuration yields the plain core service

---

# 20. Performance Targets

The solution will be tested using an external load generator.

The solution must meet the following baseline targets:

- Sustain at least 15,000 logs per second
- Avoid dropped requests and application crashes during sustained ingestion
- Return the primary aggregation query in under 1 second at p95
- Maintain query performance while ingestion is active
- Handle approximately 1,000,000 stored log records
- Assume those records represent approximately one month of data
- Make newly ingested data queryable within 20 seconds
- Support one aggregation request per second during the ingestion test

The environment will be limited to:

| Container | Limits |
|---|---|
| PostgreSQL | 1 CPU and 1 GB RAM |
| Application | 0.5 CPU and 256 MB RAM |

Higher ingestion throughput may earn additional credit.

Examples:

- 20,000 logs per second
- 25,000 logs per second
- Higher sustained rates

Run your own load tests before submitting.

---

# 21. README Performance Results

Include the following in the README:

- Test environment
- Dataset size
- Batch size
- Ingestion rate
- Query rate
- Query latency percentiles
- Resource usage
- Bottlenecks discovered
- Optimizations applied

The goal is to show evidence that you measured the system rather than relying on assumptions.

---

# 22. What Is Being Evaluated

This project is intentionally underspecified.

How you fill in the gaps is part of the evaluation.

| Area | What Is Being Evaluated |
|---|---|
| Architecture | Schema design, attribute storage strategy, data flow, and project structure |
| Performance | Indexes aligned with query patterns, ingestion throughput, query latency, and behavior under concurrent load |
| Retention | Expired-data deletion without long-running locks, excessive table bloat, or major ingestion disruption |
| Reliability | Validation, error handling, malformed input handling, empty ranges, invalid cursors, and other edge cases |
| Code quality | Readable TypeScript, strong typing, clear abstractions, and maintainable structure |
| Security | Parameterized queries and safe dynamic-query construction. SQL injection is disqualifying |
| Separation of concerns | Query-building and persistence logic separated from HTTP handlers |
| Infrastructure | A Docker Compose setup that works on the first run and applies migrations automatically |
| CI | A meaningful pipeline that builds, tests, and validates the project |
| Documentation | Clear setup instructions, API documentation, design reasoning, measured results, and acknowledged limitations |
| Creativity and polish | Useful improvements beyond the minimum requirements |

---

# 23. Stretch Goals

Stretch goals are optional.

Prioritize a reliable and performant core implementation over incomplete extras.

Anything built here must comply with the Optional Features and Load Generator Contract.

In particular:

- Authentication must be off by default
- API keys must be off by default
- Multi-tenancy must be off by default
- Rate limiting must be off by default
- Every optional feature must be documented in the README

Possible additions include:

- A dashboard for viewing and filtering logs
- Operational metrics for ingestion and query performance
- Alerting rules that trigger a webhook when an error threshold is exceeded
- A live-tail endpoint
- Pre-aggregated rollup tables
- A custom query language
- Multi-tenancy using API keys
- Data compression
- Rate limiting
- Dead-letter handling
- Backpressure support
- Additional observability

You may also propose and implement your own enhancement.

---

# 24. Deliverables

## 24.1 GitHub Repository

The repository should include:

- Clean and readable commit history
- Visible incremental progress

## 24.2 Working Docker Compose Setup

The complete solution must start with:

```bash
docker compose up
```

## 24.3 Passing CI Pipeline

The pipeline should perform meaningful:

- Build steps
- Test steps
- Validation steps

## 24.4 README

The README must include:

- Setup instructions
- API documentation
- Schema design
- Index design
- Attribute storage strategy
- Retention strategy
- Load-test methodology
- Measured performance results
- Known limitations
- Optional features, their defaults, and their configuration variables

## 24.5 Demo

Be prepared to walk through the project.

You should be able to:

- Explain the architecture and major trade-offs
- Justify the schema and indexes
- Run `EXPLAIN` or `EXPLAIN ANALYZE` on important queries
- Trace ingestion and query code paths
- Debug or extend a feature live