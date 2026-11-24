import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Crosshair,
  GripVertical,
  Hand,
  Lock,
  LockOpen,
  MousePointer2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  clampColumns,
  formatBentoSpan,
  normalizeDpadSlotIds,
  normalizePageZones,
  packBentoTiles,
  reorderTileIds,
} from '../input/bentoLayout'
import { TileGestureController } from '../input/tileGesture'
import { TrackpadController } from '../input/trackpad'
import type {
  EmbeddedPointerMode,
  MobileDeckPage,
  MobileDeckZone,
  MobileTile,
  PointerButtonName,
  TileGestureKind,
} from '../protocol/types'
import { registerPendingTileRequest, useMobileStore } from '../state/useMobileStore'
import {
  recenterNativeCursor,
  setNativeGyroClutch,
  setNativeGyroConfig,
  triggerHaptic,
  type HapticKind,
} from '../transport/nativeBridge'
import { getAccentStyle, getTileIcon } from '../ui/icons'

interface PageZoneRendererProps {
  page: MobileDeckPage
}

function resolveTileHaptic(tile: MobileTile | undefined, gesture: TileGestureKind): HapticKind {
  if (gesture === 'long') return 'heavy'
  if (gesture === 'double') return 'confirm'
  if (tile?.accent === 'rose' || tile?.id === 'remote.esc') return 'heavy'
  if (
    tile?.accent === 'emerald' ||
    tile?.icon === 'enter' ||
    tile?.icon === 'check' ||
    tile?.id === 'remote.ok'
  ) {
    return 'confirm'
  }
  return 'tap'
}

function GesturePills({
  tile,
  compact = false,
  isLight = false,
}: {
  tile: MobileTile
  compact?: boolean
  isLight?: boolean
}) {
  if (tile.mode !== 'hold' && !tile.hasDoubleClick && !tile.hasLongPress) return null
  const badgeCls = isLight
    ? 'bg-slate-900/[0.07] text-slate-700'
    : 'bg-white/[0.09] text-zinc-300'
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {tile.mode === 'hold' && (
        <span
          className={clsx(
            'rounded font-semibold tracking-wider',
            badgeCls,
            compact ? 'px-1 py-px text-[8px]' : 'px-1.5 py-0.5 text-[9px]',
          )}
        >
          HOLD
        </span>
      )}
      {tile.hasDoubleClick && (
        <span
          className={clsx(
            'rounded font-mono font-medium',
            badgeCls,
            compact ? 'px-1 py-px text-[8px]' : 'px-1 py-0.5 text-[9px]',
          )}
        >
          2×
        </span>
      )}
      {tile.hasLongPress && (
        <span
          className={clsx(
            'rounded font-medium',
            badgeCls,
            compact ? 'px-1 py-px text-[8px]' : 'px-1 py-0.5 text-[9px]',
          )}
        >
          长按
        </span>
      )}
    </span>
  )
}

let embeddedBtnSeq = 1
function nextEmbeddedPressId(button: PointerButtonName): string {
  embeddedBtnSeq += 1
  return `ebtn-${button}-${embeddedBtnSeq}`
}

interface EmbeddedPointerPadProps {
  pageId: string
  zone: MobileDeckZone
  editMode: boolean
  isLight: boolean
}

