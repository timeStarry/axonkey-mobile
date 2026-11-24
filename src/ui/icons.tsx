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
  Home,
  Keyboard,
  LayoutGrid,
  Menu,
  Mic,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  Send,
  SkipBack,
  SkipForward,
  Sparkles,
  Terminal,
  Undo2,
  Volume1,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react'
import type { TileAccent } from '../protocol/types'

export const CONTROLLED_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  zap: Zap,
  enter: CornerDownLeft,
  check: Check,
  esc: X,
  power: Power,
  home: Home,
  menu: Menu,
  command: Command,
  search: Search,
  undo: Undo2,
  play: Play,
  pause: Pause,
  'skip-back': SkipBack,
  'skip-forward': SkipForward,
  'volume-up': Volume2,
  'volume-down': Volume1,
  'volume-mute': VolumeX,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  copy: Copy,
  clipboard: Clipboard,
  terminal: Terminal,
  code: FileCode,
  folder: FolderOpen,
  save: Save,
  send: Send,
  mic: Mic,
  keyboard: Keyboard,
  mouse: MousePointer2,
  layout: LayoutGrid,
  plus: Plus,
  refresh: RefreshCw,
  delete: Delete,
}

export const ICON_KEYS = Object.keys(CONTROLLED_ICONS)

export function getTileIcon(iconName: string): LucideIcon {
  return CONTROLLED_ICONS[iconName] ?? Zap
}

export interface AccentVisualStyle {
  card: string
  pressedGlow: string
  iconBg: string
  iconText: string
  dot: string | null
  swatch: string
  label: string
}

const DARK_MONOLITHIC_CARD = 'bg-[#1f2025] border-white/[0.06]'
const DARK_MONOLITHIC_PRESSED = 'bg-[#272930] border-white/[0.14]'
const LIGHT_MONOLITHIC_CARD =
  'bg-[#ffffff] border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.03)]'
const LIGHT_MONOLITHIC_PRESSED = 'bg-[#f2f2f6] border-black/[0.12]'

export const ACCENT_STYLES: Record<TileAccent, AccentVisualStyle> = {
  slate: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#8e8e93]',
    dot: null,
    swatch: 'bg-[#58585e]',
    label: '默认',
  },
  blue: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#f2f2f7]',
    dot: 'bg-sky-400',
    swatch: 'bg-sky-400',
    label: '湛蓝',
  },
  emerald: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#f2f2f7]',
    dot: 'bg-[#30d158]',
    swatch: 'bg-[#30d158]',
    label: '翠绿',
  },
  amber: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#f2f2f7]',
    dot: 'bg-amber-400',
    swatch: 'bg-amber-400',
    label: '琥珀',
  },
  rose: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#f2f2f7]',
    dot: 'bg-rose-400',
    swatch: 'bg-rose-400',
    label: '绯红',
  },
  violet: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#f2f2f7]',
    dot: 'bg-violet-400',
    swatch: 'bg-violet-400',
    label: '星紫',
  },
}

export const LIGHT_ACCENT_STYLES: Record<TileAccent, AccentVisualStyle> = {
  slate: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#6c6c70]',
    dot: null,
    swatch: 'bg-[#9a9a9e]',
    label: '默认',
  },
  blue: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#1c1c1e]',
    dot: 'bg-sky-500',
    swatch: 'bg-sky-500',
    label: '湛蓝',
  },
  emerald: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#1c1c1e]',
    dot: 'bg-[#28cd41]',
    swatch: 'bg-[#28cd41]',
    label: '翠绿',
  },
  amber: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#1c1c1e]',
    dot: 'bg-amber-500',
    swatch: 'bg-amber-500',
    label: '琥珀',
  },
  rose: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#1c1c1e]',
    dot: 'bg-rose-500',
    swatch: 'bg-rose-500',
    label: '绯红',
  },
  violet: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#1c1c1e]',
    dot: 'bg-violet-500',
    swatch: 'bg-violet-500',
    label: '星紫',
  },
}

export function getAccentStyle(accent: TileAccent, isLight = false): AccentVisualStyle {
  const table = isLight ? LIGHT_ACCENT_STYLES : ACCENT_STYLES
  return table[accent] ?? table.slate
}

export const ACCENT_KEYS: TileAccent[] = ['slate', 'blue', 'emerald', 'amber', 'rose', 'violet']
