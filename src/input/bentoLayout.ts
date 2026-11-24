import type {
  DeckZoneKind,
  MobileDeckPage,
  MobileDeckZone,
  MobileTile,
  TileAccent,
} from '../protocol/types'

export const MAX_TILES_PER_PAGE = 32
export const MAX_ZONES_PER_PAGE = 6

export const CLASSIC_REMOTE_TOP_IDS = ['remote.esc', 'remote.menu', 'remote.home'] as const
export const CLASSIC_REMOTE_DPAD_IDS = [
  'remote.back',
  'remote.up',
  'remote.vol_up',
  'remote.left',
  'remote.ok',
  'remote.right',
  'remote.mute',
  'remote.down',
  'remote.vol_down',
] as const

export const GESTURE_PAD_SLOT_SPECS = [
  { index: 0, key: 'up', badge: '↑', dirLabel: '↑ 上滑', label: '上滑', icon: 'arrow-up', accent: 'blue' },
  { index: 1, key: 'down', badge: '↓', dirLabel: '↓ 下滑', label: '下滑', icon: 'arrow-down', accent: 'slate' },
  { index: 2, key: 'left', badge: '←', dirLabel: '← 左滑', label: '左滑', icon: 'arrow-left', accent: 'slate' },
  { index: 3, key: 'right', badge: '→', dirLabel: '→ 右滑', label: '右滑', icon: 'arrow-right', accent: 'slate' },
  { index: 4, key: 'tap', badge: '单击', dirLabel: '单击', label: '轻点', icon: 'zap', accent: 'emerald' },
  { index: 5, key: 'double', badge: '双击', dirLabel: '双击', label: '双击', icon: 'sparkles', accent: 'violet' },
] as const satisfies readonly {
  index: number
  key: 'up' | 'down' | 'left' | 'right' | 'tap' | 'double'
  badge: string
  dirLabel: string
  label: string
  icon: string
  accent: TileAccent
}[]

export interface PackedBentoItem {
  tile: MobileTile
  col: number
  row: number
  colSpan: 1 | 2
  rowSpan: 1 | 2
}

export interface PackedBentoResult {
  columns: 2 | 3 | 4
  totalRows: number
  items: PackedBentoItem[]
}

export type BentoSpanLabel = '1×1' | '2×1' | '1×2' | '2×2'

export const BENTO_SPAN_OPTIONS: readonly {
  colSpan: 1 | 2
  rowSpan: 1 | 2
  label: BentoSpanLabel
  desc: string
}[] = [
  { colSpan: 1, rowSpan: 1, label: '1×1', desc: '标准方键' },
  { colSpan: 2, rowSpan: 1, label: '2×1', desc: '横向宽键' },
  { colSpan: 1, rowSpan: 2, label: '1×2', desc: '纵向高键' },
  { colSpan: 2, rowSpan: 2, label: '2×2', desc: '巨幅方垫' },
] as const

export function clampSpan(value: number | undefined): 1 | 2 {
  if (value !== undefined && value >= 2) return 2
  return 1
}

export function clampColumns(columns: number | undefined, fallback: 2 | 3 | 4 = 3): 2 | 3 | 4 {
  if (columns === 2 || columns === 3 || columns === 4) return columns
  return fallback
}

export function formatBentoSpan(colSpan?: number, rowSpan?: number): BentoSpanLabel {
  const w = clampSpan(colSpan)
  const h = clampSpan(rowSpan)
  return `${w}×${h}`
}

export function cycleBentoSpan(
  colSpan?: number,
  rowSpan?: number,
): { colSpan: 1 | 2; rowSpan: 1 | 2 } {
  const w = clampSpan(colSpan)
  const h = clampSpan(rowSpan)
  if (w === 1 && h === 1) return { colSpan: 2, rowSpan: 1 }
  if (w === 2 && h === 1) return { colSpan: 1, rowSpan: 2 }
  if (w === 1 && h === 2) return { colSpan: 2, rowSpan: 2 }
  return { colSpan: 1, rowSpan: 1 }
}

/**
 * Deterministic legacy zone normalization (Contract Section 1.3).
 * GuaranteesPhone UI and Desktop Dynamic SVG synthesize identical zones and never orphan tiles.
 */