function EmbeddedPointerPad({ pageId, zone, editMode, isLight }: EmbeddedPointerPadProps) {
  const getClient = useMobileStore((s) => s.getClient)
  const phase = useMobileStore((s) => s.phase)
  const isDemoMode = useMobileStore((s) => s.isDemoMode)
  const gyroSensitivity = useMobileStore((s) => s.localFeel.gyroSensitivity)
  const updateZone = useMobileStore((s) => s.updateZone)

  const mode: EmbeddedPointerMode = zone.pointerMode === 'relative' ? 'relative' : 'trackpad'
  const [dragLocked, setDragLocked] = useState(false)
  const [activeTouches, setActiveTouches] = useState(0)
  const [clutchHeld, setClutchHeld] = useState(false)
  const [recenteredFlash, setRecenteredFlash] = useState(false)
  const [pressedButtons, setPressedButtons] = useState<Record<string, boolean>>({})

  const heldManualButtons = useRef<Map<PointerButtonName, string>>(new Map())
  const scrollClutchYRef = useRef<number | null>(null)
  const scrollResidualRef = useRef<number>(0)

  const controllerRef = useRef<TrackpadController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new TrackpadController({
      onMotion: (dx, dy) => {
        getClient().sendPointerMotion(dx, dy)
      },
      onScroll: (x, y) => {
        getClient().sendPointerScroll(x, y)
      },
      onButton: (button, btnPhase, pressId) => {
        if (btnPhase === 'down') triggerHaptic('tap')
        getClient().sendPointerButton(button, btnPhase, pressId)
      },
    })
  }

  useEffect(() => {
    const canStream = phase === 'active' && !isDemoMode && !editMode
    if (!canStream || mode === 'trackpad') {
      setNativeGyroClutch(false)
      setNativeGyroConfig('off', gyroSensitivity)
      setClutchHeld(false)
      return
    }
    setNativeGyroConfig('relative', gyroSensitivity)
    setNativeGyroClutch(false)
    setClutchHeld(false)
  }, [phase, isDemoMode, editMode, mode, gyroSensitivity])

  useEffect(() => {
    if (editMode) {
      controllerRef.current?.cancelAll()
      setDragLocked(false)
      setClutchHeld(false)
      setNativeGyroClutch(false)
      for (const [btn, pressId] of heldManualButtons.current.entries()) {
        getClient().sendPointerButton(btn, 'up', pressId)
      }
      heldManualButtons.current.clear()
      setPressedButtons({})
    }
  }, [editMode, getClient])

  useEffect(() => {
    const ctrl = controllerRef.current
    const manualMap = heldManualButtons.current
    return () => {
      ctrl?.cancelAll()
      setNativeGyroClutch(false)
      setNativeGyroConfig('off', 1.0)
      for (const [btn, pressId] of manualMap.entries()) {
        getClient().sendPointerButton(btn, 'up', pressId)
      }
      manualMap.clear()
    }
  }, [getClient])

  const handleModeSwitch = (nextMode: EmbeddedPointerMode) => {
    if (nextMode === mode) return
    triggerHaptic('tap')
    controllerRef.current?.cancelAll()
    setDragLocked(false)
    setClutchHeld(false)
    setNativeGyroClutch(false)
    updateZone(pageId, zone.id, { pointerMode: nextMode })
  }

  const handleRecenter = () => {
    recenterNativeCursor()
    setRecenteredFlash(true)
    setTimeout(() => setRecenteredFlash(false), 700)
  }

  const handlePhysicalButton = (button: PointerButtonName, down: boolean) => {
    if (editMode) return
    setPressedButtons((prev) => ({ ...prev, [button]: down }))
    if (mode === 'trackpad') {
      controllerRef.current?.setButton(button, down)
      return
    }
    if (down) {
      if (heldManualButtons.current.has(button)) return
      triggerHaptic('tap')
      const pressId = nextEmbeddedPressId(button)
      heldManualButtons.current.set(button, pressId)
      getClient().sendPointerButton(button, 'down', pressId)
    } else {
      const pressId = heldManualButtons.current.get(button)
      if (!pressId) return
      heldManualButtons.current.delete(button)
      getClient().sendPointerButton(button, 'up', pressId)
    }
  }

  if (editMode) {
    return (
      <div
        className={clsx(
          'min-h-[168px] rounded-[24px] border border-dashed p-4 flex flex-col items-center justify-center gap-2 text-center',
          isLight
            ? 'border-blue-500/40 bg-blue-600/[0.04]'
            : 'border-blue-400/35 bg-[#0f1420]/90',
        )}
      >
        <span
          className={clsx(
            'w-10 h-10 rounded-2xl border inline-flex items-center justify-center',
            isLight
              ? 'bg-blue-600/12 border-blue-500/25 text-blue-600'
              : 'bg-blue-500/15 border-blue-400/25 text-blue-300',
          )}
        >
          {mode === 'trackpad' ? (
            <MousePointer2 className="w-5 h-5" />
          ) : (
            <Compass className="w-5 h-5" />
          )}
        </span>
        <div className="ak-text-1 text-xs font-semibold">
          内嵌{mode === 'trackpad' ? '多点触控板' : '体感飞鼠离合区'}（混排区块）
        </div>
        <div className="ak-text-2 text-[11px]">
          完成编辑后可直接在同屏上方操控鼠标 + 下方盲操快捷键
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 min-h-[198px] select-none">
      {mode === 'trackpad' ? (
        <div
          className="trackpad-dots ak-border relative flex-1 min-h-[144px] rounded-[22px] border touch-none select-none overflow-hidden"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            setActiveTouches((n) => n + 1)
            controllerRef.current?.onPointerDown(e.pointerId, e.clientX, e.clientY)
          }}
          onPointerMove={(e) => {
            controllerRef.current?.onPointerMove(e.pointerId, e.clientX, e.clientY)
          }}
          onPointerUp={(e) => {
            setActiveTouches((n) => Math.max(0, n - 1))
            controllerRef.current?.onPointerUp(e.pointerId)
          }}
          onPointerCancel={(e) => {
            setActiveTouches((n) => Math.max(0, n - 1))
            controllerRef.current?.onPointerCancel(e.pointerId)
          }}
        >
          {/* Top-left quick mode toggle */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="ak-elevated absolute top-2.5 left-2.5 inline-flex items-center p-0.5 rounded-full border opacity-95"
          >
            <button
              type="button"
              onClick={() => handleModeSwitch('trackpad')}
              className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-blue-600 text-white"
            >
              触控板
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('relative')}
              className="px-2 py-0.5 rounded-full text-[10.5px] font-medium ak-text-2"
            >
              体感飞鼠
            </button>
          </div>

          {/* Top-right Recenter + Drag Lock Pills */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-2.5 right-2.5 inline-flex items-center gap-1"
          >
            <button
              type="button"
              onClick={handleRecenter}
              aria-label="归中"
              className={clsx(
                'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors',
                recenteredFlash
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'ak-elevated ak-text-2 opacity-95',
              )}
            >
              <Crosshair className="w-2.5 h-2.5" />
              <span>{recenteredFlash ? '已归中' : '归中'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !dragLocked
                setDragLocked(next)
                controllerRef.current?.setButton('left', next)
                triggerHaptic(next ? 'heavy' : 'tap')
              }}
              className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors',
                dragLocked
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'ak-elevated ak-text-2 opacity-95',
              )}
            >
              {dragLocked ? <Lock className="w-2.5 h-2.5" /> : <LockOpen className="w-2.5 h-2.5" />}
              <span>拖拽锁</span>
            </button>
          </div>

          <div className="pointer-events-none absolute inset-0 pt-5 flex flex-col items-center justify-center px-5 text-center">
            <span className="ak-text-2 text-[11.5px] font-medium">
              {activeTouches >= 2
                ? '双指平滑滚轮 · 轻点右键'
                : dragLocked
                  ? '左键拖拽已锁定 · 滑动移窗'
                  : '单指移动 · 轻点左键 · 双指滚轮'}
            </span>
          </div>
        </div>
      ) : (
        <div className="relative flex-1 min-h-[144px] flex flex-col">
          <div className="ak-elevated absolute top-2.5 left-2.5 z-10 inline-flex items-center p-0.5 rounded-full border opacity-95">
            <button
              type="button"
              onClick={() => handleModeSwitch('trackpad')}
              className="px-2 py-0.5 rounded-full text-[10.5px] font-medium ak-text-2"
            >
              触控板
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('relative')}
              className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-blue-600 text-white"
            >
              体感飞鼠
            </button>
          </div>

          <button
            type="button"
            onClick={handleRecenter}
            aria-label="归中"
            className={clsx(
              'absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors',
              recenteredFlash
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'ak-elevated ak-text-2 opacity-95',
            )}
          >
            <Crosshair className="w-2.5 h-2.5" />
            <span>{recenteredFlash ? '已归中' : '归中'}</span>
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId)
              setClutchHeld(true)
              triggerHaptic('tap')
              if (phase === 'active' && !isDemoMode) {
                setNativeGyroConfig('relative', gyroSensitivity)
                setNativeGyroClutch(true)
              }
            }}
            onPointerUp={() => {
              setClutchHeld(false)
              setNativeGyroClutch(false)
            }}
            onPointerCancel={() => {
              setClutchHeld(false)
              setNativeGyroClutch(false)
            }}
            className={clsx(
              'flex-1 rounded-[22px] border flex flex-col items-center justify-center gap-1.5 px-4 pt-5 text-center touch-none transition-all',
              clutchHeld ? 'ak-clutch-engaged scale-[0.99]' : 'chassis-well',
            )}
          >
            <Hand
              className={clsx(
                'w-5 h-5',
                clutchHeld ? (isLight ? 'text-blue-600' : 'text-blue-300') : 'ak-text-2',
              )}
            />
            <div className="ak-text-1 text-xs font-bold">
              {clutchHeld ? '飞鼠离合啮合中 · 挥腕移鼠' : '按住启用体感飞鼠（松手即停）'}
            </div>
          </button>
        </div>
      )}

      {/* Compact Left / Scroll / Right strip */}
      <div className="grid grid-cols-12 gap-2 h-[44px] shrink-0">
        <button
          type="button"
          className={clsx(
            'tile-surface ak-elevated col-span-5 rounded-2xl border text-xs font-semibold touch-none',
            pressedButtons.left && 'tile-pressed border-blue-500/50',
          )}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            handlePhysicalButton('left', true)
          }}
          onPointerUp={() => handlePhysicalButton('left', false)}
          onPointerCancel={() => handlePhysicalButton('left', false)}
        >
          左键
        </button>

        <div
          role="button"
          tabIndex={0}
          aria-label="上下滑动滚轮"
          className={clsx(
            'tile-surface ak-elevated-alt col-span-2 rounded-2xl border flex items-center justify-center text-[11px] font-medium touch-none',
            pressedButtons.scroll && 'tile-pressed border-blue-500/50',
          )}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            scrollClutchYRef.current = e.clientY
            scrollResidualRef.current = 0
            setPressedButtons((p) => ({ ...p, scroll: true }))
            triggerHaptic('tap')
          }}
          onPointerMove={(e) => {
            if (scrollClutchYRef.current === null) return
            const dy = e.clientY - scrollClutchYRef.current
            scrollClutchYRef.current = e.clientY
            scrollResidualRef.current += dy * 0.25
            if (Math.abs(scrollResidualRef.current) >= 0.35) {
              getClient().sendPointerScroll(0, scrollResidualRef.current)
              scrollResidualRef.current = 0
            }
          }}
          onPointerUp={() => {
            scrollClutchYRef.current = null
            scrollResidualRef.current = 0
            setPressedButtons((p) => ({ ...p, scroll: false }))
          }}
          onPointerCancel={() => {
            scrollClutchYRef.current = null
            scrollResidualRef.current = 0
            setPressedButtons((p) => ({ ...p, scroll: false }))
          }}
        >
          滚轮
        </div>

        <button
          type="button"
          className={clsx(
            'tile-surface ak-elevated col-span-5 rounded-2xl border text-xs font-semibold touch-none',
            pressedButtons.right && 'tile-pressed border-blue-500/50',
          )}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            handlePhysicalButton('right', true)
          }}
          onPointerUp={() => handlePhysicalButton('right', false)}
          onPointerCancel={() => handlePhysicalButton('right', false)}
        >
          右键
        </button>
      </div>
    </div>
  )
}

