import type { LogEntry } from '../api'
import { formatDateTime, formatRelativeTime } from '../utils'
import { Icon } from './Icon'
import { SeverityBadge } from './SeverityBadge'

type LogTableProps = {
  logs: LogEntry[]
  loading?: boolean
  compact?: boolean
  onSelect: (log: LogEntry) => void
}

export function LogTable({ logs, loading = false, compact = false, onSelect }: LogTableProps) {
  if (loading) {
    return (
      <div className="table-skeleton" aria-label="Loading logs">
        {Array.from({ length: compact ? 5 : 8 }, (_, index) => (
          <div className="skeleton" key={index} />
        ))}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="empty-state log-empty">
        <span className="empty-icon"><Icon name="inbox" /></span>
        <strong>No logs match this scope</strong>
        <p>Try a wider time range or remove one of the filters.</p>
      </div>
    )
  }

  return (
    <div className="log-table-wrap">
      <table className={`log-table${compact ? ' compact' : ''}`}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Level</th>
            <th>Service</th>
            <th>Message</th>
            {!compact && <th>Attributes</th>}
            <th><span className="sr-only">Open details</span></th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const attributes = Object.entries(log.attributes)
            return (
              <tr key={log.id}>
                <td className="time-cell">
                  <time dateTime={log.timestamp} title={formatDateTime(log.timestamp)}>
                    {formatRelativeTime(log.timestamp)}
                  </time>
                </td>
                <td><SeverityBadge level={log.level} /></td>
                <td><span className="service-name">{log.service}</span></td>
                <td className="message-cell">
                  <button type="button" onClick={() => onSelect(log)}>
                    {log.message}
                  </button>
                </td>
                {!compact && (
                  <td className="attributes-cell">
                    {attributes.length === 0
                      ? <span className="muted">—</span>
                      : attributes.slice(0, 2).map(([key, value]) => (
                          <span className="attribute-token" key={key}>
                            {key}=<b>{String(value)}</b>
                          </span>
                        ))}
                    {attributes.length > 2 && <span className="more-attributes">+{attributes.length - 2}</span>}
                  </td>
                )}
                <td className="open-cell">
                  <button type="button" className="row-open" onClick={() => onSelect(log)} aria-label={`Open log ${log.id}`}>
                    <Icon name="chevron-right" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