export function normalizePageZones(page: MobileDeckPage): MobileDeckZone[] {
  const pageCols = clampColumns(page.columns, 3)

  if (page.zones && page.zones.length > 0) {
    const zones: MobileDeckZone[] = page.zones.map((z, idx) => ({
      ...z,
      id: z.id?.trim() || `${page.id}-zone-${idx + 1}`,
      ...(z.kind === 'bento-grid'
        ? { columns: clampColumns(z.columns, pageCols) }
        : {}),
      ...(z.kind === 'pointer-pad'
        ? {
            pointerMode: z.pointerMode === 'relative' ? 'relative' : 'trackpad',
            ...(z.padHeight === 'compact' || z.padHeight === 'standard' || z.padHeight === 'tall'
              ? { padHeight: z.padHeight }
              : {}),
            ...(typeof z.showButtons === 'boolean' ? { showButtons: z.showButtons } : {}),
          }
        : {}),
      ...(z.kind === 'gesture-pad'
        ? {
            ...(z.padHeight === 'compact' || z.padHeight === 'standard' || z.padHeight === 'tall'
              ? { padHeight: z.padHeight }
              : {}),
            tileIds: normalizeGesturePadSlotIds(Array.isArray(z.tileIds) ? z.tileIds : []),
          }
        : {
            tileIds: Array.isArray(z.tileIds) ? [...z.tileIds] : [],
          }),
    }))

    const referenced = new Set<string>()
    for (const z of zones) {
      for (const id of z.tileIds) {
        if (id) referenced.add(id)
      }
    }

    const orphaned = page.tiles.filter((t) => !referenced.has(t.id)).map((t) => t.id)
    if (orphaned.length > 0) {
      let lastBentoIdx = -1
      for (let i = zones.length - 1; i >= 0; i -= 1) {
        if (zones[i].kind === 'bento-grid') {
          lastBentoIdx = i
          break
        }
      }
      if (lastBentoIdx >= 0) {
        zones[lastBentoIdx] = {
          ...zones[lastBentoIdx],
          tileIds: [...zones[lastBentoIdx].tileIds, ...orphaned],
        }
      } else {
        zones.push({
          id: `${page.id}-overflow`,
          kind: 'bento-grid',
          columns: pageCols,
          tileIds: orphaned,
        })
      }
    }

    return zones
  }

  if (page.layout === 'remote' || page.id === 'classic-remote') {
    const existingIds = new Set(page.tiles.map((t) => t.id))
    const topIds = CLASSIC_REMOTE_TOP_IDS.filter((id) => existingIds.has(id))
    const dpadIds = CLASSIC_REMOTE_DPAD_IDS.map((id) => (existingIds.has(id) ? id : ''))
    const used = new Set<string>([...topIds, ...dpadIds.filter(Boolean)])
    const remainingIds = page.tiles.filter((t) => !used.has(t.id)).map((t) => t.id)

    const synthesized: MobileDeckZone[] = []
    if (topIds.length > 0) {
      synthesized.push({
        id: `${page.id}-top`,
        kind: 'bento-grid',
        columns: 3,
        tileIds: topIds,
      })
    }
    synthesized.push({
      id: `${page.id}-dpad`,
      kind: 'dpad-3x3',
      tileIds: dpadIds,
    })
    if (remainingIds.length > 0) {
      synthesized.push({
        id: `${page.id}-quick`,
        kind: 'bento-grid',
        columns: 2,
        tileIds: remainingIds,
      })
    }
    return synthesized
  }

  return [
    {
      id: `${page.id}-grid`,
      kind: 'bento-grid',
      columns: pageCols,
      tileIds: page.tiles.map((t) => t.id),
    },
  ]
}

/**
 * Deterministic 2D dense row-major first-fit Bento grid packer (Contract Section 1.4).
 * Matches CSS `grid-auto-flow: row dense` while outputting explicit 0-based (col, row).
 */
export function packBentoTiles(tiles: MobileTile[], columns: 2 | 3 | 4): PackedBentoResult {
  const cols = clampColumns(columns, 3)
  const occupied: boolean[][] = []

  const ensureRow = (r: number) => {
    while (occupied.length <= r) {
      occupied.push(new Array<boolean>(cols).fill(false))
    }
  }

  const canFit = (row: number, col: number, w: number, h: number): boolean => {
    if (col + w > cols) return false
    for (let r = row; r < row + h; r += 1) {
      ensureRow(r)
      for (let c = col; c < col + w; c += 1) {
        if (occupied[r][c]) return false
      }
    }
    return true
  }

  const mark = (row: number, col: number, w: number, h: number) => {
    for (let r = row; r < row + h; r += 1) {
      ensureRow(r)
      for (let c = col; c < col + w; c += 1) {
        occupied[r][c] = true
      }
    }
  }

  const items: PackedBentoItem[] = []

  for (const tile of tiles) {
    const rawW = clampSpan(tile.colSpan)
    const w = Math.min(cols, rawW) as 1 | 2
    const h = clampSpan(tile.rowSpan)

    let placed = false
    for (let row = 0; !placed; row += 1) {
      for (let col = 0; col <= cols - w; col += 1) {
        if (canFit(row, col, w, h)) {
          mark(row, col, w, h)
          items.push({
            tile,
            col,
            row,
            colSpan: w,
            rowSpan: h,
          })
          placed = true
          break
        }
      }
    }
  }

  const totalRows = items.reduce((max, item) => Math.max(max, item.row + item.rowSpan), 1)
  return {
    columns: cols,
    totalRows,
    items,
  }
}