interface DragSession {
  pointerId: number
  tileId: string
  zoneId: string
  zoneKind: 'bento-grid' | 'dpad-3x3'
  startX: number
  startY: number
  started: boolean
  currentZones: MobileDeckZone[]
  lastOverKey: string
}

export function PageZoneRenderer({ page }: PageZoneRendererProps) {
  const tileFeedback = useMobileStore((s) => s.tileFeedback)
  const deck = useMobileStore((s) => s.deck)
  const editMode = useMobileStore((s) => s.layoutEditing)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const getClient = useMobileStore((s) => s.getClient)

  const openTileEditor = useMobileStore((s) => s.openTileEditor)
  const cycleTileSpan = useMobileStore((s) => s.cycleTileSpan)
  const addTileToPage = useMobileStore((s) => s.addTileToPage)
  const updateZone = useMobileStore((s) => s.updateZone)
  const moveZone = useMobileStore((s) => s.moveZone)
  const deleteZone = useMobileStore((s) => s.deleteZone)
  const updatePageZonesOrder = useMobileStore((s) => s.updatePageZonesOrder)

  const isLight = effectiveTheme === 'light'

  const [pressedIds, setPressedIds] = useState<Record<string, boolean>>({})
  const [draggedTileId, setDraggedTileId] = useState<string | null>(null)
  const [dragZones, setDragZones] = useState<MobileDeckZone[] | null>(null)

  const tilesMapRef = useRef<Map<string, MobileTile>>(new Map())
  const byId = useMemo(() => {
    const m = new Map(page.tiles.map((t) => [t.id, t]))
    tilesMapRef.current = m
    return m
  }, [page.tiles])

  const normalizedZones = useMemo(() => normalizePageZones(page), [page])
  const effectiveZones = dragZones ?? normalizedZones

  const dragSessionRef = useRef<DragSession | null>(null)
  const lastPointerTapAtRef = useRef<number>(0)

  const controllerRef = useRef<TileGestureController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new TileGestureController(
      {
        onActivate: (tileId, gesture) => {
          triggerHaptic(resolveTileHaptic(tilesMapRef.current.get(tileId), gesture))
          const reqId = getClient().sendTileActivate(tileId, gesture)
          registerPendingTileRequest(reqId, tileId)
        },
        onHoldBegin: (tileId, pressId) => {
          triggerHaptic('heavy')
          const reqId = getClient().sendTileHold(tileId, pressId, true)
          registerPendingTileRequest(reqId, tileId)
        },
        onHoldEnd: (tileId, pressId) => {
          triggerHaptic('tap')
          const reqId = getClient().sendTileHold(tileId, pressId, false)
          registerPendingTileRequest(reqId, tileId)
        },
      },
      {
        doubleClickWindowMs: deck.doubleClickWindowMs,
        longPressWindowMs: deck.longPressWindowMs,
      },
    )
  }

  useEffect(() => {
    controllerRef.current?.updateWindows(deck.doubleClickWindowMs, deck.longPressWindowMs)
  }, [deck.doubleClickWindowMs, deck.longPressWindowMs])

  useEffect(() => {
    if (editMode) {
      controllerRef.current?.cancelAll()
      setPressedIds({})
    } else {
      dragSessionRef.current = null
      setDraggedTileId(null)
      setDragZones(null)
    }
  }, [editMode])

  useEffect(() => {
    const ctrl = controllerRef.current
    return () => ctrl?.cancelAll()
  }, [])

  const fbRing = (id: string) => {
    if (editMode) return ''
    const fb = tileFeedback[id]
    if (!fb || Date.now() - fb.at >= 650) return ''
    return fb.status === 'ok' ? 'ring-1 ring-emerald-500/80' : 'ring-2 ring-rose-500/85'
  }

  const handleTilePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    tile: MobileTile,
    zone: MobileDeckZone,
  ) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (!editMode) {
      setPressedIds((prev) => ({ ...prev, [tile.id]: true }))
      controllerRef.current?.onDown(tile)
      return
    }
    if (zone.kind !== 'bento-grid' && zone.kind !== 'dpad-3x3') return
    dragSessionRef.current = {
      pointerId: e.pointerId,
      tileId: tile.id,
      zoneId: zone.id,
      zoneKind: zone.kind,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
      currentZones: normalizedZones.map((z) => ({ ...z, tileIds: [...z.tileIds] })),
      lastOverKey: '',
    }
  }

  const handleTilePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!editMode) return
    const session = dragSessionRef.current
    if (!session || session.pointerId !== e.pointerId) return

    if (!session.started) {
      const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY)
      if (dist <= 8) return
      session.started = true
      setDraggedTileId(session.tileId)
      setDragZones(session.currentZones)
      triggerHaptic('heavy')
    }

    if (typeof document.elementFromPoint !== 'function') return
    const hitEl = document.elementFromPoint(e.clientX, e.clientY)
    if (!hitEl) return

    if (session.zoneKind === 'bento-grid') {
      const overBtn = hitEl.closest('[data-bento-tile-id]') as HTMLElement | null
      const overTileId = overBtn?.dataset.bentoTileId
      const overZoneId = overBtn?.dataset.zoneId
      if (!overTileId || overZoneId !== session.zoneId || overTileId === session.tileId) {
        if (!overTileId) session.lastOverKey = ''
        return
      }
      if (session.lastOverKey === overTileId) return
      session.lastOverKey = overTileId

      const nextZones = session.currentZones.map((z) => {
        if (z.id !== session.zoneId) return z
        return {
          ...z,
          tileIds: reorderTileIds(z.tileIds, session.tileId, overTileId),
        }
      })
      session.currentZones = nextZones
      setDragZones(nextZones)
      triggerHaptic('tap')
      return
    }

    if (session.zoneKind === 'dpad-3x3') {
      const slotEl = hitEl.closest('[data-dpad-slot-index]') as HTMLElement | null
      const overZoneId = slotEl?.dataset.zoneId
      const rawIdx = slotEl?.dataset.dpadSlotIndex
      if (overZoneId !== session.zoneId || rawIdx === undefined) return
      const overIdx = Number.parseInt(rawIdx, 10)
      if (!Number.isFinite(overIdx) || overIdx < 0 || overIdx >= 9) return

      const zoneObj = session.currentZones.find((z) => z.id === session.zoneId)
      if (!zoneObj) return
      const slots = normalizeDpadSlotIds(zoneObj.tileIds)
      const fromIdx = slots.indexOf(session.tileId)
      if (fromIdx < 0 || fromIdx === overIdx) return

      const swapKey = `slot:${overIdx}`
      if (session.lastOverKey === swapKey) return
      session.lastOverKey = swapKey

      const nextSlots = [...slots]
      const tmp = nextSlots[overIdx]
      nextSlots[overIdx] = session.tileId
      nextSlots[fromIdx] = tmp

      const nextZones = session.currentZones.map((z) =>
        z.id === session.zoneId ? { ...z, tileIds: nextSlots } : z,
      )
      session.currentZones = nextZones
      setDragZones(nextZones)
      triggerHaptic('tap')
    }
  }

  const finishTilePointer = (tileId: string, cancelled: boolean) => {
    if (!editMode) {
      setPressedIds((prev) => ({ ...prev, [tileId]: false }))
      if (cancelled) controllerRef.current?.onCancel(tileId)
      else controllerRef.current?.onUp(tileId)
      return
    }

    const session = dragSessionRef.current
    dragSessionRef.current = null
    setDraggedTileId(null)
    setDragZones(null)
    if (!session) return

    if (session.started) {
      if (!cancelled) {
        lastPointerTapAtRef.current = Date.now()
        updatePageZonesOrder(page.id, session.currentZones)
      }
    } else if (!cancelled) {
      lastPointerTapAtRef.current = Date.now()
      triggerHaptic('tap')
      openTileEditor(page.id, session.zoneId, session.tileId)
    }
  }

  const handleTileFallbackClick = (zoneId: string, tileId: string) => {
    if (!editMode) return
    if (Date.now() - lastPointerTapAtRef.current < 300) return
    triggerHaptic('tap')
    openTileEditor(page.id, zoneId, tileId)
  }

  const isClassicThreeZoneLayout =
    !editMode &&
    effectiveZones.length === 3 &&
    effectiveZones[0].kind === 'bento-grid' &&
    effectiveZones[1].kind === 'dpad-3x3' &&
    effectiveZones[2].kind === 'bento-grid'

  return (
    <div
      className={clsx(
        'w-full flex flex-col gap-3 select-none pb-2',
        isClassicThreeZoneLayout && 'min-h-full justify-between gap-2.5 pb-0',
      )}
    >
      {effectiveZones.map((zone, zoneIdx) => {
        const zoneLabel =
          zone.kind === 'bento-grid'
            ? 'Bento 自由网格'
            : zone.kind === 'dpad-3x3'
              ? '3×3 导航方向盘'
              : '内嵌触控 / 飞鼠'

        return (
          <section
            key={zone.id}
            className={clsx(
              'flex flex-col gap-2',
              zone.kind === 'dpad-3x3' && isClassicThreeZoneLayout && 'flex-[2.4]',
              editMode && 'ak-pill p-2.5 rounded-[24px] border',
            )}
          >
            {/* Zone Edit Header */}
            {editMode && (
              <div className="flex items-center justify-between gap-1.5 px-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="ak-text-1 text-[11px] font-semibold">{zoneLabel}</span>

                  {zone.kind === 'bento-grid' && (
                    <div className="ak-seg inline-flex items-center p-0.5 rounded-lg border">
                      {([2, 3, 4] as const).map((colOpt) => {
                        const activeCol = clampColumns(zone.columns, page.columns) === colOpt
                        return (
                          <button
                            key={colOpt}
                            type="button"
                            onClick={() => {
                              triggerHaptic('tap')
                              updateZone(page.id, zone.id, { columns: colOpt })
                            }}
                            className={clsx(
                              'px-2 py-0.5 rounded-md text-[10.5px] font-semibold transition-colors',
                              activeCol ? 'bg-blue-600 text-white' : 'ak-text-2',
                            )}
                          >
                            {colOpt}列
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {zone.kind === 'pointer-pad' && (
                    <div className="ak-seg inline-flex items-center p-0.5 rounded-lg border">
                      {(
                        [
                          { id: 'trackpad', label: '触控板' },
                          { id: 'relative', label: '体感飞鼠' },
                        ] as const
                      ).map((opt) => {
                        const activeMode = (zone.pointerMode ?? 'trackpad') === opt.id
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              triggerHaptic('tap')
                              updateZone(page.id, zone.id, { pointerMode: opt.id })
                            }}
                            className={clsx(
                              'px-2 py-0.5 rounded-md text-[10.5px] font-semibold transition-colors',
                              activeMode ? 'bg-blue-600 text-white' : 'ak-text-2',
                            )}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {zone.kind === 'bento-grid' && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap')
                        const created = addTileToPage(page.id, zone.id)
                        if (created) openTileEditor(page.id, zone.id, created.id)
                      }}
                      className={clsx(
                        'h-6 px-2 rounded-lg border text-[10.5px] font-semibold inline-flex items-center gap-0.5',
                        isLight
                          ? 'bg-blue-600/12 border-blue-500/30 text-blue-700'
                          : 'bg-blue-500/15 border-blue-400/30 text-blue-200',
                      )}
                    >
                      <Plus className="w-3 h-3" />
                      <span>加键</span>
                    </button>
                  )}

                  {effectiveZones.length > 1 && (
                    <>
                      <button
                        type="button"
                        disabled={zoneIdx === 0}
                        onClick={() => {
                          triggerHaptic('tap')
                          moveZone(page.id, zone.id, -1)
                        }}
                        aria-label="上移区块"
                        className="ak-elevated ak-text-2 w-6 h-6 rounded-lg border inline-flex items-center justify-center disabled:opacity-30"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={zoneIdx === effectiveZones.length - 1}
                        onClick={() => {
                          triggerHaptic('tap')
                          moveZone(page.id, zone.id, 1)
                        }}
                        aria-label="下移区块"
                        className="ak-elevated ak-text-2 w-6 h-6 rounded-lg border inline-flex items-center justify-center disabled:opacity-30"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('heavy')
                          deleteZone(page.id, zone.id)
                        }}
                        aria-label="删除区块"
                        className={clsx(
                          'w-6 h-6 rounded-lg border inline-flex items-center justify-center',
                          isLight
                            ? 'bg-rose-600/10 border-rose-500/30 text-rose-700'
                            : 'bg-rose-500/15 border-rose-400/30 text-rose-300',
                        )}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Zone Body: 1. Bento Grid */}
            {zone.kind === 'bento-grid' &&
              (() => {
                const cols = clampColumns(zone.columns, page.columns)
                const zoneTiles = zone.tileIds
                  .map((id) => byId.get(id))
                  .filter((t): t is MobileTile => Boolean(t))
                const packed = packBentoTiles(zoneTiles, cols)
                const isCompactStrip =
                  !editMode &&
                  isClassicThreeZoneLayout &&
                  zoneIdx === 0 &&
                  packed.totalRows === 1
                const isBottomQuickPair =
                  !editMode &&
                  isClassicThreeZoneLayout &&
                  zoneIdx === 2 &&
                  packed.columns === 2 &&
                  packed.items.every((it) => it.colSpan === 1 && it.rowSpan === 1)

                return (
                  <div
                    className="grid gap-2.5 w-full"
                    style={{
                      gridTemplateColumns: `repeat(${packed.columns}, minmax(0, 1fr))`,
                      gridAutoRows: isCompactStrip
                        ? 'minmax(60px, auto)'
                        : isBottomQuickPair
                          ? 'minmax(72px, auto)'
                          : 'minmax(88px, auto)',
                    }}
                  >
                    {packed.items.map(({ tile, col, row, colSpan, rowSpan }) => {
                      const Icon = getTileIcon(tile.icon)
                      const style = getAccentStyle(tile.accent, isLight)
                      const pressed = Boolean(pressedIds[tile.id])
                      const isDragged = draggedTileId === tile.id
                      const spanLabel = formatBentoSpan(colSpan, rowSpan)
                      const isTall = colSpan === 1 && rowSpan === 2
                      const isHero = colSpan === 2 && rowSpan === 2
                      const silkscreenText =
                        tile.actionSummary ?? tile.subtitle ?? '桌面端绑定'

                      return (
                        <button
                          key={tile.id}
                          type="button"
                          data-bento-tile-id={tile.id}
                          data-zone-id={zone.id}
                          style={{
                            gridColumn: `${col + 1} / span ${colSpan}`,
                            gridRow: `${row + 1} / span ${rowSpan}`,
                          }}
                          onPointerDown={(e) => handleTilePointerDown(e, tile, zone)}
                          onPointerMove={handleTilePointerMove}
                          onPointerUp={() => finishTilePointer(tile.id, false)}
                          onPointerCancel={() => finishTilePointer(tile.id, true)}
                          onClick={() => handleTileFallbackClick(zone.id, tile.id)}
                          className={clsx(
                            'tile-surface relative rounded-[20px] border text-left select-none touch-none overflow-hidden',
                            style.card,
                            isCompactStrip || isBottomQuickPair
                              ? 'px-3 py-2 flex items-center gap-2.5'
                              : isTall
                                ? 'p-3.5 flex flex-col items-center justify-between text-center min-h-[186px]'
                                : isHero
                                  ? 'p-4 flex flex-col justify-between min-h-[186px]'
                                  : 'p-3 flex flex-col justify-between',
                            pressed && !editMode && clsx('tile-pressed', style.pressedGlow),
                            editMode && 'border-dashed',
                            isDragged &&
                              'z-30 scale-[1.03] ring-2 ring-blue-500 shadow-[0_14px_30px_rgba(15,23,42,0.35)] opacity-95',
                            fbRing(tile.id),
                          )}
                        >
                          {/* Compact horizontal layout for unedited Classic Remote top/bottom bars */}
                          {isCompactStrip || isBottomQuickPair ? (
                            <>
                              <span
                                className={clsx(
                                  'rounded-xl inline-flex items-center justify-center shrink-0',
                                  isCompactStrip ? 'w-8 h-8' : 'w-9 h-9',
                                  style.iconBg,
                                  style.iconText,
                                )}
                              >
                                <Icon className="w-4 h-4" strokeWidth={2.1} />
                              </span>
                              <div className="min-w-0 flex-1 leading-tight">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="ak-text-1 text-[13px] font-semibold truncate">
                                    {tile.label}
                                  </span>
                                  <GesturePills tile={tile} compact isLight={isLight} />
                                </div>
                                <div
                                  className={clsx(
                                    'text-[10.5px] font-mono truncate mt-0.5',
                                    style.silkscreen,
                                  )}
                                >
                                  {silkscreenText}
                                </div>
                              </div>
                            </>
                          ) : isTall ? (
                            /* 1x2 Tall Vertical Hardware Rocker / Strip */
                            <>
                              <div className="w-full flex items-center justify-between">
                                {editMode ? (
                                  <GripVertical className="w-3.5 h-3.5 ak-text-3" />
                                ) : (
                                  <span
                                    className={clsx(
                                      'w-1.5 h-1.5 rounded-full',
                                      isLight ? 'bg-slate-400/50' : 'bg-white/15',
                                    )}
                                  />
                                )}
                                <GesturePills tile={tile} compact isLight={isLight} />
                              </div>

                              <div className="flex flex-col items-center gap-2.5 my-auto">
                                <span
                                  className={clsx(
                                    'w-11 h-11 rounded-2xl inline-flex items-center justify-center border ak-border',
                                    style.iconBg,
                                    style.iconText,
                                  )}
                                >
                                  <Icon className="w-5 h-5" strokeWidth={2.2} />
                                </span>
                                <div className="space-y-0.5 px-1">
                                  <div className="ak-text-1 text-[14px] font-bold leading-snug line-clamp-2">
                                    {tile.label}
                                  </div>
                                  {tile.subtitle && tile.actionSummary && (
                                    <div className="ak-text-2 text-[10px] truncate max-w-[88px]">
                                      {tile.subtitle}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div
                                className={clsx(
                                  'w-full flex items-center justify-center',
                                  editMode && 'pb-5',
                                )}
                              >
                                <span
                                  className={clsx(
                                    'ak-code-chip px-2 py-0.5 rounded-md border text-[10px] font-mono truncate max-w-full',
                                    style.silkscreen,
                                  )}
                                >
                                  {silkscreenText}
                                </span>
                              </div>
                            </>
                          ) : isHero ? (
                            /* 2x2 Hero Hardware Action Pad */
                            <>
                              <div className="flex items-start justify-between gap-2 w-full">
                                <span
                                  className={clsx(
                                    'w-12 h-12 rounded-2xl inline-flex items-center justify-center border ak-border shrink-0',
                                    style.iconBg,
                                    style.iconText,
                                  )}
                                >
                                  <Icon className="w-6 h-6" strokeWidth={2.2} />
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <GesturePills tile={tile} isLight={isLight} />
                                  {editMode && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] ak-text-3">
                                      <GripVertical className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className={clsx('min-w-0 space-y-1', editMode && 'pr-12')}>
                                <div className="ak-text-1 text-[16.5px] font-bold tracking-tight truncate">
                                  {tile.label}
                                </div>
                                {tile.subtitle && (
                                  <div className="ak-text-2 text-xs truncate">{tile.subtitle}</div>
                                )}
                                <div className="pt-0.5">
                                  <span
                                    className={clsx(
                                      'ak-code-chip inline-block px-2 py-0.5 rounded-md border text-[11px] font-mono truncate max-w-full',
                                      style.silkscreen,
                                    )}
                                  >
                                    {tile.actionSummary ?? '桌面端绑定动作'}
                                  </span>
                                </div>
                              </div>
                            </>
                          ) : (
                            /* 1x1 Standard Square & 2x1 Wide Bar */
                            <>
                              <div className="flex items-start justify-between gap-1.5 w-full">
                                <span
                                  className={clsx(
                                    'w-8 h-8 rounded-xl inline-flex items-center justify-center shrink-0',
                                    style.iconBg,
                                    style.iconText,
                                  )}
                                >
                                  <Icon className="w-[17px] h-[17px]" strokeWidth={2.1} />
                                </span>

                                <div className="flex items-center gap-1 flex-wrap justify-end">
                                  <GesturePills tile={tile} compact isLight={isLight} />
                                  {editMode && (
                                    <GripVertical className="w-3.5 h-3.5 ak-text-3 shrink-0" />
                                  )}
                                </div>
                              </div>

                              <div className={clsx('mt-2 min-w-0', editMode && 'pr-11')}>
                                <div className="ak-text-1 text-[13.5px] font-semibold truncate leading-tight">
                                  {tile.label}
                                </div>
                                <div
                                  className={clsx(
                                    'text-[10.5px] font-mono truncate mt-0.5 leading-tight',
                                    style.silkscreen,
                                  )}
                                >
                                  {silkscreenText}
                                </div>
                              </div>
                            </>
                          )}

                          {/* 1-Tap Corner Span Quick-Cycle Pill in Edit Mode */}
                          {editMode && (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`切换尺寸 ${tile.label} (${spanLabel})`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                triggerHaptic('tap')
                                cycleTileSpan(page.id, tile.id)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  triggerHaptic('tap')
                                  cycleTileSpan(page.id, tile.id)
                                }
                              }}
                              className={clsx(
                                'absolute bottom-2 right-2 z-20 px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-bold active:scale-95 shadow-xs',
                                isLight
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-black/75 border-blue-400/45 text-blue-200',
                              )}
                            >
                              {spanLabel}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}

            {/* Zone Body: 2. 3x3 Balanced Square Navigation Matrix */}
            {zone.kind === 'dpad-3x3' &&
              (() => {
                const slots = normalizeDpadSlotIds(zone.tileIds)

                return (
                  <div className="chassis-well min-h-[228px] flex-1 p-2.5 rounded-[26px] border flex flex-col">
                    <div className="grid grid-cols-3 grid-rows-3 gap-2.5 flex-1 min-h-[208px]">
                      {slots.map((slotId, slotIdx) => {
                        const tile = slotId ? byId.get(slotId) : undefined

                        if (!tile) {
                          return editMode ? (
                            <button
                              key={`empty-${slotIdx}`}
                              type="button"
                              data-dpad-slot-index={slotIdx}
                              data-zone-id={zone.id}
                              onClick={() => {
                                triggerHaptic('tap')
                                const created = addTileToPage(page.id, zone.id, slotIdx)
                                if (created) openTileEditor(page.id, zone.id, created.id)
                              }}
                              className="ak-pill ak-text-3 rounded-2xl border border-dashed flex flex-col items-center justify-center gap-1"
                            >
                              <Plus className="w-4 h-4" />
                              <span className="text-[10px]">加键</span>
                            </button>
                          ) : (
                            <div
                              key={`blank-${slotIdx}`}
                              className={clsx(
                                'rounded-2xl border',
                                isLight
                                  ? 'bg-slate-900/[0.03] border-slate-900/[0.04]'
                                  : 'bg-black/20 border-white/[0.03]',
                              )}
                            />
                          )
                        }

                        const isCenter = slotIdx === 4
                        const isCardinal =
                          slotIdx === 1 || slotIdx === 3 || slotIdx === 5 || slotIdx === 7
                        const style = getAccentStyle(tile.accent, isLight)
                        const pressed = Boolean(pressedIds[tile.id])
                        const isDragged = draggedTileId === tile.id
                        const Icon = getTileIcon(tile.icon)

                        const CardinalChevron =
                          tile.icon === 'arrow-up'
                            ? ChevronUp
                            : tile.icon === 'arrow-down'
                              ? ChevronDown
                              : tile.icon === 'arrow-left'
                                ? ChevronLeft
                                : tile.icon === 'arrow-right'
                                  ? ChevronRight
                                  : null

                        const centerBlueCard =
                          isCenter && tile.accent === 'blue'
                            ? isLight
                              ? 'border-blue-600 bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-[0_6px_18px_rgba(37,99,235,0.28)]'
                              : 'border-blue-400/45 bg-gradient-to-b from-[#243658] to-[#172238] text-white shadow-[0_0_20px_rgba(0,0,0,0.35)]'
                            : null

                        return (
                          <button
                            key={tile.id}
                            type="button"
                            aria-label={tile.label}
                            data-bento-tile-id={tile.id}
                            data-dpad-slot-index={slotIdx}
                            data-zone-id={zone.id}
                            onPointerDown={(e) => handleTilePointerDown(e, tile, zone)}
                            onPointerMove={handleTilePointerMove}
                            onPointerUp={() => finishTilePointer(tile.id, false)}
                            onPointerCancel={() => finishTilePointer(tile.id, true)}
                            onClick={() => handleTileFallbackClick(zone.id, tile.id)}
                            className={clsx(
                              'tile-surface relative flex flex-col items-center justify-center gap-0.5 px-1.5 touch-none select-none',
                              isCenter
                                ? clsx('rounded-[20px] border', centerBlueCard ?? style.card)
                                : isCardinal && tile.accent === 'slate'
                                  ? clsx(
                                      'rounded-2xl border',
                                      isLight
                                        ? 'border-slate-900/[0.13] bg-white text-slate-900'
                                        : 'border-white/[0.12] bg-[#1b202d] text-zinc-100',
                                    )
                                  : clsx('rounded-2xl border', style.card),
                              pressed && !editMode && clsx('tile-pressed', style.pressedGlow),
                              editMode && 'border-dashed',
                              isDragged && 'z-30 scale-[1.04] ring-2 ring-blue-500 opacity-95',
                              fbRing(tile.id),
                            )}
                          >
                            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
                              <GesturePills
                                tile={tile}
                                compact
                                isLight={isLight && !centerBlueCard}
                              />
                              {editMode && (
                                <Pencil
                                  className={clsx(
                                    'w-2.5 h-2.5',
                                    centerBlueCard
                                      ? 'text-white/85'
                                      : isLight
                                        ? 'text-blue-600'
                                        : 'text-blue-300/80',
                                  )}
                                />
                              )}
                            </div>

                            {isCenter ? (
                              <>
                                {tile.icon !== 'enter' && (
                                  <Icon
                                    className={clsx(
                                      'w-4 h-4',
                                      centerBlueCard ? 'text-white' : style.iconText,
                                    )}
                                  />
                                )}
                                <span
                                  className={clsx(
                                    'text-[14.5px] font-bold tracking-wide truncate max-w-full',
                                    centerBlueCard ? 'text-white' : 'ak-text-1',
                                  )}
                                >
                                  {tile.label}
                                </span>
                                {(tile.actionSummary || tile.subtitle) && (
                                  <span
                                    className={clsx(
                                      'px-2 py-0.5 rounded-md border text-[10px] font-mono truncate max-w-[90px]',
                                      centerBlueCard
                                        ? 'bg-black/20 border-white/20 text-white'
                                        : clsx('ak-code-chip', style.silkscreen),
                                    )}
                                  >
                                    {tile.actionSummary ?? tile.subtitle}
                                  </span>
                                )}
                              </>
                            ) : CardinalChevron ? (
                              <>
                                <CardinalChevron
                                  className="w-7 h-7 ak-text-1"
                                  strokeWidth={2.3}
                                />
                                <span className="ak-text-2 text-[10px] font-mono truncate max-w-[84px]">
                                  {tile.actionSummary ?? tile.subtitle ?? tile.label}
                                </span>
                              </>
                            ) : (
                              <>
                                <Icon className={clsx('w-4 h-4', style.iconText)} />
                                <span className="ak-text-1 text-xs font-medium truncate max-w-full">
                                  {tile.label}
                                </span>
                                {(tile.actionSummary || tile.subtitle) &&
                                  (tile.actionSummary ?? tile.subtitle) !== tile.label && (
                                    <span
                                      className={clsx(
                                        'text-[10px] font-mono truncate max-w-full',
                                        style.silkscreen,
                                      )}
                                    >
                                      {tile.actionSummary ?? tile.subtitle}
                                    </span>
                                  )}
                              </>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

            {/* Zone Body: 3. Embedded Interactive Pointer / Clutch Pad */}
            {zone.kind === 'pointer-pad' && (
              <EmbeddedPointerPad
                pageId={page.id}
                zone={zone}
                editMode={editMode}
                isLight={isLight}
              />
            )}
          </section>
        )
      })}
    </div>
  )
}
