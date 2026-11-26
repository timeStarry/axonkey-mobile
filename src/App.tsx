import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleDot,
  Compass,
  LayoutGrid,
  MousePointer2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { AboutUpdateSheet } from './components/AboutUpdateSheet'
import { BottomSheet } from './components/BottomSheet'
import { LocalFeelSheet } from './components/LocalFeelSheet'
import { PageManagerSheet } from './components/PageManagerSheet'
import { PageZoneRenderer } from './components/PageZoneRenderer'
import { PairingSheet } from './components/PairingSheet'
import { PointerHelpSheet } from './components/PointerHelpSheet'
import { PointerSettingsSheet } from './components/PointerSettingsSheet'
import { TileStyleSheet } from './components/TileStyleSheet'
import { TrackpadSurface } from './components/TrackpadSurface'
import { VersionCompatSheet } from './components/VersionCompatSheet'
import { VoiceTextDock } from './components/VoiceTextDock'
import {
  BENTO_SPAN_OPTIONS,
  CLICKPAD_RING_SLOT_SPECS,
  clampColumns,
  clampSpan,
  normalizeDpadSlotIds,
  normalizePageZones,
} from './input/bentoLayout'
import type { DeckZoneKind, MobileDeckPage } from './protocol/types'
import { useMobileStore, type WorkspaceMode } from './state/useMobileStore'
import { DEFAULT_MOBILE_DECK } from './transport/defaultDeck'
import { triggerHaptic } from './transport/nativeBridge'

function readViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 390, height: 844 }
  return { width: window.innerWidth, height: window.innerHeight }
}

const ZONE_ADD_OPTIONS: readonly {
  kind: DeckZoneKind
  title: string
  icon: typeof CircleDot
}[] = [
  { kind: 'dpad-3x3', title: '触控圆盘', icon: CircleDot },
  { kind: 'pointer-pad', title: '触控板', icon: MousePointer2 },
  { kind: 'gesture-pad', title: '手势垫', icon: Compass },
  { kind: 'bento-grid', title: '按键网格', icon: LayoutGrid },
] as const

function getZoneDisplayName(kind: DeckZoneKind): string {
  switch (kind) {
    case 'dpad-3x3':
      return '触控圆盘'
    case 'pointer-pad':
      return '触控板'
    case 'gesture-pad':
      return '手势垫'
    case 'bento-grid':
      return '按键网格'
  }
}

