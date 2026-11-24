import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Crosshair,
  Lock,
  LockOpen,
  MousePointer2,
  Plus,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  CLICKPAD_RING_SLOT_SPECS,
  GESTURE_PAD_SLOT_SPECS,
  clampColumns,
  normalizeDpadSlotIds,
  normalizeGesturePadSlotIds,
  normalizePageZones,
  packBentoTiles,
  reorderTileIds,
} from '../input/bentoLayout'
import { TileGestureController } from '../input/tileGesture'
import { TrackpadController } from '../input/trackpad'
import type {
  EmbeddedPadHeight,
  EmbeddedPointerMode,
  MobileDeckPage,
  MobileDeckZone,
  MobileTile,
  PointerButtonName,
  TileGestureKind,
} from '../protocol/types'
import {
  registerPendingTileRequest,
  useMobileStore,
  type SelectedEditItem,
} from '../state/useMobileStore'
import {
  notifyNativePointerClickPulse,
  recenterNativeCursor,
  setNativeGyroClutch,
  setNativeGyroConfig,
  triggerHaptic,
  type HapticKind,
} from '../transport/nativeBridge'
import { getAccentStyle, getTileIcon } from '../ui/icons'

interface PageZoneRendererProps {
  page: MobileDeckPage
  compact?: boolean
}

