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
    pressedGlow: string
    iconBg: string
    iconText: string
    silkscreen: string
    ring: string
    swatch: string
    label: string
  }
> = {
  slate: {
    card: 'bg-[#151922] border-white/[0.08]',
    pressedGlow: 'border-zinc-300/35 shadow-[0_0_16px_rgba(244,244,245,0.08)]',
    iconBg: 'bg-white/[0.07]',
    iconText: 'text-zinc-200',
    silkscreen: 'text-zinc-400',
    ring: 'ring-zinc-400/50',
    swatch: 'bg-zinc-400',
    label: '石墨',
  },
  blue: {
    card: 'bg-[#121a2a] border-blue-400/20',
    pressedGlow: 'border-blue-400/55 shadow-[0_0_18px_rgba(59,130,246,0.28)]',
    iconBg: 'bg-blue-500/20',
    iconText: 'text-blue-300',
    silkscreen: 'text-blue-300/85',
    ring: 'ring-blue-400/60',
    swatch: 'bg-blue-400',
    label: '湛蓝',
  },
  emerald: {
    card: 'bg-[#101f1b] border-emerald-400/20',
    pressedGlow: 'border-emerald-400/55 shadow-[0_0_18px_rgba(16,185,129,0.28)]',
    iconBg: 'bg-emerald-500/20',
    iconText: 'text-emerald-300',
    silkscreen: 'text-emerald-300/85',
    ring: 'ring-emerald-400/60',
    swatch: 'bg-emerald-400',
    label: '翡翠',
  },
  amber: {
    card: 'bg-[#211a10] border-amber-400/20',
    pressedGlow: 'border-amber-400/55 shadow-[0_0_18px_rgba(245,158,11,0.26)]',
    iconBg: 'bg-amber-500/20',
    iconText: 'text-amber-300',
    silkscreen: 'text-amber-300/85',
    ring: 'ring-amber-400/60',
    swatch: 'bg-amber-400',
    label: '琥珀',
  },
  rose: {
    card: 'bg-[#221319] border-rose-400/22',
    pressedGlow: 'border-rose-400/55 shadow-[0_0_18px_rgba(244,63,94,0.28)]',
    iconBg: 'bg-rose-500/20',
    iconText: 'text-rose-300',
    silkscreen: 'text-rose-300/85',
    ring: 'ring-rose-400/60',
    swatch: 'bg-rose-400',
    label: '绯红',
  },
  violet: {
    card: 'bg-[#1a1528] border-violet-400/20',
    pressedGlow: 'border-violet-400/55 shadow-[0_0_18px_rgba(139,92,246,0.28)]',
    iconBg: 'bg-violet-500/20',
    iconText: 'text-violet-300',
    silkscreen: 'text-violet-300/85',
    ring: 'ring-violet-400/60',
    swatch: 'bg-violet-400',
    label: '星紫',
  },
}

export const ACCENT_KEYS: TileAccent[] = ['slate', 'blue', 'emerald', 'amber', 'rose', 'violet']
