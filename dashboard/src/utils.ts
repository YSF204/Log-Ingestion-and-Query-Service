import type { QueryFilters } from './api'
import type { DashboardFilters, PresetRange } from './dashboard-types'

const PRESET_MILLISECONDS: Record<PresetRange, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
}

export function toQueryFilters(filters: DashboardFilters, now = new Date()): QueryFilters {
  const range = filters.range.type === 'preset'
    ? {
        since: new Date(now.getTime() - PRESET_MILLISECONDS[filters.range.value]),
        until: now,
      }
    : {
        since: new Date(filters.range.since),
        until: new Date(filters.range.until),
      }

  if (
    Number.isNaN(range.since.getTime()) ||
    Number.isNaN(range.until.getTime()) ||
    range.until <= range.since
  ) {
    throw new Error('Choose a valid time range with “Until” later than “Since”.')
  }

  return {
    service: filters.service.trim() || undefined,
    level: filters.level || undefined,
    q: filters.q.trim() || undefined,
    attributes: filters.attributes,
    since: range.since.toISOString(),
    until: range.until.toISOString(),
  }
}

export function getAggregationBucket(filters: QueryFilters): '1m' | '5m' | '1h' | '1d' {
  const duration = new Date(filters.until).getTime() - new Date(filters.since).getTime()
  if (duration <= 90 * 60_000) return '1m'
  if (duration <= 12 * 60 * 60_000) return '5m'
  if (duration <= 3 * 24 * 60 * 60_000) return '1h'
  return '1d'
}

export function getPreviousRange(filters: QueryFilters): QueryFilters {
  const since = new Date(filters.since).getTime()
  const until = new Date(filters.until).getTime()
  const duration = until - since
  return {
    ...filters,
    since: new Date(since - duration).toISOString(),
    until: new Date(until - duration).toISOString(),
  }
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value)
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

export function formatShortTime(value: string, spanMilliseconds: number): string {
  const options: Intl.DateTimeFormatOptions = spanMilliseconds > 24 * 60 * 60_000
    ? { month: 'short', day: 'numeric' }
    : { hour: 'numeric', minute: '2-digit' }
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value))
}

export function formatRelativeTime(value: string): string {
  const deltaSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(deltaSeconds) < 60) return formatter.format(deltaSeconds, 'second')
  const minutes = Math.round(deltaSeconds / 60)
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  return formatter.format(Math.round(hours / 24), 'day')
}

export function toDateTimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function downloadJson(filename: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob(
    [JSON.stringify(value, null, 2)],
    { type: 'application/json' },
  ))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
