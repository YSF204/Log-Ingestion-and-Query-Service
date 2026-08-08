export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogAttributes = Record<string, string | number | boolean>

export type LogEntry = {
  id: string
  timestamp: string
  level: LogLevel
  service: string
  message: string
  attributes: LogAttributes
}

export type AttributeFilter = {
  key: string
  value: string
}

export type QueryFilters = {
  service?: string
  level?: LogLevel
  q?: string
  since: string
  until: string
  attributes: AttributeFilter[]
}

export type LogsResponse = {
  logs: LogEntry[]
  next_cursor: string | null
}

export type AggregateBucket = {
  start: string
  group: string | null
  count: number
}

export type AggregateResponse = {
  buckets: AggregateBucket[]
}

export type IngestResponse = {
  accepted: number
  rejected: Array<{ index: number; reason: string }>
}

export type HealthResponse = {
  status: string
  database: string
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

function filtersToParams(filters: QueryFilters): URLSearchParams {
  const params = new URLSearchParams({
    since: filters.since,
    until: filters.until,
  })

  if (filters.service) params.set('service', filters.service)
  if (filters.level) params.set('level', filters.level)
  if (filters.q) params.set('q', filters.q)

  for (const attribute of filters.attributes) {
    params.append(`attr.${attribute.key}`, attribute.value)
  }

  return params
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('Could not reach the log service.', 0)
  }

  const body = await response.json().catch(() => null) as
    | { error?: string }
    | T
    | null

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body
      ? body.error
      : undefined
    throw new ApiError(message || `Request failed with status ${response.status}.`, response.status)
  }

  return body as T
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('/health', { signal })
}

export function getLogs(
  filters: QueryFilters,
  options: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<LogsResponse> {
  const params = filtersToParams(filters)
  params.set('limit', String(options.limit ?? 100))
  if (options.cursor) params.set('cursor', options.cursor)

  return request<LogsResponse>(`/logs?${params.toString()}`, {
    signal: options.signal,
  })
}

export function getAggregate(
  filters: QueryFilters,
  options: {
    bucket: '1m' | '5m' | '1h' | '1d'
    groupBy?: 'service' | 'level'
    signal?: AbortSignal
  },
): Promise<AggregateResponse> {
  const params = filtersToParams(filters)
  params.set('bucket', options.bucket)
  if (options.groupBy) params.set('group_by', options.groupBy)

  return request<AggregateResponse>(`/logs/aggregate?${params.toString()}`, {
    signal: options.signal,
  })
}

export function ingestLogs(body: unknown): Promise<IngestResponse> {
  return request<IngestResponse>('/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
