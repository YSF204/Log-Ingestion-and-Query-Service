import { LogDetailSheet } from '@/components/LogDetailSheet'
import { ScopeBar } from '@/components/ScopeBar'
import { useDashboardShell } from '@/components/dashboard-shell-context'
import { Explore } from '@/views/Explore'
import { Ingest } from '@/views/Ingest'
import { Overview } from '@/views/Overview'

export function Dashboard() {
  const {
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
  } = useDashboardShell()

  return (
    <>
      {activeView !== 'ingest' && (
        <ScopeBar
          key={JSON.stringify(filters)}
          filters={filters}
          isRefreshing={busy}
          live={live}
          onApply={changeFilters}
          onRefresh={refresh}
          onLiveChange={setLive}
        />
      )}

      <div className="view-container">
        {activeView === 'overview' && (
          <Overview
            key={`overview-${refreshKey}`}
            filters={queryFilters}
            refreshKey={refreshKey}
            onBusyChange={onBusyChange}
            onSelectLog={setSelectedLog}
            onOpenExplore={() => changeView('explore')}
            onOpenIngest={() => changeView('ingest')}
          />
        )}
        {activeView === 'explore' && (
          <Explore
            key={`explore-${refreshKey}`}
            filters={queryFilters}
            refreshKey={refreshKey}
            onBusyChange={onBusyChange}
            onSelectLog={setSelectedLog}
            onOpenIngest={() => changeView('ingest')}
          />
        )}
        {activeView === 'ingest' && (
          <Ingest
            onIngested={refresh}
            onOpenExplore={() => changeView('explore')}
          />
        )}
      </div>

      <LogDetailSheet
        key={selectedLog?.id ?? 'empty'}
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </>
  )
}
