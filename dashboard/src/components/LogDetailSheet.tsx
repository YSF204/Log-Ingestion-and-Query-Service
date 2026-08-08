import { useEffect, useState } from 'react'

import type { LogEntry } from '../api'
import { formatDateTime } from '../utils'
import { Icon } from './Icon'
import { SeverityBadge } from './SeverityBadge'

type LogDetailSheetProps = {
  log: LogEntry | null
  onClose: () => void
}

export function LogDetailSheet({ log, onClose }: LogDetailSheetProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!log) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [log, onClose])

  if (!log) return null

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(log, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <aside className="detail-sheet materialize" aria-label={`Log ${log.id} details`}>
      <header className="sheet-header">
        <div>
          <span className="eyebrow">Event detail</span>
          <h2>Log {log.id}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close log details">
          <Icon name="close" />
        </button>
      </header>

      <div className="sheet-content">
        <div className="detail-lead">
          <SeverityBadge level={log.level} />
          <p>{log.message}</p>
        </div>

        <dl className="detail-list">
          <div><dt>Service</dt><dd>{log.service}</dd></div>
          <div><dt>Timestamp</dt><dd><time dateTime={log.timestamp}>{formatDateTime(log.timestamp)}</time></dd></div>
          <div><dt>Event ID</dt><dd className="mono">{log.id}</dd></div>
        </dl>

        <section className="detail-section">
          <div className="section-heading small-heading">
            <div>
              <span className="eyebrow">Context</span>
              <h3>Attributes</h3>
            </div>
            <span className="count-label">{Object.keys(log.attributes).length}</span>
          </div>
          {Object.keys(log.attributes).length === 0 ? (
            <p className="muted">No attributes were attached to this event.</p>
          ) : (
            <dl className="attribute-list">
              {Object.entries(log.attributes).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="detail-section">
          <div className="section-heading small-heading">
            <div>
              <span className="eyebrow">Raw event</span>
              <h3>JSON</h3>
            </div>
            <button type="button" className="secondary-button compact" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="json-preview"><code>{JSON.stringify(log, null, 2)}</code></pre>
        </section>
      </div>
    </aside>
  )
}
