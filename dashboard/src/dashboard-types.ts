import type { AttributeFilter, LogLevel } from './api'

export type ViewName = 'overview' | 'explore' | 'ingest'

export type PresetRange = '15m' | '1h' | '6h' | '24h' | '7d'

export type TimeRange =
  | { type: 'preset'; value: PresetRange }
  | { type: 'custom'; since: string; until: string }

export type DashboardFilters = {
  service: string
  level: '' | LogLevel
  q: string
  attributes: AttributeFilter[]
  range: TimeRange
}

export const DEFAULT_FILTERS: DashboardFilters = {
  service: '',
  level: '',
  q: '',
  attributes: [],
  range: { type: 'preset', value: '1h' },
}