export function App() {
  const init = useMobileStore((s) => s.init)
  const phase = useMobileStore((s) => s.phase)
  const hostName = useMobileStore((s) => s.hostName)
  const discoveringLan = useMobileStore((s) => s.discoveringLan)
  const context = useMobileStore((s) => s.context)
  const deck = useMobileStore((s) => s.deck)
  const workspaceMode = useMobileStore((s) => s.workspaceMode)
  const layoutEditing = useMobileStore((s) => s.layoutEditing)
  const selectedEditItem = useMobileStore((s) => s.selectedEditItem)
  const screenOrientation = useMobileStore((s) => s.localFeel.screenOrientation)
  const conflictBanner = useMobileStore((s) => s.conflictBanner)
  const errorToast = useMobileStore((s) => s.errorToast)
  const hudToast = useMobileStore((s) => s.hudToast)
  const pairingOpen = useMobileStore((s) => s.pairingOpen)
  const feelSheetOpen = useMobileStore((s) => s.feelSheetOpen)
  const pointerSettingsOpen = useMobileStore((s) => s.pointerSettingsOpen)
  const pointerHelpOpen = useMobileStore((s) => s.pointerHelpOpen)
  const editingTileTarget = useMobileStore((s) => s.editingTileTarget)
  const pageManagerOpen = useMobileStore((s) => s.pageManagerOpen)
  const aboutSheetOpen = useMobileStore((s) => s.aboutSheetOpen)
  const versionCompatNotice = useMobileStore((s) => s.versionCompatNotice)

  const setWorkspaceMode = useMobileStore((s) => s.setWorkspaceMode)
  const setActivePage = useMobileStore((s) => s.setActivePage)
  const setPairingOpen = useMobileStore((s) => s.setPairingOpen)
  const setFeelSheetOpen = useMobileStore((s) => s.setFeelSheetOpen)
  const setLayoutEditing = useMobileStore((s) => s.setLayoutEditing)
  const setSelectedEditItem = useMobileStore((s) => s.setSelectedEditItem)
  const setPageManagerOpen = useMobileStore((s) => s.setPageManagerOpen)
  const openTileEditor = useMobileStore((s) => s.openTileEditor)
  const setTileSpan = useMobileStore((s) => s.setTileSpan)
  const deleteTile = useMobileStore((s) => s.deleteTile)
  const addTileToPage = useMobileStore((s) => s.addTileToPage)
  const addZoneToPage = useMobileStore((s) => s.addZoneToPage)
  const updateZone = useMobileStore((s) => s.updateZone)
  const moveZone = useMobileStore((s) => s.moveZone)
  const deleteZone = useMobileStore((s) => s.deleteZone)
  const dismissConflict = useMobileStore((s) => s.dismissConflict)
  const clearError = useMobileStore((s) => s.clearError)
  const dismissHudToast = useMobileStore((s) => s.dismissHudToast)

  const [viewport, setViewport] = useState(readViewportSize)
  const [addComponentOpen, setAddComponentOpen] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      setViewport(readViewportSize())
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  useEffect(() => {
    if (!layoutEditing) {
      setAddComponentOpen(false)
    }
  }, [layoutEditing])

  const isWideViewport = viewport.width > viewport.height
  const isSplitLandscape =
    (isWideViewport && viewport.height < 580) ||
    (screenOrientation === 'landscape' && isWideViewport)

  const remotePages = deck.pages.filter((p) => p.layout === 'remote' || p.id === 'classic-remote')
  const remotePage =
    remotePages.find((p) => p.id === deck.activePageId) ??
    remotePages[0] ??
    deck.pages[0] ??
    DEFAULT_MOBILE_DECK.pages[0]

  const gridPages = deck.pages.filter((p) => p.layout !== 'remote' && p.id !== 'classic-remote')
  const deckSelectablePages = gridPages.length > 0 ? gridPages : deck.pages
  const activeDeckPage =
    deckSelectablePages.find((p) => p.id === deck.activePageId) ?? deckSelectablePages[0]

  const editingCurrentPage =
    deck.pages.find((p) => p.id === deck.activePageId) ??
    (workspaceMode === 'remote' ? remotePage : activeDeckPage) ??
    deck.pages[0] ??
    DEFAULT_MOBILE_DECK.pages[0]

  const isOnlineReal = phase === 'active'
  const isConnecting = phase === 'authenticating' || phase === 'synchronizing' || discoveringLan
  const contextBadge = context.appName
    ? context.appName
    : context.profileName && context.profileName !== '默认配置'
      ? context.profileName
      : null

  const navItems: { id: WorkspaceMode; label: string }[] = [
    { id: 'remote', label: '遥控器' },
    { id: 'deck', label: '快捷面板' },
    { id: 'pointer', label: '触控·飞鼠' },
  ]

  const handlePrimaryTabSelect = (mode: WorkspaceMode) => {
    triggerHaptic('tap')
    if (mode === 'pointer') {
      if (layoutEditing) setLayoutEditing(false)
      setWorkspaceMode('pointer')
      return
    }
    setWorkspaceMode(mode)
    if (mode === 'remote' && remotePage) {
      setActivePage(remotePage.id)
    } else if (mode === 'deck' && activeDeckPage) {
      setActivePage(activeDeckPage.id)
    }
  }

  const handleEditPageSelect = (page: MobileDeckPage) => {
    triggerHaptic('tap')
    setActivePage(page.id)
    if (page.layout === 'remote' || page.id === 'classic-remote') {
      setWorkspaceMode('remote')
    } else {
      setWorkspaceMode('deck')
    }
  }

  const anySheetOpen =
    pairingOpen ||
    feelSheetOpen ||
    pointerSettingsOpen ||
    pointerHelpOpen ||
    Boolean(editingTileTarget) ||
    pageManagerOpen ||
    aboutSheetOpen ||
    Boolean(versionCompatNotice) ||
    addComponentOpen

  const renderFloatingNotices = () => {
    if (!conflictBanner && !errorToast) return null
    return (
      <div
        className={clsx(
          'pointer-events-none fixed z-[45] flex flex-col gap-1.5',
          isSplitLandscape && !layoutEditing
            ? 'left-[224px] right-3.5 top-[calc(max(var(--ak-inset-top,0px),env(safe-area-inset-top,0px))+10px)]'
            : 'left-3.5 right-3.5 top-[calc(max(var(--ak-inset-top,0px),env(safe-area-inset-top,0px))+48px)]',
        )}
      >
        {conflictBanner && (
          <div
            role="alert"
            className="pointer-events-auto ak-elevated-alt mx-auto w-full max-w-md px-3.5 py-2.5 rounded-[18px] border shadow-xl backdrop-blur-md flex items-center justify-between gap-2.5 text-xs"
          >
            <div className="inline-flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-full bg-amber-500/15 text-amber-400 inline-flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <span className="ak-text-1 font-medium truncate">{conflictBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                dismissConflict()
              }}
              className="ak-pill-strong ak-text-1 h-6 px-2.5 rounded-full border text-[11px] font-medium shrink-0 active:scale-95 transition-transform"
            >
              知道了
            </button>
          </div>
        )}
        {errorToast && (
          <div
            role="alert"
            data-testid="floating-error-card"
            className="pointer-events-auto ak-elevated-alt mx-auto w-full max-w-md px-3.5 py-2.5 rounded-[18px] border shadow-xl backdrop-blur-md flex items-center justify-between gap-2.5 text-xs"
          >
            <div className="inline-flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-full bg-rose-500/15 text-rose-400 inline-flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <span className="ak-text-1 font-medium truncate">{errorToast}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                clearError()
              }}
              aria-label="关闭提示"
              className="ak-pill ak-text-2 w-6 h-6 rounded-full border inline-flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderEditTopBar = (inSplitRail = false) => (
    <header
      data-testid="edit-mode-topbar"
      className={clsx(
        'ak-chrome shrink-0 flex items-center justify-between gap-2 px-3.5 border-b',
        inSplitRail ? 'h-12' : 'min-h-12 pb-2 safe-top',
      )}
    >
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1">
        {deck.pages.map((p) => {
          const active = p.id === editingCurrentPage.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleEditPageSelect(p)}
              className={clsx(
                'h-7 px-2.5 rounded-[10px] text-xs font-medium shrink-0 transition-colors border',
                active ? 'ak-elevated-alt ak-text-1' : 'border-transparent ak-text-2',
              )}
            >
              {p.name}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            setPageManagerOpen(true)
          }}
          aria-label="页面管理"
          className="ak-elevated ak-text-2 h-7 w-7 rounded-[10px] border inline-flex items-center justify-center shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            setAddComponentOpen(true)
          }}
          className="ak-elevated ak-text-1 h-7 px-2.5 rounded-[10px] border text-xs font-medium inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>组件</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('confirm')
            setLayoutEditing(false)
          }}
          className="ak-primary-solid h-7 px-3 rounded-[10px] border text-xs font-semibold"
        >
          完成
        </button>
      </div>
    </header>
  )

  const renderEditInspectorDock = () => {
    const zones = normalizePageZones(editingCurrentPage)

    if (!selectedEditItem || selectedEditItem.pageId !== editingCurrentPage.id) {
      return (
        <div
          data-testid="edit-inspector-dock"
          className="ak-dock shrink-0 h-[84px] px-4 safe-bottom border-t flex items-center justify-center text-center"
        >
          <span className="ak-text-2 text-xs">轻点元素调整属性 · 按住按键拖动换位</span>
        </div>
      )
    }

    if (selectedEditItem.kind === 'tile') {
      const tile = editingCurrentPage.tiles.find((t) => t.id === selectedEditItem.tileId)
      const zone =
        zones.find((z) => z.id === selectedEditItem.zoneId) ??
        zones.find((z) => z.tileIds.includes(selectedEditItem.tileId))

      if (!tile) {
        return (
          <div
            data-testid="edit-inspector-dock"
            className="ak-dock shrink-0 h-[84px] px-4 safe-bottom border-t flex items-center justify-center text-center"
          >
            <span className="ak-text-2 text-xs">轻点元素调整属性 · 按住按键拖动换位</span>
          </div>
        )
      }

      const isBentoTile = !zone || zone.kind === 'bento-grid'
      const curW = clampSpan(tile.colSpan)
      const curH = clampSpan(tile.rowSpan)

      if (isBentoTile) {
        return (
          <div
            data-testid="edit-inspector-dock"
            className="ak-sheet shrink-0 px-3.5 pt-2.5 pb-3 safe-bottom border-t space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="ak-text-1 text-xs font-semibold truncate">
                已选：{tile.label}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {zone && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap')
                      setSelectedEditItem({
                        kind: 'zone',
                        pageId: editingCurrentPage.id,
                        zoneId: zone.id,
                      })
                    }}
                    className="ak-well ak-text-2 h-7 px-2.5 rounded-[10px] border text-[11px] font-medium"
                  >
                    网格列数
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap')
                    openTileEditor(editingCurrentPage.id, zone?.id ?? '', tile.id)
                  }}
                  className="ak-elevated ak-text-1 h-7 px-2.5 rounded-[10px] border text-[11px] font-medium inline-flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>编辑</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('heavy')
                    deleteTile(editingCurrentPage.id, tile.id)
                  }}
                  className="h-7 px-2.5 rounded-[10px] border border-rose-500/30 text-rose-500 text-[11px] font-medium inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>删除</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {BENTO_SPAN_OPTIONS.map((sp) => {
                const active = sp.colSpan === curW && sp.rowSpan === curH
                return (
                  <button
                    key={sp.label}
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap')
                      setTileSpan(editingCurrentPage.id, tile.id, sp.colSpan, sp.rowSpan)
                    }}
                    className={clsx(
                      'h-8 rounded-[10px] border text-xs font-mono font-medium transition-colors',
                      active ? 'ak-primary-solid' : 'ak-well ak-text-2',
                    )}
                  >
                    {sp.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      }

      // Ring / Gesture-Pad Tile selected
      return (
        <div
          data-testid="edit-inspector-dock"
          className="ak-sheet shrink-0 px-3.5 pt-2.5 pb-3 safe-bottom border-t space-y-2"
        >
          <div className="ak-text-1 text-xs font-semibold truncate">已选：{tile.label}</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                openTileEditor(editingCurrentPage.id, zone.id, tile.id)
              }}
              className="ak-primary-solid h-8 rounded-[10px] border text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>编辑名称与模式</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                setSelectedEditItem({
                  kind: 'zone',
                  pageId: editingCurrentPage.id,
                  zoneId: zone.id,
                })
              }}
              className="ak-elevated ak-text-1 h-8 rounded-[10px] border text-xs font-medium"
            >
              选中整个组件
            </button>
          </div>
        </div>
      )
    }

    // Zone selected
    const zoneIdx = zones.findIndex((z) => z.id === selectedEditItem.zoneId)
    const zone = zoneIdx >= 0 ? zones[zoneIdx] : undefined
    if (!zone) {
      return (
        <div
          data-testid="edit-inspector-dock"
          className="ak-dock shrink-0 h-[84px] px-4 safe-bottom border-t flex items-center justify-center text-center"
        >
          <span className="ak-text-2 text-xs">轻点元素调整属性 · 按住按键拖动换位</span>
        </div>
      )
    }

    return (
      <div
        data-testid="edit-inspector-dock"
        className="ak-sheet shrink-0 px-3.5 pt-2.5 pb-3 safe-bottom border-t space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="ak-text-1 text-xs font-semibold">
            {getZoneDisplayName(zone.kind)}
          </span>

          {zones.length > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={zoneIdx === 0}
                onClick={() => {
                  triggerHaptic('tap')
                  moveZone(editingCurrentPage.id, zone.id, -1)
                }}
                aria-label="上移组件"
                className="ak-elevated ak-text-2 h-7 px-2 rounded-[10px] border text-[11px] font-medium inline-flex items-center gap-0.5 disabled:opacity-35"
              >
                <ArrowUp className="w-3 h-3" />
                <span>上移</span>
              </button>
              <button
                type="button"
                disabled={zoneIdx === zones.length - 1}
                onClick={() => {
                  triggerHaptic('tap')
                  moveZone(editingCurrentPage.id, zone.id, 1)
                }}
                aria-label="下移组件"
                className="ak-elevated ak-text-2 h-7 px-2 rounded-[10px] border text-[11px] font-medium inline-flex items-center gap-0.5 disabled:opacity-35"
              >
                <ArrowDown className="w-3 h-3" />
                <span>下移</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('heavy')
                  deleteZone(editingCurrentPage.id, zone.id)
                }}
                aria-label="删除组件"
                className="h-7 px-2.5 rounded-[10px] border border-rose-500/30 text-rose-500 text-[11px] font-medium inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>删除组件</span>
              </button>
            </div>
          )}
        </div>

        {zone.kind === 'bento-grid' && (
          <div className="grid grid-cols-3 gap-1.5">
            {([2, 3, 4] as const).map((colOpt) => {
              const activeCol = clampColumns(zone.columns, editingCurrentPage.columns) === colOpt
              return (
                <button
                  key={colOpt}
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap')
                    updateZone(editingCurrentPage.id, zone.id, { columns: colOpt })
                  }}
                  className={clsx(
                    'h-8 rounded-[10px] border text-xs font-medium transition-colors',
                    activeCol ? 'ak-primary-solid' : 'ak-well ak-text-2',
                  )}
                >
                  {colOpt}列
                </button>
              )
            })}
          </div>
        )}

        {zone.kind === 'pointer-pad' && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <div className="ak-seg inline-flex p-0.5 rounded-[10px] border shrink-0">
              {(
                [
                  { id: 'trackpad', label: '触控板' },
                  { id: 'relative', label: '飞鼠' },
                ] as const
              ).map((opt) => {
                const activeMode = (zone.pointerMode ?? 'trackpad') === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap')
                      updateZone(editingCurrentPage.id, zone.id, { pointerMode: opt.id })
                    }}
                    className={clsx(
                      'h-7 px-2.5 rounded-[8px] text-[11px] font-medium',
                      activeMode ? 'ak-elevated-alt border' : 'ak-text-2',
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            <div className="ak-seg inline-flex p-0.5 rounded-[10px] border shrink-0">
              {(
                [
                  { id: 'compact', label: '紧凑' },
                  { id: 'standard', label: '标准' },
                  { id: 'tall', label: '加高' },
                ] as const
              ).map((hOpt) => {
                const activeH = (zone.padHeight ?? 'standard') === hOpt.id
                return (
                  <button
                    key={hOpt.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap')
                      updateZone(editingCurrentPage.id, zone.id, { padHeight: hOpt.id })
                    }}
                    className={clsx(
                      'h-7 px-2 rounded-[8px] text-[11px] font-medium',
                      activeH ? 'ak-elevated-alt border' : 'ak-text-2',
                    )}
                  >
                    {hOpt.label}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={zone.showButtons !== false}
              onClick={() => {
                triggerHaptic('tap')
                updateZone(editingCurrentPage.id, zone.id, {
                  showButtons: zone.showButtons === false,
                })
              }}
              className={clsx(
                'h-8 px-2.5 rounded-[10px] border text-[11px] font-medium shrink-0',
                zone.showButtons !== false ? 'ak-primary-solid' : 'ak-well ak-text-2',
              )}
            >
              实体键
            </button>
          </div>
        )}

        {zone.kind === 'gesture-pad' && (
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'compact', label: '紧凑' },
                { id: 'standard', label: '标准' },
                { id: 'tall', label: '加高' },
              ] as const
            ).map((hOpt) => {
              const activeH = (zone.padHeight ?? 'standard') === hOpt.id
              return (
                <button
                  key={hOpt.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap')
                    updateZone(editingCurrentPage.id, zone.id, { padHeight: hOpt.id })
                  }}
                  className={clsx(
                    'h-8 rounded-[10px] border text-xs font-medium transition-colors',
                    activeH ? 'ak-primary-solid' : 'ak-well ak-text-2',
                  )}
                >
                  {hOpt.label}
                </button>
              )
            })}
          </div>
        )}

        {zone.kind === 'dpad-3x3' &&
          (() => {
            const slots = normalizeDpadSlotIds(zone.tileIds)
            return (
              <div className="grid grid-cols-5 gap-1.5">
                {CLICKPAD_RING_SLOT_SPECS.map((spec) => {
                  const slotTileId = slots[spec.index]
                  const slotTile = editingCurrentPage.tiles.find((t) => t.id === slotTileId)
                  return (
                    <button
                      key={spec.key}
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap')
                        if (slotTile) {
                          openTileEditor(editingCurrentPage.id, zone.id, slotTile.id)
                        } else {
                          const created = addTileToPage(
                            editingCurrentPage.id,
                            zone.id,
                            spec.index,
                          )
                          if (created) {
                            openTileEditor(editingCurrentPage.id, zone.id, created.id)
                          }
                        }
                      }}
                      className="ak-well ak-text-1 h-8 rounded-[10px] border text-[11px] font-medium truncate px-1"
                    >
                      {slotTile?.label ?? spec.label}
                    </button>
                  )
                })}
              </div>
            )
          })()}
      </div>
    )
  }

  const renderMainStage = (compactRing = false) => (
    <>
      <main
        data-testid="main-stage"
        onClick={(e) => {
          if (!layoutEditing) return
          if (e.target === e.currentTarget) {
            setSelectedEditItem(null)
          }
        }}
        className="flex-1 min-h-0 flex flex-col px-3.5 py-2 overflow-hidden"
      >
        {layoutEditing ? (
          <div
            data-testid="stage-scrollport"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedEditItem(null)
              }
            }}
            className="flex-1 min-h-0 -mx-2 px-2 pt-1 pb-2 overflow-y-auto no-scrollbar"
          >
            <PageZoneRenderer page={editingCurrentPage} compact={compactRing} />
          </div>
        ) : (
          <>
            {workspaceMode === 'remote' && (
              <div className="flex-1 min-h-0 flex flex-col gap-2">
                {remotePages.length > 1 && (
                  <div className="flex items-center gap-1.5 -mx-1 px-1 py-0.5 overflow-x-auto shrink-0 no-scrollbar">
                    {remotePages.map((p) => {
                      const active = p.id === remotePage.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            triggerHaptic('tap')
                            setActivePage(p.id)
                          }}
                          className={clsx(
                            'h-7 px-3 rounded-full text-xs font-medium shrink-0 transition-colors border',
                            active ? 'ak-primary-solid' : 'ak-elevated ak-text-2',
                          )}
                        >
                          {p.name}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div
                  data-testid="stage-scrollport"
                  className="flex-1 min-h-0 -mx-2 px-2 pt-1 pb-2 overflow-y-auto no-scrollbar"
                >
                  <PageZoneRenderer page={remotePage} compact={compactRing} />
                </div>
              </div>
            )}

            {workspaceMode === 'deck' && (
              <div className="flex-1 min-h-0 flex flex-col gap-2">
                {deckSelectablePages.length > 1 && (
                  <div className="flex items-center gap-1.5 -mx-1 px-1 py-0.5 overflow-x-auto no-scrollbar shrink-0">
                    {deckSelectablePages.map((p) => {
                      const active = p.id === activeDeckPage?.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            triggerHaptic('tap')
                            setActivePage(p.id)
                          }}
                          className={clsx(
                            'h-7 px-3 rounded-full text-xs font-medium shrink-0 transition-colors border',
                            active ? 'ak-primary-solid' : 'ak-elevated ak-text-2',
                          )}
                        >
                          {p.name}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div
                  data-testid="stage-scrollport"
                  className="flex-1 min-h-0 -mx-2 px-2 pt-1 pb-2 overflow-y-auto no-scrollbar"
                >
                  {activeDeckPage && (
                    <PageZoneRenderer page={activeDeckPage} compact={compactRing} />
                  )}
                </div>
              </div>
            )}

            {workspaceMode === 'pointer' && (
              <div className="flex-1 min-h-0">
                <TrackpadSurface />
              </div>
            )}
          </>
        )}
      </main>
    </>
  )

  const hudPositionCls = anySheetOpen
    ? 'top-[calc(max(var(--ak-inset-top,0px),env(safe-area-inset-top,0px))+14px)] left-1/2 -translate-x-1/2'
    : isSplitLandscape
      ? clsx(
          'bottom-[calc(max(var(--ak-inset-bottom,0px),env(safe-area-inset-bottom,0px))+14px)] -translate-x-1/2',
          layoutEditing ? 'left-1/2' : 'left-[calc(50%+106px)]',
        )
      : layoutEditing
        ? 'bottom-[calc(max(var(--ak-inset-bottom,0px),env(safe-area-inset-bottom,0px))+98px)] left-1/2 -translate-x-1/2'
        : workspaceMode === 'pointer'
          ? 'bottom-[calc(max(var(--ak-inset-bottom,0px),env(safe-area-inset-bottom,0px))+178px)] left-1/2 -translate-x-1/2'
          : 'bottom-[calc(max(var(--ak-inset-bottom,0px),env(safe-area-inset-bottom,0px))+118px)] left-1/2 -translate-x-1/2'

  const renderSheets = () => (
    <>
      {renderFloatingNotices()}
      {hudToast && (
        <div
          key={hudToast.id}
          role="status"
          aria-live="polite"
          data-testid="hud-toast"
          className={clsx(
            'fixed z-[60] max-w-[90vw] rounded-full border ak-elevated-alt text-xs font-medium shadow-[0_8px_24px_rgba(0,0,0,0.34)] backdrop-blur-md flex items-center gap-2 animate-[hudFadeIn_140ms_ease-out]',
            hudToast.action
              ? 'pointer-events-auto pl-3.5 pr-1.5 py-1.5'
              : 'pointer-events-none px-3.5 py-2',
            hudPositionCls,
          )}
        >
          <span
            className={clsx(
              'w-1.5 h-1.5 rounded-full shrink-0',
              hudToast.tone === 'amber'
                ? 'bg-amber-400'
                : hudToast.tone === 'rose'
                  ? 'bg-rose-400'
                  : 'ak-live-dot',
            )}
          />
          <span className="ak-text-1 truncate">{hudToast.message}</span>
          {hudToast.action && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                const actId = hudToast.action?.id
                dismissHudToast()
                if (actId === 'open_pairing') {
                  setPairingOpen(true)
                }
              }}
              className="ak-primary-solid ml-0.5 h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-0.5 shrink-0 active:scale-95 transition-transform"
            >
              <span>{hudToast.action.label}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      <PairingSheet />
      <LocalFeelSheet />
      <PointerSettingsSheet />
      <PointerHelpSheet />
      <TileStyleSheet />
      <PageManagerSheet currentPage={editingCurrentPage} />
      <AboutUpdateSheet />
      <VersionCompatSheet />
      <BottomSheet
        open={addComponentOpen}
        onClose={() => setAddComponentOpen(false)}
        title="添加组件"
        closeAriaLabel="关闭添加组件"
        testId="add-component-sheet-backdrop"
      >
        <div className="grid grid-cols-2 gap-2">
          {ZONE_ADD_OPTIONS.map((opt) => {
            const Icon = opt.icon
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() => {
                  triggerHaptic('confirm')
                  addZoneToPage(editingCurrentPage.id, opt.kind)
                  setAddComponentOpen(false)
                }}
                className="tile-surface ak-well h-20 rounded-[18px] border flex flex-col items-center justify-center gap-2 text-xs font-medium ak-text-1"
              >
                <Icon className="w-5 h-5 ak-text-2" />
                <span>{opt.title}</span>
              </button>
            )
          })}
        </div>
      </BottomSheet>
    </>
  )

  const renderHostStatusPill = () => (
    <button
      type="button"
      onClick={() => {
        triggerHaptic('tap')
        setPairingOpen(true)
      }}
      aria-label="连接与配对"
      aria-description={
        isOnlineReal
          ? `已连接电脑 ${hostName}${contextBadge ? `，当前应用 ${contextBadge}` : ''}`
          : isConnecting
            ? '正在重连电脑'
            : '尚未连接电脑，点击配对'
      }
      className={clsx(
        'inline-flex items-center gap-2 min-w-0 rounded-full active:scale-[0.98] transition-all',
        isOnlineReal
          ? 'py-1 pr-2 active:opacity-70'
          : 'ak-elevated border px-2.5 py-1',
      )}
    >
      <span
        className={clsx(
          'w-2 h-2 rounded-full shrink-0',
          isOnlineReal ? 'ak-live-dot' : 'bg-amber-400 animate-pulse',
        )}
      />
      <span className="ak-text-1 text-[13px] font-medium tracking-tight truncate max-w-[144px]">
        {isOnlineReal ? hostName : isConnecting ? '重连中…' : '未连接 · 点此配对'}
      </span>
      {isOnlineReal && contextBadge ? (
        <span className="ak-text-2 text-xs inline-flex items-center gap-1 min-w-0 max-w-[104px]">
          <span aria-hidden="true">·</span>
          <span className="truncate">{contextBadge}</span>
        </span>
      ) : !isOnlineReal ? (
        <ChevronRight className="w-3.5 h-3.5 ak-text-2 shrink-0 -ml-1" />
      ) : null}
    </button>
  )

  // Split Landscape Ergonomic Layout
  if (isSplitLandscape) {
    return (
      <div
        data-testid="split-landscape-shell"
        className="ak-canvas h-full w-full flex flex-row overflow-hidden"
      >
        {!layoutEditing && (
          <aside className="ak-chrome safe-landscape-rail w-[212px] shrink-0 h-full border-r flex flex-col justify-between gap-2 overflow-y-auto no-scrollbar">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-1">
                {renderHostStatusPill()}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap')
                      setLayoutEditing(true)
                    }}
                    aria-label="自定义布局"
                    className="ak-text-2 w-8 h-8 rounded-[12px] inline-flex items-center justify-center active:scale-95"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap')
                      setFeelSheetOpen(true)
                    }}
                    aria-label="全局设置"
                    className="ak-text-2 w-8 h-8 rounded-[12px] inline-flex items-center justify-center active:scale-95"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <nav aria-label="主工作区切换" className="ak-seg p-1 rounded-[16px] border space-y-1">
                {navItems.map((item) => {
                  const active = workspaceMode === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        if (workspaceMode === item.id) return
                        handlePrimaryTabSelect(item.id)
                      }}
                      className={clsx(
                        'w-full h-8 px-3 rounded-[12px] flex items-center text-xs font-medium transition-all touch-none',
                        active ? 'ak-active-tab border' : 'ak-text-2',
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </nav>
            </div>

            <VoiceTextDock compactLandscape />
          </aside>
        )}

        <div
          className={clsx(
            'safe-landscape-stage flex-1 min-w-0 h-full flex flex-col overflow-hidden',
            layoutEditing && 'safe-landscape-stage-full',
          )}
        >
          {layoutEditing && renderEditTopBar(true)}
          {renderMainStage(true)}
          {layoutEditing && renderEditInspectorDock()}
        </div>

        {renderSheets()}
      </div>
    )
  }

  return (
    <div className="ak-canvas h-full w-full flex flex-col overflow-hidden">
      {layoutEditing ? (
        renderEditTopBar(false)
      ) : (
        <header className="ak-chrome shrink-0 flex items-center justify-between gap-2 px-4 pb-1.5 safe-top">
          {renderHostStatusPill()}

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                setLayoutEditing(true)
              }}
              aria-label="自定义布局"
              className="ak-text-2 w-8 h-8 rounded-[12px] inline-flex items-center justify-center hover:opacity-90 active:scale-95 transition-transform"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                setFeelSheetOpen(true)
              }}
              aria-label="全局设置"
              className="ak-text-2 w-8 h-8 rounded-[12px] inline-flex items-center justify-center hover:opacity-90 active:scale-95 transition-transform"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}

      {renderMainStage(false)}

      {layoutEditing ? (
        renderEditInspectorDock()
      ) : (
        <>
          <nav aria-label="主工作区切换" className="ak-dock shrink-0 px-3.5 pt-1 pb-1.5">
            <div className="ak-seg grid grid-cols-3 p-0.5 rounded-[18px] border text-xs">
              {navItems.map((item) => {
                const active = workspaceMode === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      if (workspaceMode === item.id) return
                      handlePrimaryTabSelect(item.id)
                    }}
                    className={clsx(
                      'h-9 rounded-[15px] font-medium transition-all touch-none',
                      active ? 'ak-active-tab border' : 'ak-text-2',
                    )}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </nav>

          <VoiceTextDock />
        </>
      )}

      {renderSheets()}
    </div>
  )
}
