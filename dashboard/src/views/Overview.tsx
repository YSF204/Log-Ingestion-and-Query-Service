import { useEffect, useMemo, useState } from 'react'

import {
  ApiError,
  getAggregate,
  getLogs,
  type AggregateBucket,
  type LogEntry,
  type QueryFilters,
} from '../api'
import { Icon } from '../components/Icon'
import { LogTable } from '../components/LogTable'
import { TimeSeriesChart } from '../components/TimeSeriesChart'
import {
  formatCount,
  getAggregationBucket,
  getPreviousRange,
} from '../utils'

type OverviewProps = {
  filters: QueryFilters
  refreshKey: number
  onBusyChange: (busy: boolean) => void
  onSelectLog: (log: LogEntry) => void
  onOpenExplore: () => void
  onOpenIngest: () => void
}

type OverviewData = {
  byLevel: AggregateBucket[]
  byService: AggregateBucket[]
  previous: AggregateBucket[]
  recent: LogEntry[]
}

const emptyData: OverviewData = {
  byLevel: [],
  byService: [],
  previous: [],
  recent: [],
}

const bucketMinutes = { '1m': 1, '5m': 5, '1h': 60, '1d': 1440 }

export function Overview({
  filters,
  refreshKey,
  onBusyChange,
  onSelectLog,
  onOpenExplore,
  onOpenIngest,
}: OverviewProps) {
  const [data, setData] = useState<OverviewData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const bucket = getAggregationBucket(filters)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      getAggregate(filters, { bucket, groupBy: 'level', signal: controller.signal }),
      getAggregate(filters, { bucket, groupBy: 'service', signal: controller.signal }),
      getAggregate(getPreviousRange(filters), { bucket, signal: controller.signal }),
      getLogs(filters, { limit: 8, signal: controller.signal }),
    ])
      .then(([byLevel, byService, previous, recent]) => {
        setData({
          byLevel: byLevel.buckets,
          byService: byService.buckets,
          previous: previous.buckets,
          recent: recent.logs,
        })
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setError(caught instanceof ApiError ? caught.message : 'Could not load dashboard data.')
      })
      .finally(() => {
        if (controller.signal.aborted) return
        setLoading(false)
        onBusyChange(false)
      })

    return () => controller.abort()
  }, [bucket, filters, onBusyChange, refreshKey])

  const metrics = useMemo(() => calculateMetrics(data, filters, bucket), [data, filters, bucket])

  return (
    <div className="view overview-view">
      <section className="view-intro">
        <div>
          <span className="eyebrow">Operational pulse</span>
          <h1>Know what your systems are saying.</h1>
          <p>Live volume, severity, and service signals from the selected query scope.</p>
        </div>
        <div className="intro-actions">
          <button type="button" className="secondary-button" onClick={onOpenExplore}>
            <Icon name="search" /> Explore logs
          </button>
          <button type="button" className="primary-button" onClick={onOpenIngest}>
            <Icon name="send" /> Ingest batch
          </button>
        </div>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          <span><Icon name="database" /></span>
          <div><strong>Dashboard data is unavailable</strong><p>{error}</p></div>
        </div>
      )}

      <section className="metric-grid" aria-label="Log metrics">
        <Metric
          label="Events"
          value={formatCount(metrics.total)}
          detail={metrics.trendLabel}
          tone={metrics.trendTone}
          loading={loading}
        />
        <Metric
          label="Latest rate"
          value={`${formatCount(metrics.latestPerMinute)}/min`}
          detail={`${bucket} sampling bucket`}
          loading={loading}
        />
        <Metric
          label="Error ratio"
          value={`${metrics.errorRatio.toFixed(metrics.errorRatio >= 10 ? 0 : 1)}%`}
          detail={`${formatCount(metrics.errors)} error events`}
          tone={metrics.errorRatio > 5 ? 'negative' : 'neutral'}
          loading={loading}
        />
        <Metric
          label="Active services"
          value={formatCount(metrics.services.length)}
          detail={metrics.topService ? `${metrics.topService.name} leads volume` : 'No active services'}
          loading={loading}
        />
      </section>

      <section className="surface timeline-surface">
        <header className="section-heading">
          <div>
            <span className="eyebrow">Volume by severity</span>
            <h2>Event timeline</h2>
          </div>
          <span className="bucket-label"><Icon name="clock" /> {bucket} buckets</span>
        </header>
        <TimeSeriesChart
          buckets={data.byLevel}
          bucketSize={bucket}
          since={filters.since}
          until={filters.until}
          loading={loading}
        />
      </section>

      <div className="overview-secondary-grid">
        <section className="surface service-surface">
          <header className="section-heading">
            <div>
              <span className="eyebrow">Traffic ownership</span>
              <h2>Services</h2>
            </div>
            <span className="count-label">{metrics.services.length}</span>
          </header>
          {loading ? (
            <div className="service-skeleton">
              {Array.from({ length: 5 }, (_, index) => <div className="skeleton" key={index} />)}
            </div>
          ) : metrics.services.length === 0 ? (
            <div className="empty-state compact-empty">
              <Icon name="layers" />
              <strong>No service activity</strong>
              <p>Services appear after matching logs arrive.</p>
            </div>
          ) : (
            <ol className="service-list">
              {metrics.services.slice(0, 6).map((service) => (
                <li key={service.name}>
                  <div className="service-row">
                    <span className="service-rank">{service.rank}</span>
                    <strong>{service.name}</strong>
                    <span>{formatCount(service.count)}</span>
                  </div>
                  <div className="service-bar" aria-hidden="true">
                    <span style={{ width: `${service.percentage}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="surface signal-surface">
          <header className="section-heading">
            <div>
              <span className="eyebrow">Signal quality</span>
              <h2>Severity mix</h2>
            </div>
          </header>
          {loading ? (
            <div className="severity-mix-skeleton skeleton" />
          ) : metrics.total === 0 ? (
            <div className="empty-state compact-empty">
              <Icon name="activity" />
              <strong>No severity signal</strong>
              <p>The mix is calculated from matching events.</p>
            </div>
          ) : (
            <>
              <div className="severity-strip" aria-label="Severity distribution">
                {metrics.severity.map((item) => item.count > 0 && (
                  <span
                    key={item.level}
                    className={`strip-${item.level}`}
                    style={{ width: `${item.percentage}%` }}
                    title={`${item.level}: ${item.percentage.toFixed(1)}%`}
                  />
                ))}
              </div>
              <dl className="severity-breakdown">
                {metrics.severity.map((item) => (
                  <div key={item.level}>
                    <dt><span className={`severity-dot level-${item.level}`} />{item.level}</dt>
                    <dd><strong>{formatCount(item.count)}</strong><span>{item.percentage.toFixed(1)}%</span></dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </section>
      </div>

      <section className="surface recent-surface">
        <header className="section-heading table-section-heading">
          <div>
            <span className="eyebrow">Newest first</span>
            <h2>Recent events</h2>
          </div>
          <button type="button" className="text-button" onClick={onOpenExplore}>
            Open explorer <Icon name="chevron-right" />
          </button>
        </header>
        <LogTable logs={data.recent} loading={loading} compact onSelect={onSelectLog} />
      </section>
    </div>
  )
}

type MetricProps = {
  label: string
  value: string
  detail: string
  tone?: 'positive' | 'negative' | 'neutral'
  loading: boolean
}

function Metric({ label, value, detail, tone = 'neutral', loading }: MetricProps) {
  return (
    <article className="metric">
      <span>{label}</span>
      {loading ? <div className="metric-value-skeleton skeleton" /> : <strong>{value}</strong>}
      <small className={`metric-detail ${tone}`}>{detail}</small>
    </article>
  )
}

function calculateMetrics(
  data: OverviewData,
  filters: QueryFilters,
  bucket: '1m' | '5m' | '1h' | '1d',
) {
  const levelCounts = new Map<string, number>()
  for (const row of data.byLevel) {
    if (row.group) levelCounts.set(row.group, (levelCounts.get(row.group) ?? 0) + row.count)
  }
  const total = Array.from(levelCounts.values()).reduce((sum, value) => sum + value, 0)
  const previous = data.previous.reduce((sum, row) => sum + row.count, 0)
  const trend = previous > 0 ? ((total - previous) / previous) * 100 : null
  const errors = levelCounts.get('error') ?? 0

  const serviceCounts = new Map<string, number>()
  for (const row of data.byService) {
    if (row.group) serviceCounts.set(row.group, (serviceCounts.get(row.group) ?? 0) + row.count)
  }
  const maxService = Math.max(1, ...serviceCounts.values())
  const services = Array.from(serviceCounts, ([name, count]) => ({ name, count }))
    .sort((first, second) => second.count - first.count)
    .map((service, index) => ({
      ...service,
      rank: index + 1,
      percentage: (service.count / maxService) * 100,
    }))

  const until = new Date(filters.until).getTime()
  const bucketMs = bucketMinutes[bucket] * 60_000
  const latestStart = Math.floor((until - 1) / bucketMs) * bucketMs
  const latestCount = data.byLevel
    .filter((row) => new Date(row.start).getTime() === latestStart)
    .reduce((sum, row) => sum + row.count, 0)

  const severity = (['debug', 'info', 'warn', 'error'] as const).map((level) => {
    const count = levelCounts.get(level) ?? 0
    return { level, count, percentage: total > 0 ? (count / total) * 100 : 0 }
  })

  return {
    total,
    errors,
    errorRatio: total > 0 ? (errors / total) * 100 : 0,
    latestPerMinute: Math.round(latestCount / bucketMinutes[bucket]),
    services,
    topService: services[0],
    severity,
    trendTone: trend === null ? 'neutral' as const : trend >= 0 ? 'positive' as const : 'negative' as const,
    trendLabel: trend === null
      ? 'No previous-period baseline'
      : `${trend >= 0 ? '↑' : '↓'} ${Math.abs(trend).toFixed(1)}% vs previous period`,
  }
}
