import { useEffect, useState } from 'react'

import { ApiError, getLogs, type LogEntry, type QueryFilters } from '../api'
import { Icon } from '../components/Icon'
import { LogTable } from '../components/LogTable'
import { downloadJson, formatCount } from '../utils'

type ExploreProps = {
  filters: QueryFilters
  refreshKey: number
  onBusyChange: (busy: boolean) => void
  onSelectLog: (log: LogEntry) => void
  onOpenIngest: () => void
}

export function Explore({
  filters,
  refreshKey,
  onBusyChange,
  onSelectLog,
  onOpenIngest,
}: ExploreProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    getLogs(filters, { limit: 100, signal: controller.signal })
      .then((result) => {
        setLogs(result.logs)
        setNextCursor(result.next_cursor)
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setError(caught instanceof ApiError ? caught.message : 'Could not query logs.')
        setLogs([])
        setNextCursor(null)
      })
      .finally(() => {
        if (controller.signal.aborted) return
        setLoading(false)
        onBusyChange(false)
      })

    return () => controller.abort()
  }, [filters, onBusyChange, refreshKey])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const result = await getLogs(filters, { limit: 100, cursor: nextCursor })
      setLogs((current) => [...current, ...result.logs])
      setNextCursor(result.next_cursor)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the next page.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="view explore-view">
      <section className="view-intro compact-intro">
        <div>
          <span className="eyebrow">Deterministic, newest first</span>
          <h1>Log explorer</h1>
          <p>Search message content, combine dimensions, and inspect exact event context.</p>
        </div>
        <div className="intro-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={logs.length === 0}
            onClick={() => downloadJson(`eventline-logs-${new Date().toISOString()}.json`, { logs })}
          >
            <Icon name="download" /> Export loaded
          </button>
          <button type="button" className="primary-button" onClick={onOpenIngest}>
            <Icon name="send" /> Ingest batch
          </button>
        </div>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          <span><Icon name="database" /></span>
          <div><strong>Query failed</strong><p>{error}</p></div>
        </div>
      )}

      <section className="surface explorer-surface">
        <header className="section-heading table-section-heading explorer-heading">
          <div>
            <span className="eyebrow">Query result</span>
            <h2>Matching events</h2>
          </div>
          <div className="result-count" aria-live="polite">
            {loading ? 'Querying…' : `${formatCount(logs.length)}${nextCursor ? '+' : ''} ${logs.length === 1 ? 'event' : 'events'}`}
          </div>
        </header>

        <LogTable logs={logs} loading={loading} onSelect={onSelectLog} />

        {!loading && logs.length > 0 && (
          <footer className="table-footer">
            <p>
              Showing {formatCount(logs.length)} loaded events
              {nextCursor ? '. More results are available.' : '. End of matching results.'}
            </p>
            {nextCursor && (
              <button
                type="button"
                className="secondary-button"
                onClick={loadMore}
                disabled={loadingMore}
              >
                <Icon name="arrow-down" className={loadingMore ? 'pulse' : ''} />
                {loadingMore ? 'Loading…' : 'Load next 100'}
              </button>
            )}
          </footer>
        )}
      </section>
    </div>
  )
}
