import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

import { getHealth, type LogEntry } from '@/api'
import {
  DEFAULT_FILTERS,
  type DashboardFilters,
  type ViewName,
} from '@/dashboard-types'
import { toQueryFilters } from '@/utils'
import { Icon, type IconName } from '@/components/Icon'
import {
  DashboardShellContext,
  type DashboardShellContextValue,
} from '@/components/dashboard-shell-context'
import '@/App.css'

type Theme = 'light' | 'dark'
type Health = 'checking' | 'ready' | 'unavailable'

const navigation: Array<{
  id: ViewName
  label: string
  description: string
  icon: IconName
}> = [
  { id: 'overview', label: 'Overview', description: 'Operational pulse', icon: 'activity' },
  { id: 'explore', label: 'Explore', description: 'Search every event', icon: 'search' },
  { id: 'ingest', label: 'Ingest', description: 'Send a log batch', icon: 'terminal' },
]

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('eventline-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function AppShell({ children }: PropsWithChildren) {
  const [activeView, setActiveView] = useState<ViewName>('overview')
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())
  const [live, setLive] = useState(true)
  const [busy, setBusy] = useState(true)
  const [health, setHealth] = useState<Health>('checking')
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  const queryFilters = useMemo(
    () => toQueryFilters(filters, lastRefreshed),
    [filters, lastRefreshed],
  )

  const checkHealth = useCallback(async () => {
    try {
      const response = await getHealth()
      setHealth(response.status === 'ok' && response.database === 'connected' ? 'ready' : 'unavailable')
    } catch {
      setHealth('unavailable')
    }
  }, [])

  const refresh = useCallback(() => {
    setBusy(true)
    setLastRefreshed(new Date())
    setRefreshKey((key) => key + 1)
    void checkHealth()
  }, [checkHealth])

  const changeFilters = useCallback((next: DashboardFilters) => {
    setBusy(true)
    setFilters(next)
    setLastRefreshed(new Date())
    setRefreshKey((key) => key + 1)
  }, [])

  const changeView = useCallback((view: ViewName) => {
    setActiveView(view)
    setSelectedLog(null)
    setBusy(view !== 'ingest')
  }, [])

  const onBusyChange = useCallback((nextBusy: boolean) => setBusy(nextBusy), [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('eventline-theme', theme)
  }, [theme])

  useEffect(() => {
    getHealth()
      .then((response) => setHealth(
        response.status === 'ok' && response.database === 'connected'
          ? 'ready'
          : 'unavailable',
      ))
      .catch(() => setHealth('unavailable'))
    const interval = window.setInterval(() => void checkHealth(), 30_000)
    return () => window.clearInterval(interval)
  }, [checkHealth])

  useEffect(() => {
    if (!live || activeView === 'ingest') return
    const interval = window.setInterval(refresh, 15_000)
    return () => window.clearInterval(interval)
  }, [activeView, live, refresh])

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.scope-search input')?.focus()
      }
    }
    document.addEventListener('keydown', focusSearch)
    return () => document.removeEventListener('keydown', focusSearch)
  }, [])

  const context = useMemo<DashboardShellContextValue>(() => ({
    activeView,
    busy,
    changeFilters,
    changeView,
    filters,
    live,
    onBusyChange,
    queryFilters,
    refresh,
    refreshKey,
    selectedLog,
    setLive,
    setSelectedLog,
  }), [
    activeView,
    busy,
    changeFilters,
    changeView,
    filters,
    live,
    onBusyChange,
    queryFilters,
    refresh,
    refreshKey,
    selectedLog,
  ])

  return (
    <DashboardShellContext.Provider value={context}>
      <div className="app-shell">
        <aside className="sidebar">
          <button className="brand" type="button" onClick={() => changeView('overview')} aria-label="Eventline overview">
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
            <span><strong>Eventline</strong><small>Log observatory</small></span>
          </button>

          <nav className="primary-nav" aria-label="Dashboard navigation">
            <span className="nav-label">Workspace</span>
            {navigation.map((item) => (
              <button
                type="button"
                key={item.id}
                className={activeView === item.id ? 'is-current' : ''}
                onClick={() => changeView(item.id)}
                aria-current={activeView === item.id ? 'page' : undefined}
              >
                <span className="nav-icon"><Icon name={item.icon} /></span>
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            ))}
          </nav>

          <div className="sidebar-foot">
            <div className="storage-note">
              <Icon name="database" />
              <span><strong>PostgreSQL</strong><small>Source of truth</small></span>
            </div>
            <div className={`health-card health-${health}`}>
              <span className="health-indicator" />
              <span>
                <strong>{health === 'ready' ? 'API ready' : health === 'checking' ? 'Checking API' : 'API unavailable'}</strong>
                <small>{health === 'ready' ? 'Database connected' : health === 'checking' ? 'Connecting…' : 'Check the service'}</small>
              </span>
            </div>
          </div>
        </aside>

        <main className="workspace">
          <header className="topbar">
            <div className="mobile-brand">
              <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
              <strong>Eventline</strong>
            </div>
            <div className="breadcrumb">
              <span>Logs</span>
              <Icon name="chevron-right" />
              <strong>{navigation.find((item) => item.id === activeView)?.label}</strong>
            </div>
            <div className="topbar-actions">
              <span className={`compact-health health-${health}`}>
                <i /> {health === 'ready' ? 'Connected' : health === 'checking' ? 'Checking' : 'Offline'}
              </span>
              <button
                type="button"
                className="icon-button theme-toggle"
                onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} appearance`}
              >
                <Icon name={theme === 'light' ? 'moon' : 'sun'} />
              </button>
            </div>
          </header>

          {children}
        </main>

        <nav className="mobile-nav" aria-label="Dashboard navigation">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={activeView === item.id ? 'is-current' : ''}
              onClick={() => changeView(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </DashboardShellContext.Provider>
  )
}
