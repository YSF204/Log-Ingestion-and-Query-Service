import { useMemo, useState, type MouseEvent } from 'react'

import type { AggregateBucket, LogLevel } from '../api'
import { formatCount, formatShortTime } from '../utils'
import { Icon } from './Icon'

type BucketSize = '1m' | '5m' | '1h' | '1d'

type TimeSeriesChartProps = {
  buckets: AggregateBucket[]
  bucketSize: BucketSize
  since: string
  until: string
  loading: boolean
}

const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
const bucketMilliseconds: Record<BucketSize, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
}

const colors: Record<LogLevel, string> = {
  debug: 'var(--level-debug)',
  info: 'var(--level-info)',
  warn: 'var(--level-warn)',
  error: 'var(--level-error)',
}

const width = 920
const height = 270
const plot = { left: 48, right: 16, top: 18, bottom: 34 }

export function TimeSeriesChart({
  buckets,
  bucketSize,
  since,
  until,
  loading,
}: TimeSeriesChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const data = useMemo(() => buildSeries(buckets, bucketSize, since, until), [
    buckets,
    bucketSize,
    since,
    until,
  ])

  const plotWidth = width - plot.left - plot.right
  const plotHeight = height - plot.top - plot.bottom
  const xAt = (index: number) => plot.left + (data.starts.length <= 1
    ? plotWidth / 2
    : (index / (data.starts.length - 1)) * plotWidth)
  const yAt = (value: number) => plot.top + plotHeight - (value / data.max) * plotHeight

  const handleMove = (event: MouseEvent<SVGSVGElement>) => {
    if (!data.starts.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * width
    const percentage = Math.min(1, Math.max(0, (relativeX - plot.left) / plotWidth))
    setHoveredIndex(Math.round(percentage * (data.starts.length - 1)))
  }

  if (loading) {
    return <div className="chart-skeleton skeleton" aria-label="Loading event timeline" />
  }

  if (data.total === 0) {
    return (
      <div className="chart-empty empty-state">
        <span className="empty-icon"><Icon name="activity" /></span>
        <strong>No events in this range</strong>
        <p>Adjust the scope or ingest a batch to begin plotting activity.</p>
      </div>
    )
  }

  const hover = hoveredIndex === null ? null : {
    index: hoveredIndex,
    start: data.starts[hoveredIndex],
  }

  return (
    <div className="timeline-chart">
      <div className="chart-legend" aria-label="Severity totals">
        {levels.map((level) => (
          <div key={level} className="legend-item">
            <span style={{ backgroundColor: colors[level] }} />
            <span>{level}</span>
            <strong>{formatCount(data.totals[level])}</strong>
          </div>
        ))}
      </div>

      <div className="chart-canvas">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Log events over time, split by severity"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <desc>Counts of debug, info, warning, and error logs in each time bucket.</desc>
          {data.ticks.map((value) => {
            const y = yAt(value)
            return (
              <g key={value}>
                <line className="chart-grid" x1={plot.left} x2={width - plot.right} y1={y} y2={y} />
                <text className="chart-axis-label" x={plot.left - 10} y={y + 4} textAnchor="end">
                  {formatCount(value)}
                </text>
              </g>
            )
          })}

          {levels.map((level) => {
            const values = data.series[level]
            const path = values.map((value, index) => (
              `${index === 0 ? 'M' : 'L'} ${xAt(index)} ${yAt(value)}`
            )).join(' ')
            return (
              <path
                key={level}
                className="chart-line"
                d={path}
                stroke={colors[level]}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          {hover && hover.start !== undefined && (
            <g className="chart-hover">
              <line
                x1={xAt(hover.index)}
                x2={xAt(hover.index)}
                y1={plot.top}
                y2={plot.top + plotHeight}
              />
              {levels.map((level) => (
                <circle
                  key={level}
                  cx={xAt(hover.index)}
                  cy={yAt(data.series[level][hover.index] ?? 0)}
                  r="4"
                  fill={colors[level]}
                />
              ))}
            </g>
          )}

          {data.labelIndexes.map((index) => (
            <text
              key={index}
              className="chart-axis-label"
              x={xAt(index)}
              y={height - 8}
              textAnchor={index === 0 ? 'start' : index === data.starts.length - 1 ? 'end' : 'middle'}
            >
              {formatShortTime(new Date(data.starts[index] ?? 0).toISOString(), data.span)}
            </text>
          ))}
        </svg>

        {hover && hover.start !== undefined && (
          <div
            className="chart-tooltip"
            style={{ left: `${(xAt(hover.index) / width) * 100}%` }}
          >
            <time>{formatShortTime(new Date(hover.start).toISOString(), data.span)}</time>
            {levels.map((level) => (
              <span key={level}>
                <i style={{ backgroundColor: colors[level] }} />
                {level}
                <strong>{formatCount(data.series[level][hover.index] ?? 0)}</strong>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function buildSeries(
  buckets: AggregateBucket[],
  bucketSize: BucketSize,
  since: string,
  until: string,
) {
  const step = bucketMilliseconds[bucketSize]
  const sinceTime = new Date(since).getTime()
  const untilTime = new Date(until).getTime()
  const first = Math.floor(sinceTime / step) * step
  const starts: number[] = []
  for (let timestamp = first; timestamp < untilTime && starts.length < 500; timestamp += step) {
    starts.push(timestamp)
  }

  const indexByTime = new Map(starts.map((start, index) => [start, index]))
  const series = Object.fromEntries(levels.map((level) => [
    level,
    Array.from({ length: starts.length }, () => 0),
  ])) as Record<LogLevel, number[]>

  for (const bucket of buckets) {
    if (!bucket.group || !levels.includes(bucket.group as LogLevel)) continue
    const start = new Date(bucket.start).getTime()
    const index = indexByTime.get(start)
    if (index !== undefined) series[bucket.group as LogLevel][index] = bucket.count
  }

  const totals = Object.fromEntries(levels.map((level) => [
    level,
    series[level].reduce((sum, value) => sum + value, 0),
  ])) as Record<LogLevel, number>
  const max = Math.max(1, ...levels.flatMap((level) => series[level]))
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0)
  const lastIndex = Math.max(0, starts.length - 1)
  const labelIndexes = Array.from(new Set([0, Math.round(lastIndex / 2), lastIndex]))
  const ticks = max <= 4
    ? Array.from({ length: max + 1 }, (_, index) => max - index)
    : Array.from(new Set([max, 0.75, 0.5, 0.25, 0].map((value) => (
        value <= 1 ? Math.round(max * value) : value
      ))))

  return {
    starts,
    series,
    totals,
    total,
    max,
    ticks,
    labelIndexes,
    span: untilTime - sinceTime,
  }
}