function resolveTileHaptic(tile: MobileTile | undefined, gesture: TileGestureKind): HapticKind {
  if (gesture === 'long') return 'heavy'
  if (gesture === 'double') return 'confirm'
  if (tile?.id === 'remote.esc') return 'heavy'
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

let embeddedBtnSeq = 1
function nextEmbeddedPressId(button: PointerButtonName): string {
  embeddedBtnSeq += 1
  return `ebtn-${button}-${embeddedBtnSeq}`
}

interface EmbeddedPointerPadProps {
  pageId: string
  zone: MobileDeckZone
  editMode: boolean
  isSelectedZone: boolean
  isLight: boolean
}

function EmbeddedPointerPad({
  pageId,
  zone,
  editMode,
  isSelectedZone,
  isLight,
}: EmbeddedPointerPadProps) {
  const getClient = useMobileStore((s) => s.getClient)
  const phase = useMobileStore((s) => s.phase)
  const isDemoMode = useMobileStore((s) => s.isDemoMode)
  const gyroSensitivity = useMobileStore((s) => s.localFeel.gyroSensitivity)
  const threeFingerSystemGestures = useMobileStore(
    (s) => s.localFeel.threeFingerSystemGestures,
  )
  const updateZone = useMobileStore((s) => s.updateZone)
  const setSelectedEditItem = useMobileStore((s) => s.setSelectedEditItem)
  const setEmbeddedAirMouseZoneActive = useMobileStore((s) => s.setEmbeddedAirMouseZoneActive)

  const mode: EmbeddedPointerMode = zone.pointerMode === 'relative' ? 'relative' : 'trackpad'
  const padHeight: EmbeddedPadHeight = zone.padHeight ?? 'standard'
  const showButtons = zone.showButtons !== false

  const [dragLocked, setDragLocked] = useState(false)
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
      onSystemGesture: (gesture) => {
        if (!useMobileStore.getState().localFeel.threeFingerSystemGestures) return
        triggerHaptic('confirm')
        getClient().sendTouchpadGesture(gesture)
      },
    })
  }

  useEffect(() => {
    controllerRef.current?.setThreeFingerGesturesEnabled(threeFingerSystemGestures)
  }, [threeFingerSystemGestures])

  useEffect(() => {
    const active = !editMode && mode === 'relative'
    setEmbeddedAirMouseZoneActive(zone.id, active)
    return () => {
      setEmbeddedAirMouseZoneActive(zone.id, false)
    }
  }, [zone.id, editMode, mode, setEmbeddedAirMouseZoneActive])

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
      notifyNativePointerClickPulse()
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

  const padHeightCls =
    padHeight === 'compact'
      ? 'min-h-[112px]'
      : padHeight === 'tall'
        ? 'min-h-[212px]'
        : 'min-h-[148px]'

  if (editMode) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          triggerHaptic('tap')
          setSelectedEditItem({ kind: 'zone', pageId, zoneId: zone.id })
        }}
        className={clsx(
          'chassis-well w-full min-h-[136px] rounded-[26px] border p-4 flex flex-col items-center justify-center gap-2 text-center transition-all',
          isSelectedZone &&
            (isLight ? 'ring-2 ring-[#1c1c1e]' : 'ring-2 ring-[#f2f2f7]'),
        )}
      >
        {mode === 'trackpad' ? (
          <MousePointer2 className="w-5 h-5 ak-text-2" />
        ) : (
          <Compass className="w-5 h-5 ak-text-2" />
        )}
        <span className="ak-text-1 text-xs font-medium">
          {mode === 'trackpad' ? '触控板' : '飞鼠'}
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 select-none">
      {mode === 'trackpad' ? (
        <div
          data-testid="embedded-trackpad-surface"
          className={clsx(
            'trackpad-dots ak-border-subtle relative flex-1 rounded-[26px] border touch-none select-none overflow-hidden flex items-center justify-center',
            padHeightCls,
          )}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            controllerRef.current?.onPointerDown(e.pointerId, e.clientX, e.clientY)
          }}
          onPointerMove={(e) => {
            controllerRef.current?.onPointerMove(e.pointerId, e.clientX, e.clientY)
          }}
          onPointerUp={(e) => {
            controllerRef.current?.onPointerUp(e.pointerId)
          }}
          onPointerCancel={(e) => {
            controllerRef.current?.onPointerCancel(e.pointerId)
          }}
        >
          {/* Top-left quick mode toggle */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="ak-seg absolute top-2.5 left-2.5 inline-flex items-center p-0.5 rounded-full border"
          >
            <button
              type="button"
              onClick={() => handleModeSwitch('trackpad')}
              className="ak-elevated-alt px-2.5 py-0.5 rounded-full text-[10.5px] font-medium border"
            >
              触控板
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('relative')}
              className="px-2.5 py-0.5 rounded-full text-[10.5px] font-medium ak-text-2"
            >
              飞鼠
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
                'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium border transition-colors',
                recenteredFlash ? 'ak-primary-solid' : 'ak-elevated ak-text-2',
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
              aria-label="拖拽锁"
              className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border transition-colors',
                dragLocked ? 'ak-primary-solid' : 'ak-elevated ak-text-2',
              )}
            >
              {dragLocked ? <Lock className="w-2.5 h-2.5" /> : <LockOpen className="w-2.5 h-2.5" />}
            </button>
          </div>

          {/* Subtle 16px center crosshair reticle — zero tutorial text */}
          <div className="w-4 h-4 relative opacity-20 pointer-events-none">
            <span className="absolute inset-x-0 top-1/2 h-px bg-current" />
            <span className="absolute inset-y-0 left-1/2 w-px bg-current" />
          </div>
        </div>
      ) : (
        <div className={clsx('relative flex-1 flex flex-col', padHeightCls)}>
          <div className="ak-seg absolute top-2.5 left-2.5 z-10 inline-flex items-center p-0.5 rounded-full border">
            <button
              type="button"
              onClick={() => handleModeSwitch('trackpad')}
              className="px-2.5 py-0.5 rounded-full text-[10.5px] font-medium ak-text-2"
            >
              触控板
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('relative')}
              className="ak-elevated-alt px-2.5 py-0.5 rounded-full text-[10.5px] font-medium border"
            >
              飞鼠
            </button>
          </div>

          <button
            type="button"
            onClick={handleRecenter}
            aria-label="归中"
            className={clsx(
              'absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium border transition-colors',
              recenteredFlash ? 'ak-primary-solid' : 'ak-elevated ak-text-2',
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
              'flex-1 rounded-[26px] border flex flex-col items-center justify-center gap-2 px-4 pt-4 text-center touch-none transition-all',
              clutchHeld ? 'ak-clutch-engaged scale-[0.99]' : 'chassis-well',
            )}
          >
            <span
              className={clsx(
                'w-2 h-2 rounded-full',
                clutchHeld ? 'ak-live-dot' : isLight ? 'bg-black/25' : 'bg-white/25',
              )}
            />
            <span className="ak-text-2 text-xs font-medium">按住移鼠</span>
          </button>
        </div>
      )}

      {showButtons && (
        <div className="grid grid-cols-12 gap-2 h-[44px] shrink-0">
          <button
            type="button"
            className={clsx(
              'tile-surface ak-elevated col-span-5 rounded-[18px] border text-xs font-medium touch-none',
              pressedButtons.left && 'tile-pressed ak-elevated-alt',
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
              'tile-surface ak-well col-span-2 rounded-[18px] border flex items-center justify-center touch-none',
              pressedButtons.scroll && 'tile-pressed ak-elevated',
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
            <span className="w-1 h-4 rounded-full bg-current opacity-25" />
          </div>

          <button
            type="button"
            className={clsx(
              'tile-surface ak-elevated col-span-5 rounded-[18px] border text-xs font-medium touch-none',
              pressedButtons.right && 'tile-pressed ak-elevated-alt',
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
      )}
    </div>
  )
}

const RING_SWIPE_INIT_PX = 26
const RING_SWIPE_STEP_PX = 38

interface CircularClickpadZoneProps {
  pageId: string
  zone: MobileDeckZone
  byId: Map<string, MobileTile>
  editMode: boolean
  compact: boolean
  isLight: boolean
  selectedEditItem: SelectedEditItem
  controllerRef: MutableRefObject<TileGestureController | null>
  fbRing: (id: string) => string
}

function CircularClickpadZone({
  pageId,
  zone,
  byId,
  editMode,
  compact,
  isLight,
  selectedEditItem,
  controllerRef,
  fbRing,
}: CircularClickpadZoneProps) {
  const getClient = useMobileStore((s) => s.getClient)
  const setSelectedEditItem = useMobileStore((s) => s.setSelectedEditItem)
  const addTileToPage = useMobileStore((s) => s.addTileToPage)

  const slots = useMemo(() => normalizeDpadSlotIds(zone.tileIds), [zone.tileIds])
  const upTile = slots[1] ? byId.get(slots[1]) : undefined
  const leftTile = slots[3] ? byId.get(slots[3]) : undefined
  const okTile = slots[4] ? byId.get(slots[4]) : undefined
  const rightTile = slots[5] ? byId.get(slots[5]) : undefined
  const downTile = slots[7] ? byId.get(slots[7]) : undefined

  const [pressedRingSlot, setPressedRingSlot] = useState<number | null>(null)
  const [flashRingSlot, setFlashRingSlot] = useState<number | null>(null)
  const [centerPressed, setCenterPressed] = useState(false)

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ringGestureRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    lastX: number
    lastY: number
    accumX: number
    accumY: number
    swiped: boolean
    pressedTileId: string | null
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    accumX: 0,
    accumY: 0,
    swiped: false,
    pressedTileId: null,
  })

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  const fireDirectionalStep = (dirSlot: 1 | 3 | 5 | 7) => {
    const dirTileId = slots[dirSlot]
    setFlashRingSlot(dirSlot)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => {
      setFlashRingSlot(null)
      flashTimerRef.current = null
    }, 200)

    triggerHaptic('tap')
    if (dirTileId) {
      const reqId = getClient().sendTileActivate(dirTileId, 'tap')
      registerPendingTileRequest(reqId, dirTileId)
    }
  }

  const handleEditSlotSelect = (slotIdx: number, e: React.MouseEvent) => {
    e.stopPropagation()
    triggerHaptic('tap')
    const existingId = slots[slotIdx]
    const existingTile = existingId ? byId.get(existingId) : undefined
    if (existingTile) {
      setSelectedEditItem({
        kind: 'tile',
        pageId,
        zoneId: zone.id,
        tileId: existingTile.id,
      })
    } else {
      addTileToPage(pageId, zone.id, slotIdx)
    }
  }

  const handleRingPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editMode) return
    e.currentTarget.setPointerCapture?.(e.pointerId)

    const targetEl = (e.target as HTMLElement | null)?.closest(
      '[data-clickpad-slot]',
    ) as HTMLElement | null
    const rawSlot = targetEl?.dataset.clickpadSlot
    const slotNum = rawSlot ? Number.parseInt(rawSlot, 10) : NaN
    const isCardinalSlot =
      slotNum === 1 || slotNum === 3 || slotNum === 5 || slotNum === 7
    const hitTile = isCardinalSlot && slots[slotNum] ? byId.get(slots[slotNum]) : undefined

    if (hitTile && isCardinalSlot) {
      setPressedRingSlot(slotNum)
      controllerRef.current?.onDown(hitTile)
    }

    ringGestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      accumX: 0,
      accumY: 0,
      swiped: false,
      pressedTileId: hitTile?.id ?? null,
    }
  }

  const handleRingPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editMode) return
    const g = ringGestureRef.current
    if (g.pointerId !== e.pointerId) return

    if (!g.swiped) {
      const totalDx = e.clientX - g.startX
      const totalDy = e.clientY - g.startY
      if (
        Math.abs(totalDx) <= RING_SWIPE_INIT_PX &&
        Math.abs(totalDy) <= RING_SWIPE_INIT_PX
      ) {
        g.lastX = e.clientX
        g.lastY = e.clientY
        return
      }

      if (g.pressedTileId) {
        controllerRef.current?.onCancel(g.pressedTileId)
        g.pressedTileId = null
        setPressedRingSlot(null)
      }

      g.swiped = true
      const horiz = Math.abs(totalDx) >= Math.abs(totalDy)
      const firstDir: 1 | 3 | 5 | 7 = horiz
        ? totalDx > 0
          ? 5
          : 3
        : totalDy > 0
          ? 7
          : 1
      fireDirectionalStep(firstDir)

      g.accumX = horiz
        ? (Math.abs(totalDx) - RING_SWIPE_INIT_PX) * Math.sign(totalDx)
        : 0
      g.accumY = !horiz
        ? (Math.abs(totalDy) - RING_SWIPE_INIT_PX) * Math.sign(totalDy)
        : 0
      g.lastX = e.clientX
      g.lastY = e.clientY
    } else {
      g.accumX += e.clientX - g.lastX
      g.accumY += e.clientY - g.lastY
      g.lastX = e.clientX
      g.lastY = e.clientY
    }

    while (Math.abs(g.accumX) >= RING_SWIPE_STEP_PX) {
      fireDirectionalStep(g.accumX > 0 ? 5 : 3)
      g.accumX -= Math.sign(g.accumX) * RING_SWIPE_STEP_PX
    }
    while (Math.abs(g.accumY) >= RING_SWIPE_STEP_PX) {
      fireDirectionalStep(g.accumY > 0 ? 7 : 1)
      g.accumY -= Math.sign(g.accumY) * RING_SWIPE_STEP_PX
    }
  }

  const finishRingPointer = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (editMode) return
    const g = ringGestureRef.current
    if (g.pointerId !== e.pointerId) return
    g.pointerId = null
    setPressedRingSlot(null)

    if (!g.swiped && g.pressedTileId) {
      if (cancelled) controllerRef.current?.onCancel(g.pressedTileId)
      else controllerRef.current?.onUp(g.pressedTileId)
    }
    g.pressedTileId = null
    g.swiped = false
  }

  const isZoneSelected =
    editMode &&
    selectedEditItem?.kind === 'zone' &&
    selectedEditItem.zoneId === zone.id

  const isSlotSelected = (tile: MobileTile | undefined) =>
    Boolean(
      editMode &&
        tile &&
        selectedEditItem?.kind === 'tile' &&
        selectedEditItem.tileId === tile.id,
    )

  const cardinalCls = (slotIdx: 1 | 3 | 5 | 7, tile: MobileTile | undefined) => {
    const active = pressedRingSlot === slotIdx || flashRingSlot === slotIdx
    const selected = isSlotSelected(tile)
    return clsx(
      'key-press absolute rounded-full flex items-center justify-center transition-all touch-none select-none',
      active ? 'ak-text-1 scale-95 bg-white/[0.08]' : 'ak-text-2',
      selected &&
        (isLight
          ? 'ring-2 ring-[#1c1c1e] bg-black/[0.06] ak-text-1'
          : 'ring-2 ring-[#f2f2f7] bg-white/[0.09] ak-text-1'),
      tile && fbRing(tile.id),
    )
  }

  return (
    <div className="my-auto py-1 flex items-center justify-center">
      <div
        role="group"
        aria-label="触控圆盘"
        data-testid="circular-clickpad-ring"
        onPointerDown={handleRingPointerDown}
        onPointerMove={handleRingPointerMove}
        onPointerUp={(e) => finishRingPointer(e, false)}
        onPointerCancel={(e) => finishRingPointer(e, true)}
        onClick={(e) => {
          if (!editMode) return
          e.stopPropagation()
          triggerHaptic('tap')
          setSelectedEditItem({ kind: 'zone', pageId, zoneId: zone.id })
        }}
        className={clsx(
          'clickpad-ring relative rounded-full border flex items-center justify-center touch-none select-none transition-all',
          compact ? 'w-[196px] h-[196px]' : 'w-[220px] h-[220px]',
          isZoneSelected &&
            (isLight ? 'ring-2 ring-[#1c1c1e]' : 'ring-2 ring-[#f2f2f7]'),
        )}
      >
        {/* Up */}
        <button
          type="button"
          aria-label={upTile?.label ?? CLICKPAD_RING_SLOT_SPECS[0].label}
          data-clickpad-slot={1}
          onClick={editMode ? (e) => handleEditSlotSelect(1, e) : undefined}
          className={clsx(cardinalCls(1, upTile), 'top-2 w-16 h-12')}
        >
          <ChevronUp className="w-5 h-5" strokeWidth={2.1} />
        </button>

        {/* Down */}
        <button
          type="button"
          aria-label={downTile?.label ?? CLICKPAD_RING_SLOT_SPECS[4].label}
          data-clickpad-slot={7}
          onClick={editMode ? (e) => handleEditSlotSelect(7, e) : undefined}
          className={clsx(cardinalCls(7, downTile), 'bottom-2 w-16 h-12')}
        >
          <ChevronDown className="w-5 h-5" strokeWidth={2.1} />
        </button>

        {/* Left */}
        <button
          type="button"
          aria-label={leftTile?.label ?? CLICKPAD_RING_SLOT_SPECS[1].label}
          data-clickpad-slot={3}
          onClick={editMode ? (e) => handleEditSlotSelect(3, e) : undefined}
          className={clsx(cardinalCls(3, leftTile), 'left-2 w-12 h-16')}
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={2.1} />
        </button>

        {/* Right */}
        <button
          type="button"
          aria-label={rightTile?.label ?? CLICKPAD_RING_SLOT_SPECS[3].label}
          data-clickpad-slot={5}
          onClick={editMode ? (e) => handleEditSlotSelect(5, e) : undefined}
          className={clsx(cardinalCls(5, rightTile), 'right-2 w-12 h-16')}
        >
          <ChevronRight className="w-5 h-5" strokeWidth={2.1} />
        </button>

        {/* Center 86px Concave Confirm Button */}
        <button
          type="button"
          aria-label={okTile?.label ?? '确定'}
          data-clickpad-slot={4}
          onPointerDown={(e) => {
            e.stopPropagation()
            if (editMode || !okTile) return
            e.currentTarget.setPointerCapture?.(e.pointerId)
            setCenterPressed(true)
            controllerRef.current?.onDown(okTile)
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            if (editMode || !okTile) return
            setCenterPressed(false)
            controllerRef.current?.onUp(okTile.id)
          }}
          onPointerCancel={(e) => {
            e.stopPropagation()
            if (editMode || !okTile) return
            setCenterPressed(false)
            controllerRef.current?.onCancel(okTile.id)
          }}
          onClick={editMode ? (e) => handleEditSlotSelect(4, e) : undefined}
          className={clsx(
            'clickpad-center rounded-full border flex items-center justify-center gap-1.5 px-2 text-xs font-semibold tracking-wider touch-none select-none',
            compact ? 'w-[78px] h-[78px]' : 'w-[86px] h-[86px]',
            centerPressed && !editMode && 'scale-[0.96]',
            isSlotSelected(okTile) &&
              (isLight ? 'ring-2 ring-[#1c1c1e]' : 'ring-2 ring-[#f2f2f7]'),
            okTile && fbRing(okTile.id),
          )}
        >
          {okTile && okTile.accent !== 'slate' && (
            <span
              className={clsx(
                'w-[5px] h-[5px] rounded-full shrink-0',
                getAccentStyle(okTile.accent, isLight).dot,
              )}
            />
          )}
          <span className="truncate">{okTile?.label ?? '确定'}</span>
        </button>
      </div>
    </div>
  )
}

