import {
  Activity,
  ArrowDown,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  Database,
  Download,
  Inbox,
  Layers3,
  ListFilter,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Sun,
  Terminal,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'

export type IconName =
  | 'activity'
  | 'arrow-down'
  | 'check'
  | 'chevron-right'
  | 'clock'
  | 'close'
  | 'code'
  | 'copy'
  | 'database'
  | 'download'
  | 'filter'
  | 'inbox'
  | 'layers'
  | 'moon'
  | 'pause'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'send'
  | 'spark'
  | 'sun'
  | 'terminal'

const icons: Record<IconName, LucideIcon> = {
  activity: Activity,
  'arrow-down': ArrowDown,
  check: Check,
  'chevron-right': ChevronRight,
  clock: Clock3,
  close: X,
  code: Code2,
  copy: Copy,
  database: Database,
  download: Download,
  filter: ListFilter,
  inbox: Inbox,
  layers: Layers3,
  moon: Moon,
  pause: Pause,
  play: Play,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  send: Send,
  spark: Sparkles,
  sun: Sun,
  terminal: Terminal,
}

type IconProps = LucideProps & { name: IconName }

export function Icon({ name, ...props }: IconProps) {
  const Component = icons[name]
  return <Component aria-hidden="true" strokeWidth={1.8} {...props} />
}
