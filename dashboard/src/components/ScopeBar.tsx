import { useState, type FormEvent } from 'react'

import type { AttributeFilter } from '../api'
import {
  DEFAULT_FILTERS,
  type DashboardFilters,
  type PresetRange,
} from '../dashboard-types'
import { toDateTimeLocal, toQueryFilters } from '../utils'
import { Icon } from './Icon'

type ScopeBarProps = {
  filters: DashboardFilters
  isRefreshing: boolean
  live: boolean
  onApply: (filters: DashboardFilters) => void
  onRefresh: () => void
  onLiveChange: (live: boolean) => void
}

const presets: Array<{ value: PresetRange; label: string }> = [
  { value: '15m', label: 'Last 15 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
]

function customRangeFromNow() {
  const now = new Date()
  return {
    type: 'custom' as const,
    since: toDateTimeLocal(new Date(now.getTime() - 60 * 60_000)),
    until: toDateTimeLocal(now),
  }
}

export function ScopeBar({
  filters,
  isRefreshing,
  live,
  onApply,
  onRefresh,
  onLiveChange,
}: ScopeBarProps) {
  const [draft, setDraft] = useState(filters)
  const [attribute, setAttribute] = useState<AttributeFilter>({ key: '', value: '' })
  const [attributeOpen, setAttributeOpen] = useState(false)
  const [error, setError] = useState('')
  const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘ K' : 'Ctrl K'

  const apply = (event: FormEvent) => {
    event.preventDefault()
    try {
      toQueryFilters(draft)
      setError('')
      onApply({
        ...draft,
        service: draft.service.trim(),
        q: draft.q.trim(),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid filters.')
    }
  }

  const addAttribute = () => {
    const key = attribute.key.trim()
    if (!key) {
      setError('Attribute keys cannot be empty.')
      return
    }
    if (key.includes('.')) {
      setError('Attribute keys cannot contain a period.')
      return
    }
    setDraft((current) => ({
      ...current,
      attributes: [
        ...current.attributes.filter((item) => item.key !== key),
        { key, value: attribute.value },
      ],
    }))
    setAttribute({ key: '', value: '' })
    setAttributeOpen(false)
    setError('')
  }

  const clearFilters = () => {
    setError('')
    setDraft(DEFAULT_FILTERS)
    onApply(DEFAULT_FILTERS)
  }

  const hasFilters = Boolean(
    filters.service || filters.level || filters.q || filters.attributes.length,
  )

  return (
    <section className="scope" aria-label="Log query scope">
      <form className="scope-form" onSubmit={apply}>
        <label className="scope-search">
          <Icon name="search" />
          <span className="sr-only">Search message content</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
            placeholder="Search messages"
          />
          <kbd>{shortcutLabel}</kbd>
        </label>

        <label className="field compact-field service-field">
          <span>Service</span>
          <input
            value={draft.service}
            onChange={(event) => setDraft({ ...draft, service: event.target.value })}
            placeholder="All services"
          />
        </label>

        <label className="field compact-field select-field level-field">
          <span>Level</span>
          <select
            value={draft.level}
            onChange={(event) => setDraft({
              ...draft,
              level: event.target.value as DashboardFilters['level'],
            })}
          >
            <option value="">All levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </label>

        <label className="field compact-field select-field range-field">
          <span>Range</span>
          <select
            value={draft.range.type === 'preset' ? draft.range.value : 'custom'}
            onChange={(event) => {
              const value = event.target.value
              setDraft({
                ...draft,
                range: value === 'custom'
                  ? customRangeFromNow()
                  : { type: 'preset', value: value as PresetRange },
              })
            }}
          >
            {presets.map((preset) => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
            <option value="custom">Custom range</option>
          </select>
        </label>

        <div className="attribute-control">
          <button
            className={`icon-button filter-button${draft.attributes.length ? ' is-active' : ''}`}
            type="button"
            aria-label="Filter by attributes"
            aria-expanded={attributeOpen}
            onClick={() => setAttributeOpen((open) => !open)}
          >
            <Icon name="filter" />
            {draft.attributes.length > 0 && <span>{draft.attributes.length}</span>}
          </button>
          {attributeOpen && (
            <div className="attribute-popover materialize">
              <div className="popover-heading">
                <div>
                  <strong>Attribute equality</strong>
                  <span>Values are compared as text.</span>
                </div>
                <button
                  type="button"
                  className="icon-button small"
                  onClick={() => setAttributeOpen(false)}
                  aria-label="Close attribute filter"
                >
                  <Icon name="close" />
                </button>
              </div>
              <label className="field">
                <span>Key</span>
                <input
                  autoFocus
                  value={attribute.key}
                  onChange={(event) => setAttribute({ ...attribute, key: event.target.value })}
                  placeholder="request_id"
                />
              </label>
              <label className="field">
                <span>Value</span>
                <input
                  value={attribute.value}
                  onChange={(event) => setAttribute({ ...attribute, value: event.target.value })}
                  placeholder="req_42"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addAttribute()
                    }
                  }}
                />
              </label>
              <button type="button" className="primary-button full" onClick={addAttribute}>
                <Icon name="plus" /> Add attribute
              </button>
            </div>
          )}
        </div>

        <button className="apply-button" type="submit">Apply</button>
      </form>

      {draft.range.type === 'custom' && (
        <div className="custom-range materialize">
          <label className="field">
            <span>Since · inclusive</span>
            <input
              type="datetime-local"
              value={draft.range.since}
              onChange={(event) => {
                const since = event.target.value
                setDraft((current) => current.range.type === 'custom'
                  ? { ...current, range: { ...current.range, since } }
                  : current)
              }}
            />
          </label>
          <Icon name="chevron-right" />
          <label className="field">
            <span>Until · exclusive</span>
            <input
              type="datetime-local"
              value={draft.range.until}
              onChange={(event) => {
                const until = event.target.value
                setDraft((current) => current.range.type === 'custom'
                  ? { ...current, range: { ...current.range, until } }
                  : current)
              }}
            />
          </label>
        </div>
      )}

      {(filters.attributes.length > 0 || hasFilters) && (
        <div className="active-filters" aria-label="Active filters">
          {filters.q && <span className="filter-chip">Message contains “{filters.q}”</span>}
          {filters.service && <span className="filter-chip">Service · {filters.service}</span>}
          {filters.level && <span className={`filter-chip level-${filters.level}`}>Level · {filters.level}</span>}
          {filters.attributes.map((item) => (
            <button
              className="filter-chip removable"
              type="button"
              key={item.key}
              onClick={() => onApply({
                ...filters,
                attributes: filters.attributes.filter((candidate) => candidate.key !== item.key),
              })}
            >
              {item.key} = {item.value} <Icon name="close" />
            </button>
          ))}
          <button type="button" className="clear-button" onClick={clearFilters}>Clear filters</button>
        </div>
      )}

      <div className="scope-utilities">
        <button
          type="button"
          className={`live-control${live ? ' is-live' : ''}`}
          onClick={() => onLiveChange(!live)}
          aria-pressed={live}
        >
          <span className="live-dot" />
          {live ? 'Live · 15s' : 'Live paused'}
        </button>
        <button
          type="button"
          className="refresh-button"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <Icon name="refresh" className={isRefreshing ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {error && <p className="inline-error" role="alert">{error}</p>}
    </section>
  )
}