const GESTURE_PAD_SWIPE_PX = 32
const GESTURE_PAD_TAP_MAX_PX = 12

interface GestureTriggerPadProps {
  pageId: string
  zone: MobileDeckZone
  byId: Map<string, MobileTile>
  editMode: boolean
  isLight: boolean
  selectedEditItem: SelectedEditItem
  doubleClickWindowMs: number
}

function GestureTriggerPad({
  pageId,
  zone,
  byId,
  editMode,
  isLight,
  selectedEditItem,
  doubleClickWindowMs,
}: GestureTriggerPadProps) {
  const getClient = useMobileStore((s) => s.getClient)
  const setSelectedEditItem = useMobileStore((s) => s.setSelectedEditItem)
  const addTileToPage = useMobileStore((s) => s.addTileToPage)
  const tileFeedback = useMobileStore((s) => s.tileFeedback)

  const slots = useMemo(() => normalizeGesturePadSlotIds(zone.tileIds), [zone.tileIds])
  const padHeight: EmbeddedPadHeight = zone.padHeight ?? 'standard'
  const [flashSlot, setFlashSlot] = useState<number | null>(null)

  const gestureRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    maxDist: number
    swiped: boolean
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    maxDist: 0,
    swiped: false,
  })
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const waitingDoubleRef = useRef(false)

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  const triggerSlot = (slotIdx: number) => {
    const tileId = slots[slotIdx]
    const tile = tileId ? byId.get(tileId) : undefined
    setFlashSlot(slotIdx)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => {
      setFlashSlot(null)
      flashTimerRef.current = null
    }, 300)

    if (!tile) {
      triggerHaptic('tap')
      return
    }
    triggerHaptic(slotIdx === 5 ? 'confirm' : resolveTileHaptic(tile, 'tap'))
    const reqId = getClient().sendTileActivate(tile.id, 'tap')
    registerPendingTileRequest(reqId, tile.id)
  }

  const isZoneSelected =
    editMode &&
    selectedEditItem?.kind === 'zone' &&
    selectedEditItem.zoneId === zone.id

  if (editMode) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation()
          triggerHaptic('tap')
          setSelectedEditItem({ kind: 'zone', pageId, zoneId: zone.id })
        }}
        className={clsx(
          'chassis-well p-2.5 rounded-[24px] border transition-all',
          isZoneSelected &&
            (isLight ? 'ring-2 ring-[#1c1c1e]' : 'ring-2 ring-[#f2f2f7]'),
        )}
      >
        <div className="grid grid-cols-2 gap-2">
          {GESTURE_PAD_SLOT_SPECS.map((spec) => {
            const tileId = slots[spec.index]
            const tile = tileId ? byId.get(tileId) : undefined
            const st = getAccentStyle(tile?.accent ?? 'slate', isLight)
            const Icon = getTileIcon(tile?.icon ?? spec.icon)
            const slotSelected =
              Boolean(tile) &&
              selectedEditItem?.kind === 'tile' &&
              selectedEditItem.tileId === tile?.id
            return (
              <button
                key={spec.key}
                type="button"
                data-gesture-slot-index={spec.index}
                onClick={(e) => {
                  e.stopPropagation()
                  triggerHaptic('tap')
                  if (tile) {
                    setSelectedEditItem({
                      kind: 'tile',
                      pageId,
                      zoneId: zone.id,
                      tileId: tile.id,
                    })
                  } else {
                    addTileToPage(pageId, zone.id, spec.index)
                  }
                }}
                className={clsx(
                  'tile-surface h-11 px-3 rounded-[16px] border flex items-center justify-between gap-2 text-left',
                  st.card,
                  slotSelected &&
                    (isLight ? 'ring-2 ring-[#1c1c1e]' : 'ring-2 ring-[#f2f2f7]'),
                )}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Icon className={clsx('w-3.5 h-3.5 shrink-0', st.iconText)} />
                  <span className="ak-text-1 text-xs font-medium truncate">
                    {tile?.label ?? spec.label}
                  </span>
                </span>
                <span className="ak-text-3 text-[10px] font-mono shrink-0">{spec.badge}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const slotLabel = (idx: number) => {
    const id = slots[idx]
    const t = id ? byId.get(id) : undefined
    return t?.label ?? GESTURE_PAD_SLOT_SPECS[idx].label
  }

  const isSlotActive = (idx: number) => {
    if (flashSlot === idx) return true
    const id = slots[idx]
    if (!id) return false
    const fb = tileFeedback[id]
    return Boolean(fb && Date.now() - fb.at < 500 && fb.status === 'ok')
  }

  const heightCls =
    padHeight === 'compact'
      ? 'min-h-[148px]'
      : padHeight === 'tall'
        ? 'min-h-[240px]'
        : 'min-h-[184px]'

  const pillCls = (idx: number) =>
    clsx(
      'px-2.5 py-1 rounded-full border text-[11px] font-medium inline-flex items-center gap-1 transition-all max-w-[136px]',
      isSlotActive(idx) ? 'ak-primary-solid scale-105' : 'ak-elevated ak-text-2',
    )

  return (
    <div
      role="application"
      aria-label="手势垫"
      data-testid="gesture-pad-surface"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        gestureRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          maxDist: 0,
          swiped: false,
        }
      }}
      onPointerMove={(e) => {
        const g = gestureRef.current
        if (g.pointerId !== e.pointerId || g.swiped) return
        const dx = e.clientX - g.startX
        const dy = e.clientY - g.startY
        const dist = Math.hypot(dx, dy)
        g.maxDist = Math.max(g.maxDist, dist)
        if (dist > GESTURE_PAD_SWIPE_PX) {
          g.swiped = true
          if (tapTimerRef.current) {
            clearTimeout(tapTimerRef.current)
            tapTimerRef.current = null
          }
          waitingDoubleRef.current = false
          const slotIdx =
            Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 1 : 0
          triggerSlot(slotIdx)
        }
      }}
      onPointerUp={(e) => {
        const g = gestureRef.current
        if (g.pointerId !== e.pointerId) return
        g.pointerId = null
        if (g.swiped || g.maxDist > GESTURE_PAD_TAP_MAX_PX) return

        const hasDoubleTile = Boolean(slots[5] && byId.has(slots[5]))
        if (!hasDoubleTile) {
          triggerSlot(4)
          return
        }

        if (waitingDoubleRef.current) {
          if (tapTimerRef.current) {
            clearTimeout(tapTimerRef.current)
            tapTimerRef.current = null
          }
          waitingDoubleRef.current = false
          triggerSlot(5)
          return
        }

        waitingDoubleRef.current = true
        const windowMs = Math.min(240, Math.max(150, doubleClickWindowMs || 220))
        tapTimerRef.current = setTimeout(() => {
          tapTimerRef.current = null
          waitingDoubleRef.current = false
          triggerSlot(4)
        }, windowMs)
      }}
      onPointerCancel={() => {
        gestureRef.current.pointerId = null
        gestureRef.current.swiped = false
      }}
      className={clsx(
        'chassis-well relative rounded-[26px] border p-3 flex flex-col items-center justify-between touch-none select-none overflow-hidden',
        heightCls,
      )}
    >
      <div className={pillCls(0)}>
        <span className="font-mono opacity-65">↑</span>
        <span className="truncate">{slotLabel(0)}</span>
      </div>

      <div className="w-full flex items-center justify-between gap-2 my-auto">
        <div className={pillCls(2)}>
          <span className="font-mono opacity-65">←</span>
          <span className="truncate">{slotLabel(2)}</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <span className={pillCls(4)}>
            <span className="truncate">{slotLabel(4)}</span>
          </span>
          <span className={pillCls(5)}>
            <span className="font-mono text-[10px] opacity-65">2×</span>
            <span className="truncate">{slotLabel(5)}</span>
          </span>
        </div>

        <div className={pillCls(3)}>
          <span className="truncate">{slotLabel(3)}</span>
          <span className="font-mono opacity-65">→</span>
        </div>
      </div>

      <div className={pillCls(1)}>
        <span className="font-mono opacity-65">↓</span>
        <span className="truncate">{slotLabel(1)}</span>
      </div>
    </div>
  )
}

