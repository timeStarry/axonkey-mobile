import type { LucideIcon } from 'lucide-react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Clipboard,
  Command,
  Copy,
  CornerDownLeft,
  Delete,
  FileCode,
  FolderOpen,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  SkipBack,
  SkipForward,
  Sparkles,
  Terminal,
  Undo2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react'
import type { TileAccent } from '../protocol/types'

export const CONTROLLED_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  send: Send,
  check: Check,
  undo: Undo2,
  terminal: Terminal,
  copy: Copy,
  clipboard: Clipboard,
  enter: CornerDownLeft,
  esc: X,
  search: Search,
  save: Save,
  plus: Plus,
  refresh: RefreshCw,
  code: FileCode,
  folder: FolderOpen,
  mic: Mic,
  zap: Zap,
  command: Command,
  delete: Delete,
  play: Play,
  pause: Pause,
  'skip-back': SkipBack,
  'skip-forward': SkipForward,
  'volume-up': Volume2,
  'volume-mute': VolumeX,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
}

export const ICON_KEYS = Object.keys(CONTROLLED_ICONS)

export function getTileIcon(iconName: string): LucideIcon {
  return CONTROLLED_ICONS[iconName] ?? Zap
}

export const ACCENT_STYLES: Record<
  TileAccent,
  {
    card: string
    iconBg: string
    iconText: string
    ring: string
    swatch: string
    label: string
  }
> = {
  slate: {
    card: 'bg-[#171b24] border-white/[0.08] hover:border-white/[0.15]',
    iconBg: 'bg-zinc-500/15',
    iconText: 'text-zinc-200',
    ring: 'ring-zinc-400/50',
    swatch: 'bg-zinc-400',
    label: '石墨',
  },
  blue: {
    card: 'bg-[#131c2e] border-blue-400/20 hover:border-blue-400/35',
    iconBg: 'bg-blue-500/20',
    iconText: 'text-blue-300',
    ring: 'ring-blue-400/60',
    swatch: 'bg-blue-400',
    label: '湛蓝',
  },
  emerald: {
    card: 'bg-[#11221d] border-emerald-400/20 hover:border-emerald-400/35',
    iconBg: 'bg-emerald-500/20',
    iconText: 'text-emerald-300',
    ring: 'ring-emerald-400/60',
    swatch: 'bg-emerald-400',
    label: '翡翠',
  },
  amber: {
    card: 'bg-[#241c11] border-amber-400/20 hover:border-amber-400/35',
    iconBg: 'bg-amber-500/20',
    iconText: 'text-amber-300',
    ring: 'ring-amber-400/60',
    swatch: 'bg-amber-400',
    label: '琥珀',
  },
  rose: {
    card: 'bg-[#26141b] border-rose-400/20 hover:border-rose-400/35',
    iconBg: 'bg-rose-500/20',
    iconText: 'text-rose-300',
    ring: 'ring-rose-400/60',
    swatch: 'bg-rose-400',
    label: '绯红',
  },
  violet: {
    card: 'bg-[#1c162b] border-violet-400/20 hover:border-violet-400/35',
    iconBg: 'bg-violet-500/20',
    iconText: 'text-violet-300',
    ring: 'ring-violet-400/60',
    swatch: 'bg-violet-400',
    label: '星紫',
  },
}

export const ACCENT_KEYS: TileAccent[] = ['slate', 'blue', 'emerald', 'amber', 'rose', 'violet']