/** Reorders `tileIds` by moving `fromId` to `overId`'s position (arrayMove). */
export function reorderTileIds(tileIds: string[], fromId: string, overId: string): string[] {
  if (!fromId || !overId || fromId === overId) return tileIds
  const fromIdx = tileIds.indexOf(fromId)
  const overIdx = tileIds.indexOf(overId)
  if (fromIdx < 0 || overIdx < 0 || fromIdx === overIdx) return tileIds
  const next = [...tileIds]
  const [moved] = next.splice(fromIdx, 1)
  next.splice(overIdx, 0, moved)
  return next
}

/** Normalizes 9 slots for a `dpad-3x3` zone, padding with `""` or truncating to 9. */
export function normalizeDpadSlotIds(tileIds: string[]): string[] {
  const slots = tileIds.slice(0, 9)
  while (slots.length < 9) {
    slots.push('')
  }
  return slots
}

/** Normalizes 6 slots `[up, down, left, right, tap, double]` for a `gesture-pad` zone. */
export function normalizeGesturePadSlotIds(tileIds: string[]): string[] {
  const slots = tileIds.slice(0, 6)
  while (slots.length < 6) {
    slots.push('')
  }
  return slots
}

let uidCounter = 1
export function makeCustomId(prefix: string): string {
  uidCounter += 1
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}.${Date.now().toString(36)}${rand}${uidCounter}`
}

export function createNewCustomTile(
  indexHint = 1,
  overrides?: Partial<MobileTile>,
): MobileTile {
  const accents: TileAccent[] = ['blue', 'emerald', 'violet', 'amber', 'slate', 'rose']
  const icons = ['zap', 'sparkles', 'play', 'check', 'command', 'terminal']
  const pick = Math.max(0, indexHint - 1)
  return {
    id: makeCustomId('tile'),
    label: `自定义 ${indexHint}`,
    icon: icons[pick % icons.length],
    accent: accents[pick % accents.length],
    colSpan: 1,
    rowSpan: 1,
    mode: 'gesture',
    hasDoubleClick: false,
    hasLongPress: false,
    ...overrides,
  }
}

export function createNewZone(
  page: MobileDeckPage,
  kind: DeckZoneKind,
): { zone: MobileDeckZone; addedTiles: MobileTile[] } {
  const zoneId = makeCustomId(`${page.id}-${kind}`)
  if (kind === 'pointer-pad') {
    return {
      zone: {
        id: zoneId,
        kind: 'pointer-pad',
        pointerMode: 'trackpad',
        padHeight: 'standard',
        showButtons: true,
        tileIds: [],
      },
      addedTiles: [],
    }
  }

  if (kind === 'gesture-pad') {
    const remainingBudget = Math.max(0, MAX_TILES_PER_PAGE - page.tiles.length)
    const addedTiles: MobileTile[] = []
    const tileIds = GESTURE_PAD_SLOT_SPECS.map((spec) => {
      if (addedTiles.length >= remainingBudget) return ''
      const t = createNewCustomTile(page.tiles.length + addedTiles.length + 1, {
        label: spec.label,
        icon: spec.icon,
        accent: spec.accent,
      })
      addedTiles.push(t)
      return t.id
    })
    return {
      zone: {
        id: zoneId,
        kind: 'gesture-pad',
        padHeight: 'standard',
        tileIds,
      },
      addedTiles,
    }
  }

  if (kind === 'dpad-3x3') {
    const specs: Array<{ label: string; icon: string; accent: TileAccent } | null> = [
      { label: '返回', icon: 'undo', accent: 'slate' },
      { label: '上', icon: 'arrow-up', accent: 'slate' },
      { label: '音量+', icon: 'volume-up', accent: 'slate' },
      { label: '左', icon: 'arrow-left', accent: 'slate' },
      { label: '确认', icon: 'enter', accent: 'blue' },
      { label: '右', icon: 'arrow-right', accent: 'slate' },
      { label: '静音', icon: 'volume-mute', accent: 'slate' },
      { label: '下', icon: 'arrow-down', accent: 'slate' },
      { label: '音量-', icon: 'volume-down', accent: 'slate' },
    ]
    const remainingBudget = Math.max(0, MAX_TILES_PER_PAGE - page.tiles.length)
    const addedTiles: MobileTile[] = []
    const tileIds = specs.map((spec) => {
      if (!spec || addedTiles.length >= remainingBudget) return ''
      const t = createNewCustomTile(page.tiles.length + addedTiles.length + 1, {
        label: spec.label,
        icon: spec.icon,
        accent: spec.accent,
      })
      addedTiles.push(t)
      return t.id
    })
    return {
      zone: {
        id: zoneId,
        kind: 'dpad-3x3',
        tileIds,
      },
      addedTiles,
    }
  }

  // 'bento-grid'
  const remainingBudget = Math.max(0, MAX_TILES_PER_PAGE - page.tiles.length)
  const count = Math.min(3, remainingBudget)
  const addedTiles: MobileTile[] = []
  for (let i = 0; i < count; i += 1) {
    addedTiles.push(createNewCustomTile(page.tiles.length + i + 1))
  }
  return {
    zone: {
      id: zoneId,
      kind: 'bento-grid',
      columns: clampColumns(page.columns, 3),
      tileIds: addedTiles.map((t) => t.id),
    },
    addedTiles,
  }
}

export type PageTemplateId =
  | 'bento-blank'
  | 'pointer-mixed'
  | 'media-tall'
  | 'classic-remote'

export const PAGE_TEMPLATES: readonly {
  id: PageTemplateId
  title: string
  subtitle: string
}[] = [
  {
    id: 'bento-blank',
    title: '空白 Bento 网格',
    subtitle: '3 列自由网格，支持 1×1 / 2×1 / 1×2 / 2×2 混排',
  },
  {
    id: 'pointer-mixed',
    title: '触控+快捷混排',
    subtitle: '上半屏内嵌触控板/空鼠 + 下半屏自定义快捷键',
  },
  {
    id: 'media-tall',
    title: '1×2 媒体/翻页大键',
    subtitle: '含 2×2 核心大垫与 1×2 纵向盲操长键',
  },
  {
    id: 'classic-remote',
    title: '经典九宫遥控',
    subtitle: '顶部功能键 + 3×3 方向盘 + 底部双列大键',
  },
] as const

export function createPageFromTemplate(
  template: PageTemplateId,
  pageIndex = 1,
  customName?: string,
): MobileDeckPage {
  const pageId = makeCustomId('page')

  if (template === 'pointer-mixed') {
    const tiles: MobileTile[] = [
      createNewCustomTile(1, {
        label: '主动作',
        icon: 'sparkles',
        accent: 'blue',
        colSpan: 2,
        rowSpan: 1,
      }),
      createNewCustomTile(2, { label: '确认', icon: 'enter', accent: 'emerald' }),
      createNewCustomTile(3, { label: '复制', icon: 'copy', accent: 'slate' }),
      createNewCustomTile(4, { label: '粘贴', icon: 'clipboard', accent: 'slate' }),
      createNewCustomTile(5, { label: '撤销', icon: 'undo', accent: 'amber' }),
    ]
    return {
      id: pageId,
      name: customName?.trim() || `触控混排 ${pageIndex}`,
      layout: 'grid',
      columns: 3,
      tiles,
      zones: [
        {
          id: `${pageId}-pad`,
          kind: 'pointer-pad',
          pointerMode: 'trackpad',
          tileIds: [],
        },
        {
          id: `${pageId}-bento`,
          kind: 'bento-grid',
          columns: 3,
          tileIds: tiles.map((t) => t.id),
        },
      ],
    }
  }

  if (template === 'media-tall') {
    const tiles: MobileTile[] = [
      createNewCustomTile(1, {
        label: '播放 / 暂停',
        subtitle: '核心主控',
        icon: 'play',
        accent: 'violet',
        colSpan: 2,
        rowSpan: 2,
      }),
      createNewCustomTile(2, {
        label: '音量 +',
        subtitle: '纵向长键',
        icon: 'volume-up',
        accent: 'blue',
        colSpan: 1,
        rowSpan: 2,
      }),
      createNewCustomTile(3, {
        label: '上一首',
        icon: 'skip-back',
        accent: 'slate',
        colSpan: 1,
        rowSpan: 1,
      }),
      createNewCustomTile(4, {
        label: '下一首',
        icon: 'skip-forward',
        accent: 'slate',
        colSpan: 1,
        rowSpan: 1,
      }),
      createNewCustomTile(5, {
        label: '音量 -',
        subtitle: '纵向长键',
        icon: 'volume-down',
        accent: 'amber',
        colSpan: 1,
        rowSpan: 2,
      }),
      createNewCustomTile(6, {
        label: '全屏 / 确认',
        icon: 'enter',
        accent: 'emerald',
        colSpan: 2,
        rowSpan: 1,
      }),
    ]
    return {
      id: pageId,
      name: customName?.trim() || `媒体大键 ${pageIndex}`,
      layout: 'grid',
      columns: 3,
      tiles,
      zones: [
        {
          id: `${pageId}-bento`,
          kind: 'bento-grid',
          columns: 3,
          tileIds: tiles.map((t) => t.id),
        },
      ],
    }
  }

  if (template === 'classic-remote') {
    const topSpecs: Array<{ label: string; icon: string; accent: TileAccent }> = [
      { label: '退出', icon: 'esc', accent: 'rose' },
      { label: '菜单', icon: 'menu', accent: 'blue' },
      { label: '主页', icon: 'home', accent: 'slate' },
    ]
    const dpadSpecs: Array<{ label: string; icon: string; accent: TileAccent }> = [
      { label: '返回', icon: 'undo', accent: 'slate' },
      { label: '上', icon: 'arrow-up', accent: 'slate' },
      { label: '音量+', icon: 'volume-up', accent: 'slate' },
      { label: '左', icon: 'arrow-left', accent: 'slate' },
      { label: '确认', icon: 'enter', accent: 'blue' },
      { label: '右', icon: 'arrow-right', accent: 'slate' },
      { label: '静音', icon: 'volume-mute', accent: 'slate' },
      { label: '下', icon: 'arrow-down', accent: 'slate' },
      { label: '音量-', icon: 'volume-down', accent: 'slate' },
    ]
    const quickSpecs: Array<{ label: string; icon: string; accent: TileAccent }> = [
      { label: '快捷 1', icon: 'sparkles', accent: 'blue' },
      { label: '快捷 2', icon: 'check', accent: 'emerald' },
    ]
    const topTiles = topSpecs.map((s, i) => createNewCustomTile(i + 1, s))
    const dpadTiles = dpadSpecs.map((s, i) => createNewCustomTile(i + 4, s))
    const quickTiles = quickSpecs.map((s, i) => createNewCustomTile(i + 13, s))
    const tiles = [...topTiles, ...dpadTiles, ...quickTiles]
    return {
      id: pageId,
      name: customName?.trim() || `九宫遥控 ${pageIndex}`,
      layout: 'remote',
      columns: 3,
      tiles,
      zones: [
        {
          id: `${pageId}-top`,
          kind: 'bento-grid',
          columns: 3,
          tileIds: topTiles.map((t) => t.id),
        },
        {
          id: `${pageId}-dpad`,
          kind: 'dpad-3x3',
          tileIds: dpadTiles.map((t) => t.id),
        },
        {
          id: `${pageId}-quick`,
          kind: 'bento-grid',
          columns: 2,
          tileIds: quickTiles.map((t) => t.id),
        },
      ],
    }
  }

  // Default: 'bento-blank'
  const tiles: MobileTile[] = [
    createNewCustomTile(1, {
      label: '快捷主操作',
      icon: 'sparkles',
      accent: 'blue',
      colSpan: 2,
      rowSpan: 1,
    }),
    createNewCustomTile(2, { label: '确认', icon: 'enter', accent: 'emerald' }),
    createNewCustomTile(3, { label: '按键 3', icon: 'command', accent: 'slate' }),
    createNewCustomTile(4, { label: '按键 4', icon: 'terminal', accent: 'violet' }),
    createNewCustomTile(5, { label: '按键 5', icon: 'zap', accent: 'amber' }),
  ]
  return {
    id: pageId,
    name: customName?.trim() || `自定义面板 ${pageIndex}`,
    layout: 'grid',
    columns: 3,
    tiles,
    zones: [
      {
        id: `${pageId}-bento`,
        kind: 'bento-grid',
        columns: 3,
        tileIds: tiles.map((t) => t.id),
      },
    ],
  }
}