interface DragSession {
  pointerId: number
  tileId: string
  zoneId: string
  startX: number
  startY: number
  started: boolean
  currentZones: MobileDeckZone[]
  lastOverKey: string
}

export function PageZoneRenderer({ page, compact = false }: PageZoneRendererProps) {
  const tileFeedback = useMobileStore((s) => s.tileFeedback)
  const deck = useMobileStore((s) => s.deck)
  const editMode = useMobileStore((s) => s.layoutEditing)
  const selectedEditItem = useMobileStore((s) => s.selectedEditItem)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const getClient = useMobileStore((s) => s.getClient)

  const setSelectedEditItem = useMobileStore((s) => s.setSelectedEditItem)
  const addTileToPage = useMobileStore((s) => s.addTileToPage)
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
    return fb.status === 'ok'
      ? isLight
        ? 'ring-1 ring-[#28cd41]'
        : 'ring-1 ring-[#30d158]/85'
      : 'ring-2 ring-rose-500/85'
  }

  const handleTilePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    tile: MobileTile,
    zone: MobileDeckZone,
  ) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (!editMode) {
      setPressedIds((prev) => ({ ...prev, [tile.id]: true }))
      controllerRef.current?.onDown(tile)
      return
    }
    if (zone.kind !== 'bento-grid') return
    dragSessionRef.current = {
      pointerId: e.pointerId,
      tileId: tile.id,
      zoneId: zone.id,
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
        setSelectedEditItem({
          kind: 'tile',
          pageId: page.id,
          zoneId: session.zoneId,
          tileId: session.tileId,
        })
      }
    } else if (!cancelled) {
      lastPointerTapAtRef.current = Date.now()
      triggerHaptic('tap')
      setSelectedEditItem({
        kind: 'tile',
        pageId: page.id,
        zoneId: session.zoneId,
        tileId: session.tileId,
      })
    }
  }

  const handleTileFallbackClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    zoneId: string,
    tileId: string,
  ) => {
    if (!editMode) return
    e.stopPropagation()
    if (Date.now() - lastPointerTapAtRef.current < 260) return
    triggerHaptic('tap')
    setSelectedEditItem({
      kind: 'tile',
      pageId: page.id,
      zoneId,
      tileId,
    })
  }

  const hasClickpadRing = effectiveZones.some((z) => z.kind === 'dpad-3x3')

  return (
    <div
      onClick={(e) => {
        if (!editMode) return
        if (e.target === e.currentTarget) {
          setSelectedEditItem(null)
        }
      }}
      className={clsx(
        'w-full flex flex-col gap-2.5 select-none pb-2',
        hasClickpadRing && 'min-h-full justify-between',
      )}
    >
      {effectiveZones.map((zone, zoneIdx) => {
        const isZoneSelected =
          editMode &&
          selectedEditItem?.kind === 'zone' &&
          selectedEditItem.zoneId === zone.id

        return (
          <section
            key={zone.id}
            onClick={(e) => {
              if (!editMode) return
              if (e.target === e.currentTarget) {
                e.stopPropagation()
                triggerHaptic('tap')
                setSelectedEditItem({ kind: 'zone', pageId: page.id, zoneId: zone.id })
              }
            }}
            className={clsx(
              'flex flex-col',
              zone.kind === 'dpad-3x3' && 'my-auto',
              editMode &&
                zone.kind === 'bento-grid' &&
                isZoneSelected &&
                clsx(
                  'p-1.5 rounded-[22px]',
                  isLight ? 'ring-2 ring-[#1c1c1e]' : 'ring-2 ring-[#f2f2f7]',
                ),
            )}
          >
            {/* 1. Bento Grid */}
            {zone.kind === 'bento-grid' &&
              (() => {
                const cols = clampColumns(zone.columns, page.columns)
                const zoneTiles = zone.tileIds
                  .map((id) => byId.get(id))
                  .filter((t): t is MobileTile => Boolean(t))
                const packed = packBentoTiles(zoneTiles, cols)

                const isTopUtilityStrip =
                  hasClickpadRing && zoneIdx === 0 && packed.totalRows === 1 && cols === 3
                const isFourColStrip = cols === 4 && packed.totalRows === 1

                const rowMinPx = isTopUtilityStrip
                  ? 50
                  : isFourColStrip
                    ? 56
                    : hasClickpadRing
                      ? 62
                      : 78

                return (
                  <div
                    onClick={(e) => {
                      if (!editMode) return
                      if (e.target === e.currentTarget) {
                        e.stopPropagation()
                        triggerHaptic('tap')
                        setSelectedEditItem({
                          kind: 'zone',
                          pageId: page.id,
                          zoneId: zone.id,
                        })
                      }
                    }}
                    className="grid gap-2.5 w-full"
                    style={{
                      gridTemplateColumns: `repeat(${packed.columns}, minmax(0, 1fr))`,
                      gridAutoRows: `minmax(${rowMinPx}px, auto)`,
                      gridAutoFlow: 'row dense',
                    }}
                  >
                    {packed.items.map(({ tile, col, row, colSpan, rowSpan }) => {
                      const Icon = getTileIcon(tile.icon)
                      const style = getAccentStyle(tile.accent, isLight)
                      const pressed = Boolean(pressedIds[tile.id])
                      const isDragged = draggedTileId === tile.id
                      const isSelected =
                        editMode &&
                        selectedEditItem?.kind === 'tile' &&
                        selectedEditItem.tileId === tile.id
                      const isCompactUtility = isTopUtilityStrip || isFourColStrip
                      const isTall = colSpan === 1 && rowSpan === 2

                      return (
                        <button
                          key={tile.id}
                          type="button"
                          aria-label={tile.label}
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
                          onClick={(e) => handleTileFallbackClick(e, zone.id, tile.id)}
                          className={clsx(
                            'tile-surface relative rounded-[18px] border select-none touch-none overflow-hidden',
                            style.card,
                            isCompactUtility
                              ? isFourColStrip
                                ? 'px-2 py-2 flex flex-col items-center justify-center gap-1 text-center'
                                : 'px-3 py-2 flex items-center justify-center gap-2 text-center'
                              : isTall
                                ? 'p-3.5 flex flex-col items-center justify-center gap-2.5 text-center min-h-[164px]'
                                : 'p-3 flex flex-col justify-between text-left',
                            pressed && !editMode && clsx('tile-pressed', style.pressedGlow),
                            isSelected &&
                              (isLight
                                ? 'ring-2 ring-[#1c1c1e] z-10'
                                : 'ring-2 ring-[#f2f2f7] z-10'),
                            isDragged &&
                              'z-30 scale-[1.03] opacity-95 shadow-xl',
                            fbRing(tile.id),
                          )}
                        >
                          {isCompactUtility ? (
                            isFourColStrip ? (
                              <>
                                <Icon className={clsx('w-4 h-4 shrink-0', style.iconText)} strokeWidth={1.9} />
                                <span className="ak-text-2 text-[11px] font-medium truncate max-w-full">
                                  {tile.label}
                                </span>
                              </>
                            ) : (
                              <>
                                <Icon className={clsx('w-4 h-4 shrink-0', style.iconText)} strokeWidth={1.9} />
                                <span className="ak-text-1 text-xs font-medium truncate">
                                  {tile.label}
                                </span>
                              </>
                            )
                          ) : isTall ? (
                            <>
                              {style.dot && (
                                <span
                                  className={clsx(
                                    'absolute top-3 right-3 w-[5px] h-[5px] rounded-full',
                                    style.dot,
                                  )}
                                />
                              )}
                              <Icon className={clsx('w-5 h-5 shrink-0', style.iconText)} strokeWidth={1.9} />
                              <span className="ak-text-1 text-xs font-medium leading-snug line-clamp-2">
                                {tile.label}
                              </span>
                            </>
                          ) : (
                            <>
                              <div className="w-full flex items-center justify-between gap-1.5">
                                <Icon
                                  className={clsx('w-4 h-4 shrink-0', style.iconText)}
                                  strokeWidth={1.9}
                                />
                                {style.dot && (
                                  <span
                                    className={clsx(
                                      'w-[5px] h-[5px] rounded-full shrink-0',
                                      style.dot,
                                    )}
                                  />
                                )}
                              </div>
                              <div className="ak-text-1 text-[13px] font-medium tracking-tight truncate w-full">
                                {tile.label}
                              </div>
                            </>
                          )}
                        </button>
                      )
                    })}

                    {/* Single calm dashed [ + ] slot at the end of each bento-grid in Edit Mode */}
                    {editMode && (
                      <button
                        type="button"
                        aria-label="添加按键"
                        data-testid={`add-bento-tile-${zone.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          triggerHaptic('tap')
                          addTileToPage(page.id, zone.id)
                        }}
                        className={clsx(
                          'rounded-[18px] border border-dashed flex items-center justify-center transition-colors ak-text-2',
                          isLight
                            ? 'border-black/15 hover:border-black/30'
                            : 'border-white/15 hover:border-white/30',
                        )}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })()}

            {/* 2. Circular Tactile Clickpad Ring (`触控圆盘`) */}
            {zone.kind === 'dpad-3x3' && (
              <CircularClickpadZone
                pageId={page.id}
                zone={zone}
                byId={byId}
                editMode={editMode}
                compact={compact}
                isLight={isLight}
                selectedEditItem={selectedEditItem}
                controllerRef={controllerRef}
                fbRing={fbRing}
              />
            )}

            {/* 3. Embedded Interactive Pointer / Clutch Pad */}
            {zone.kind === 'pointer-pad' && (
              <EmbeddedPointerPad
                pageId={page.id}
                zone={zone}
                editMode={editMode}
                isSelectedZone={isZoneSelected}
                isLight={isLight}
              />
            )}

            {/* 4. Blind-Swipe Gesture Trigger Pad */}
            {zone.kind === 'gesture-pad' && (
              <GestureTriggerPad
                pageId={page.id}
                zone={zone}
                byId={byId}
                editMode={editMode}
                isLight={isLight}
                selectedEditItem={selectedEditItem}
                doubleClickWindowMs={deck.doubleClickWindowMs}
              />
            )}
          </section>
        )
      })}
    </div>
  )
}
