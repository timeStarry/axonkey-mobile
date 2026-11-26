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

export const ICON_LABELS_ZH: Record<string, string> = {
  sparkles: '星光',
  zap: '闪电',
  enter: '回车',
  check: '确认',
  esc: '关闭',
  power: '电源',
  home: '主页',
  menu: '菜单',
  command: '命令',
  search: '搜索',
  undo: '撤销',
  play: '播放',
  pause: '暂停',
  'skip-back': '上一曲',
  'skip-forward': '下一曲',
  'volume-up': '音量加',
  'volume-down': '音量减',
  'volume-mute': '静音',
  'arrow-up': '向上',
  'arrow-down': '向下',
  'arrow-left': '向左',
  'arrow-right': '向右',
  copy: '复制',
  clipboard: '剪贴板',
  terminal: '终端',
  code: '代码',
  folder: '文件夹',
  save: '保存',
  send: '发送',
  mic: '麦克风',
  keyboard: '键盘',
  mouse: '鼠标',
  layout: '布局',
  plus: '新建',
  refresh: '刷新',
  delete: '删除',
}

export function getIconLabelZh(iconName: string): string {
  return ICON_LABELS_ZH[iconName] ?? iconName
}

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
    iconText: 'text-[#98989f]',
    dot: null,
    swatch: 'bg-[#8e8e93]',
    label: '银灰',
  },
  blue: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#5ac8fa]',
    dot: null,
    swatch: 'bg-[#5ac8fa]',
    label: '湛蓝',
  },
  emerald: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#32d74b]',
    dot: null,
    swatch: 'bg-[#32d74b]',
    label: '翠绿',
  },
  amber: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#ffd60a]',
    dot: null,
    swatch: 'bg-[#ffd60a]',
    label: '琥珀',
  },
  rose: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#ff6961]',
    dot: null,
    swatch: 'bg-[#ff6961]',
    label: '绯红',
  },
  violet: {
    card: DARK_MONOLITHIC_CARD,
    pressedGlow: DARK_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#bf5af2]',
    dot: null,
    swatch: 'bg-[#bf5af2]',
    label: '星紫',
  },
}

export const LIGHT_ACCENT_STYLES: Record<TileAccent, AccentVisualStyle> = {
  slate: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#636366]',
    dot: null,
    swatch: 'bg-[#8e8e93]',
    label: '银灰',
  },
  blue: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#007aff]',
    dot: null,
    swatch: 'bg-[#007aff]',
    label: '湛蓝',
  },
  emerald: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#248a3d]',
    dot: null,
    swatch: 'bg-[#28cd41]',
    label: '翠绿',
  },
  amber: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#d97706]',
    dot: null,
    swatch: 'bg-amber-500',
    label: '琥珀',
  },
  rose: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#e11d48]',
    dot: null,
    swatch: 'bg-rose-500',
    label: '绯红',
  },
  violet: {
    card: LIGHT_MONOLITHIC_CARD,
    pressedGlow: LIGHT_MONOLITHIC_PRESSED,
    iconBg: 'bg-transparent',
    iconText: 'text-[#7c3aed]',
    dot: null,
    swatch: 'bg-violet-500',
    label: '星紫',
  },
}

export function getAccentStyle(accent: TileAccent, isLight = false): AccentVisualStyle {
  const table = isLight ? LIGHT_ACCENT_STYLES : ACCENT_STYLES
  return table[accent] ?? table.slate
}

export const ACCENT_KEYS: TileAccent[] = ['slate', 'blue', 'emerald', 'amber', 'rose', 'violet']
