import type { LogLevel } from '../api'

export function SeverityBadge({ level }: { level: LogLevel }) {
  return (
    <span className={`severity severity-${level}`}>
      <span />
      {level}
    </span>
  )
}
