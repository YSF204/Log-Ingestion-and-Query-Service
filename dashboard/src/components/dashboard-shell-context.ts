import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'

import type { LogEntry, QueryFilters } from '@/api'
import type { DashboardFilters, ViewName } from '@/dashboard-types'

export type DashboardShellContextValue = {
  activeView: ViewName
  busy: boolean
  changeFilters: (filters: DashboardFilters) => void
  changeView: (view: ViewName) => void
  filters: DashboardFilters
  live: boolean
  onBusyChange: (busy: boolean) => void
  queryFilters: QueryFilters
  refresh: () => void
  refreshKey: number
  selectedLog: LogEntry | null
  setLive: Dispatch<SetStateAction<boolean>>
  setSelectedLog: Dispatch<SetStateAction<LogEntry | null>>
}

export const DashboardShellContext = createContext<DashboardShellContextValue | null>(null)

export function useDashboardShell() {
  const context = useContext(DashboardShellContext)
  if (!context) throw new Error('useDashboardShell must be used inside AppShell')
  return context
}
