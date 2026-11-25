import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Crosshair,
  Info,
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

function resolveTileSilkscreen(tile: MobileTile): string | null {
  const raw = (tile.actionSummary || tile.subtitle || '').trim()
  if (!raw) return null
  if (raw.toLowerCase() === tile.label.trim().toLowerCase()) return null
  return raw
}

function fallbackGridWidthPx(): number {
  if (typeof window !== 'undefined' && window.innerWidth > 0) {
    return Math.max(240, window.innerWidth - 28)
  }
  return 362
}

/**
 * Determines whether a Bento keycap has enough physical pixel room to display its
 * laser-etched silkscreen cleanly — independent of logical `1x1` vs `2x2` span labels,
 * so a spacious `1x1` in a 2-column grid (~176px wide) and a `2x1` in a 4-column grid
 * (~176px wide) behave identically, while narrow `1x1` cells in 3/4-column portrait grids stay pure.
 */
function canFitKeycapSilkscreen(
  tileWidthPx: number,
  tileHeightPx: number,
  isTallSingleCol: boolean,
  isCompactUtility: boolean,
): boolean {
  if (isCompactUtility) return false
  if (isTallSingleCol) {
    return tileWidthPx >= 102 && tileHeightPx >= 148
  }
  return tileWidthPx >= 144 && tileHeightPx >= 68
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
  const gyroSensitivity = useMobileStore((s) => s.localFeel.gyroSensitivity)
  const threeFingerSystemGestures = useMobileStore(
    (s) => s.localFeel.threeFingerSystemGestures,
  )
  const updateZone = useMobileStore((s) => s.updateZone)
  const setSelectedEditItem = useMobileStore((s) => s.setSelectedEditItem)
  const setEmbeddedAirMouseZoneActive = useMobileStore((s) => s.setEmbeddedAirMouseZoneActive)
  const setPointerHelpOpen = useMobileStore((s) => s.setPointerHelpOpen)
  const showHudToast = useMobileStore((s) => s.showHudToast)

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
    const canStream = phase === 'active' && !editMode
    if (!canStream || mode === 'trackpad') {
      setNativeGyroClutch(false)
      setNativeGyroConfig('off', gyroSensitivity)
      setClutchHeld(false)
      return
    }
    setNativeGyroConfig('relative', gyroSensitivity)
    setNativeGyroClutch(false)
    setClutchHeld(false)
  }, [phase, editMode, mode, gyroSensitivity])

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
    showHudToast('光标已归中至主屏中央')
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
                showHudToast(next ? '左键拖拽已锁定 · 滑动即可移窗' : '左键拖拽已解除')
              }}
              aria-label="拖拽锁"
              className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border transition-colors',
                dragLocked ? 'ak-primary-solid' : 'ak-elevated ak-text-2',
              )}
            >
              {dragLocked ? <Lock className="w-2.5 h-2.5" /> : <LockOpen className="w-2.5 h-2.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                setPointerHelpOpen(true)
              }}
              aria-label="操控手势说明"
              className="ak-elevated ak-text-2 inline-flex items-center justify-center w-6 h-5 rounded-full border"
            >
              <Info className="w-2.5 h-2.5" />
            </button>
          </div>

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

          <div className="absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1">
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
                triggerHaptic('tap')
                setPointerHelpOpen(true)
              }}
              aria-label="操控手势说明"
              className="ak-elevated ak-text-2 inline-flex items-center justify-center w-6 h-5 rounded-full border"
            >
              <Info className="w-2.5 h-2.5" />
            </button>
          </div>

          <button
            type="button"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId)
              setClutchHeld(true)
              triggerHaptic('tap')
              if (phase === 'active') {
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

/**
 * Exact 90-degree annular quarter-ring sector paths in a 264x264 coordinate system
 * (center 132,132; outer radius R=131; inner radius r=50; 45-deg diagonals).
 */
const CLICKPAD_SECTOR_PATHS: Record<
  1 | 3 | 5 | 7,
  { d: string; shiftX: number; shiftY: number; clip: string }
> = {
  1: {
    d: 'M 39.37 39.37 A 131 131 0 0 1 224.63 39.37 L 167.36 96.64 A 50 50 0 0 0 96.64 96.64 Z',
    shiftX: 0,
    shiftY: 1.4,
    clip: 'polygon(0% 0%, 100% 0%, 50% 50%)',
  },
  5: {
    d: 'M 224.63 39.37 A 131 131 0 0 1 224.63 224.63 L 167.36 167.36 A 50 50 0 0 0 167.36 96.64 Z',
    shiftX: -1.4,
    shiftY: 0,
    clip: 'polygon(100% 0%, 100% 100%, 50% 50%)',
  },
  7: {
    d: 'M 224.63 224.63 A 131 131 0 0 1 39.37 224.63 L 96.64 167.36 A 50 50 0 0 0 167.36 167.36 Z',
    shiftX: 0,
    shiftY: -1.4,
    clip: 'polygon(100% 100%, 0% 100%, 50% 50%)',
  },
  3: {
    d: 'M 39.37 224.63 A 131 131 0 0 1 39.37 39.37 L 96.64 96.64 A 50 50 0 0 0 96.64 167.36 Z',
    shiftX: 1.4,
    shiftY: 0,
    clip: 'polygon(0% 100%, 0% 0%, 50% 50%)',
  },
}

function resolveClickpadPolarSlot(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): 1 | 3 | 5 | 7 | null {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = clientX - cx
  const dy = clientY - cy
  const dist = Math.hypot(dx, dy)
  const outerR = rect.width / 2
  const innerR = outerR * 0.375
  if (dist <= innerR || dist > outerR * 1.05) return null
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  if (deg >= -135 && deg < -45) return 1
  if (deg >= -45 && deg < 45) return 5
  if (deg >= 45 && deg < 135) return 7
  return 3
}

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
    }, 180)

    triggerHaptic('detent')
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
    let slotNum = rawSlot ? Number.parseInt(rawSlot, 10) : NaN
    if (!(slotNum === 1 || slotNum === 3 || slotNum === 5 || slotNum === 7)) {
      const polar = resolveClickpadPolarSlot(e.currentTarget, e.clientX, e.clientY)
      if (polar !== null) slotNum = polar
    }

    const isCardinalSlot =
      slotNum === 1 || slotNum === 3 || slotNum === 5 || slotNum === 7
    const hitTile = isCardinalSlot && slots[slotNum] ? byId.get(slots[slotNum]) : undefined

    if (isCardinalSlot) {
      setPressedRingSlot(slotNum)
      if (hitTile) {
        controllerRef.current?.onDown(hitTile)
      } else {
        triggerHaptic('tap')
      }
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
      }
      setPressedRingSlot(null)

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

  const activeCardinalSlot = !editMode ? (pressedRingSlot ?? flashRingSlot) : null

  const ringTiltTransform =
    activeCardinalSlot === 1
      ? 'perspective(520px) rotateX(5.2deg)'
      : activeCardinalSlot === 7
        ? 'perspective(520px) rotateX(-5.2deg)'
        : activeCardinalSlot === 3
          ? 'perspective(520px) rotateY(-5.2deg)'
          : activeCardinalSlot === 5
            ? 'perspective(520px) rotateY(5.2deg)'
            : centerPressed && !editMode
              ? 'scale(0.99)'
              : undefined

  const sectorGradPrefix = `ring-sec-${zone.id}`

  return (
    <div className="my-auto py-2 flex items-center justify-center">
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
        style={ringTiltTransform ? { transform: ringTiltTransform } : undefined}
        className={clsx(
          'clickpad-ring relative rounded-full border flex items-center justify-center touch-none select-none overflow-hidden',
          compact
            ? 'w-[204px] h-[204px]'
            : 'w-[min(72vw,264px)] h-[min(72vw,264px)]',
          isZoneSelected &&
            (isLight ? 'ring-2 ring-[#1c1c1e]' : 'ring-2 ring-[#f2f2f7]'),
        )}
      >
        <svg
          viewBox="0 0 264 264"
          data-testid="clickpad-sector-svg"
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <defs>
            <radialGradient id={`${sectorGradPrefix}-press`} cx="50%" cy="50%" r="50%">
              <stop
                offset="36%"
                stopColor={isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'}
              />
              <stop
                offset="100%"
                stopColor={isLight ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.17)'}
              />
            </radialGradient>
          </defs>

          {([1, 5, 7, 3] as const).map((slotIdx) => {
            const tile = slots[slotIdx] ? byId.get(slots[slotIdx]) : undefined
            const active = activeCardinalSlot === slotIdx
            const selected = isSlotSelected(tile)
            const spec = CLICKPAD_SECTOR_PATHS[slotIdx]

            return (
              <path
                key={slotIdx}
                d={spec.d}
                data-sector-slot={slotIdx}
                data-sector-active={active ? 'true' : 'false'}
                fill={
                  active
                    ? `url(#${sectorGradPrefix}-press)`
                    : selected
                      ? isLight
                        ? 'rgba(0,0,0,0.08)'
                        : 'rgba(255,255,255,0.10)'
                      : 'transparent'
                }
                stroke={
                  active || selected
                    ? isLight
                      ? 'rgba(0,0,0,0.20)'
                      : 'rgba(255,255,255,0.24)'
                    : 'transparent'
                }
                strokeWidth={active || selected ? 1.25 : 0}
                style={{
                  transform: active
                    ? `translate(${spec.shiftX}px, ${spec.shiftY}px)`
                    : 'translate(0px, 0px)',
                  transition: 'transform 80ms ease-out, fill 90ms ease-out, stroke 90ms ease-out',
                }}
              />
            )
          })}

          <g
            stroke={isLight ? 'rgba(0,0,0,0.065)' : 'rgba(255,255,255,0.065)'}
            strokeWidth={1}
          >
            <line x1="96.64" y1="96.64" x2="39.37" y2="39.37" />
            <line x1="167.36" y1="96.64" x2="224.63" y2="39.37" />
            <line x1="167.36" y1="167.36" x2="224.63" y2="224.63" />
            <line x1="96.64" y1="167.36" x2="39.37" y2="224.63" />
          </g>
        </svg>

        <button
          type="button"
          aria-label={upTile?.label ?? CLICKPAD_RING_SLOT_SPECS[0].label}
          data-clickpad-slot={1}
          style={{ clipPath: CLICKPAD_SECTOR_PATHS[1].clip }}
          onClick={editMode ? (e) => handleEditSlotSelect(1, e) : undefined}
          className={clsx(
            'absolute inset-0 flex items-start justify-center pt-[13%] transition-colors touch-none select-none focus:outline-none',
            activeCardinalSlot === 1 || isSlotSelected(upTile) ? 'ak-text-1' : 'ak-text-2',
          )}
        >
          <ChevronUp
            className={clsx(
              'w-5 h-5 transition-transform duration-75',
              activeCardinalSlot === 1 && 'translate-y-[1.5px] scale-95',
            )}
            strokeWidth={2.2}
          />
        </button>

        <button
          type="button"
          aria-label={downTile?.label ?? CLICKPAD_RING_SLOT_SPECS[4].label}
          data-clickpad-slot={7}
          style={{ clipPath: CLICKPAD_SECTOR_PATHS[7].clip }}
          onClick={editMode ? (e) => handleEditSlotSelect(7, e) : undefined}
          className={clsx(
            'absolute inset-0 flex items-end justify-center pb-[13%] transition-colors touch-none select-none focus:outline-none',
            activeCardinalSlot === 7 || isSlotSelected(downTile) ? 'ak-text-1' : 'ak-text-2',
          )}
        >
          <ChevronDown
            className={clsx(
              'w-5 h-5 transition-transform duration-75',
              activeCardinalSlot === 7 && '-translate-y-[1.5px] scale-95',
            )}
            strokeWidth={2.2}
          />
        </button>

        <button
          type="button"
          aria-label={leftTile?.label ?? CLICKPAD_RING_SLOT_SPECS[1].label}
          data-clickpad-slot={3}
          style={{ clipPath: CLICKPAD_SECTOR_PATHS[3].clip }}
          onClick={editMode ? (e) => handleEditSlotSelect(3, e) : undefined}
          className={clsx(
            'absolute inset-0 flex items-center justify-start pl-[13%] transition-colors touch-none select-none focus:outline-none',
            activeCardinalSlot === 3 || isSlotSelected(leftTile) ? 'ak-text-1' : 'ak-text-2',
          )}
        >
          <ChevronLeft
            className={clsx(
              'w-5 h-5 transition-transform duration-75',
              activeCardinalSlot === 3 && 'translate-x-[1.5px] scale-95',
            )}
            strokeWidth={2.2}
          />
        </button>

        <button
          type="button"
          aria-label={rightTile?.label ?? CLICKPAD_RING_SLOT_SPECS[3].label}
          data-clickpad-slot={5}
          style={{ clipPath: CLICKPAD_SECTOR_PATHS[5].clip }}
          onClick={editMode ? (e) => handleEditSlotSelect(5, e) : undefined}
          className={clsx(
            'absolute inset-0 flex items-center justify-end pr-[13%] transition-colors touch-none select-none focus:outline-none',
            activeCardinalSlot === 5 || isSlotSelected(rightTile) ? 'ak-text-1' : 'ak-text-2',
          )}
        >
          <ChevronRight
            className={clsx(
              'w-5 h-5 transition-transform duration-75',
              activeCardinalSlot === 5 && '-translate-x-[1.5px] scale-95',
            )}
            strokeWidth={2.2}
          />
        </button>

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
            'clickpad-center relative z-10 w-[37.5%] h-[37.5%] rounded-full border flex items-center justify-center px-2 text-xs font-semibold tracking-wider touch-none select-none',
            centerPressed && !editMode && 'scale-[0.95]',
            isSlotSelected(okTile) &&
              (isLight ? 'ring-2 ring-[#1c1c1e]' : 'ring-2 ring-[#f2f2f7]'),
            okTile && fbRing(okTile.id),
          )}
        >
          <span className="truncate">{okTile?.label ?? '确定'}</span>
        </button>
      </div>
    </div>
  )
}

const RADIAL_AIM_LOCK_PX = 26
const RADIAL_CANCEL_RETURN_PX = 15
const GESTURE_PAD_TAP_MAX_PX = 12

/**
 * Architectural Squircle + Touch-Origin Floating Halo Specs ("静若方砚，触处生环").
 * - Eliminates the awkward "rigid circle stuffed inside a rectangle" clash.
 * - Couples a compact 96px floating compass halo right at the thumb's touch point with
 *   full-bleed rectangular bezel edge light-guides, directional ambient wash, and cardinal pills.
 * - Slot indices strictly match protocol: 0=Up, 1=Down, 2=Left, 3=Right.
 */
const SQUIRCLE_RADIAL_QUADRANTS: readonly {
  slotIdx: 0 | 1 | 2 | 3
  arrow: string
  haloArcIdle: string
  haloArcActive: string
  badgePosCls: string
  shiftCls: string
  edgeBarCls: string
  edgeBarActiveCls: string
  washStyleDark: string
  washStyleLight: string
}[] = [
  {
    slotIdx: 0,
    arrow: '↑',
    // -130deg to -50deg around (48,48) at r=36 / r=39
    haloArcIdle: 'M 24.86 20.42 A 36 36 0 0 1 71.14 20.42',
    haloArcActive: 'M 22.93 18.12 A 39 39 0 0 1 73.07 18.12',
    badgePosCls: 'top-3 left-1/2 -translate-x-1/2',
    shiftCls: 'translate-y-0.5 scale-105',
    edgeBarCls: 'top-0 left-1/2 -translate-x-1/2 h-[2.5px] rounded-b-full transition-all duration-150',
    edgeBarActiveCls: 'w-28 opacity-100',
    washStyleDark:
      'radial-gradient(85% 58% at 50% 0%, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0) 100%)',
    washStyleLight:
      'radial-gradient(85% 58% at 50% 0%, rgba(0,0,0,0.075) 0%, rgba(0,0,0,0) 100%)',
  },
  {
    slotIdx: 3,
    arrow: '→',
    // -40deg to +40deg around (48,48)
    haloArcIdle: 'M 75.58 24.86 A 36 36 0 0 1 75.58 71.14',
    haloArcActive: 'M 77.88 22.93 A 39 39 0 0 1 77.88 73.07',
    badgePosCls: 'right-3 top-1/2 -translate-y-1/2',
    shiftCls: '-translate-x-0.5 scale-105',
    edgeBarCls: 'right-0 top-1/2 -translate-y-1/2 w-[2.5px] rounded-l-full transition-all duration-150',
    edgeBarActiveCls: 'h-20 opacity-100',
    washStyleDark:
      'radial-gradient(58% 85% at 100% 50%, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0) 100%)',
    washStyleLight:
      'radial-gradient(58% 85% at 100% 50%, rgba(0,0,0,0.075) 0%, rgba(0,0,0,0) 100%)',
  },
  {
    slotIdx: 1,
    arrow: '↓',
    // +50deg to +130deg around (48,48)
    haloArcIdle: 'M 71.14 75.58 A 36 36 0 0 1 24.86 75.58',
    haloArcActive: 'M 73.07 77.88 A 39 39 0 0 1 22.93 77.88',
    badgePosCls: 'bottom-3 left-1/2 -translate-x-1/2',
    shiftCls: '-translate-y-0.5 scale-105',
    edgeBarCls: 'bottom-0 left-1/2 -translate-x-1/2 h-[2.5px] rounded-t-full transition-all duration-150',
    edgeBarActiveCls: 'w-28 opacity-100',
    washStyleDark:
      'radial-gradient(85% 58% at 50% 100%, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0) 100%)',
    washStyleLight:
      'radial-gradient(85% 58% at 50% 100%, rgba(0,0,0,0.075) 0%, rgba(0,0,0,0) 100%)',
  },
  {
    slotIdx: 2,
    arrow: '←',
    // +140deg to +220deg around (48,48)
    haloArcIdle: 'M 20.42 71.14 A 36 36 0 0 1 20.42 24.86',
    haloArcActive: 'M 18.12 73.07 A 39 39 0 0 1 18.12 22.93',
    badgePosCls: 'left-3 top-1/2 -translate-y-1/2',
    shiftCls: 'translate-x-0.5 scale-105',
    edgeBarCls: 'left-0 top-1/2 -translate-y-1/2 w-[2.5px] rounded-r-full transition-all duration-150',
    edgeBarActiveCls: 'h-20 opacity-100',
    washStyleDark:
      'radial-gradient(58% 85% at 0% 50%, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0) 100%)',
    washStyleLight:
      'radial-gradient(58% 85% at 0% 50%, rgba(0,0,0,0.075) 0%, rgba(0,0,0,0) 100%)',
  },
]

function resolveRadialSectorByDelta(dx: number, dy: number): 0 | 1 | 2 | 3 {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  if (deg >= -135 && deg < -45) return 0
  if (deg >= -45 && deg < 45) return 3
  if (deg >= 45 && deg < 135) return 1
  return 2
}

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
  const [trackingState, setTrackingState] = useState<{
    active: boolean
    originLeftPct: number
    originTopPct: number
    puckX: number
    puckY: number
    aimedSlot: 0 | 1 | 2 | 3 | null
    canceledInCenter: boolean
  }>({
    active: false,
    originLeftPct: 50,
    originTopPct: 50,
    puckX: 0,
    puckY: 0,
    aimedSlot: null,
    canceledInCenter: false,
  })

  const gestureRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    originLeftPct: number
    originTopPct: number
    maxDist: number
    everAimed: boolean
    aimedSlot: 0 | 1 | 2 | 3 | null
    canceledInCenter: boolean
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    originLeftPct: 50,
    originTopPct: 50,
    maxDist: 0,
    everAimed: false,
    aimedSlot: null,
    canceledInCenter: false,
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
    }, 320)

    if (!tile) {
      triggerHaptic('confirm')
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

  const isSlotFlashing = (idx: number) => {
    if (flashSlot === idx) return true
    const id = slots[idx]
    if (!id) return false
    const fb = tileFeedback[id]
    return Boolean(fb && Date.now() - fb.at < 480 && fb.status === 'ok')
  }

  const containerHeightCls =
    padHeight === 'compact'
      ? 'min-h-[158px]'
      : padHeight === 'tall'
        ? 'min-h-[242px]'
        : 'min-h-[196px]'

  const resetTracking = () => {
    setTrackingState({
      active: false,
      originLeftPct: 50,
      originTopPct: 50,
      puckX: 0,
      puckY: 0,
      aimedSlot: null,
      canceledInCenter: false,
    })
  }

  const hasDoubleTile = Boolean(slots[5] && byId.has(slots[5]))
  const activeBezelQuad = SQUIRCLE_RADIAL_QUADRANTS.find(
    (q) => trackingState.aimedSlot === q.slotIdx || isSlotFlashing(q.slotIdx),
  )

  return (
    <div
      role="application"
      aria-label="手势垫"
      data-testid="gesture-pad-surface"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        const rect = e.currentTarget.getBoundingClientRect()
        let leftPct = 50
        let topPct = 50
        if (rect.width > 96 && rect.height > 96) {
          const clampedX = Math.min(rect.width - 52, Math.max(52, e.clientX - rect.left))
          const clampedY = Math.min(rect.height - 52, Math.max(52, e.clientY - rect.top))
          leftPct = (clampedX / rect.width) * 100
          topPct = (clampedY / rect.height) * 100
        }

        gestureRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          originLeftPct: leftPct,
          originTopPct: topPct,
          maxDist: 0,
          everAimed: false,
          aimedSlot: null,
          canceledInCenter: false,
        }
        setTrackingState({
          active: true,
          originLeftPct: leftPct,
          originTopPct: topPct,
          puckX: 0,
          puckY: 0,
          aimedSlot: null,
          canceledInCenter: false,
        })
      }}
      onPointerMove={(e) => {
        const g = gestureRef.current
        if (g.pointerId !== e.pointerId) return
        const dx = e.clientX - g.startX
        const dy = e.clientY - g.startY
        const dist = Math.hypot(dx, dy)
        g.maxDist = Math.max(g.maxDist, dist)

        // Smooth rubber-band damping for compact floating halo orb (max visual radius = 34px)
        const angle = Math.atan2(dy, dx)
        const dampedR = dist > 0.5 ? 34 * (1 - Math.exp(-dist / 42)) : 0
        const puckX = Math.cos(angle) * dampedR
        const puckY = Math.sin(angle) * dampedR

        let nextAimed = g.aimedSlot
        let nextCanceled = g.canceledInCenter

        if (dist >= RADIAL_AIM_LOCK_PX) {
          if (tapTimerRef.current) {
            clearTimeout(tapTimerRef.current)
            tapTimerRef.current = null
          }
          waitingDoubleRef.current = false
          const sector = resolveRadialSectorByDelta(dx, dy)
          if (sector !== g.aimedSlot) {
            triggerHaptic('detent')
          }
          g.everAimed = true
          nextAimed = sector
          nextCanceled = false
        } else if (g.everAimed && dist < RADIAL_CANCEL_RETURN_PX) {
          if (g.aimedSlot !== null) {
            triggerHaptic('detent')
          }
          nextAimed = null
          nextCanceled = true
        }

        g.aimedSlot = nextAimed
        g.canceledInCenter = nextCanceled

        setTrackingState({
          active: true,
          originLeftPct: g.originLeftPct,
          originTopPct: g.originTopPct,
          puckX,
          puckY,
          aimedSlot: nextAimed,
          canceledInCenter: nextCanceled,
        })
      }}
      onPointerUp={(e) => {
        const g = gestureRef.current
        if (g.pointerId !== e.pointerId) return
        g.pointerId = null
        const finalAimed = g.aimedSlot
        const wasEverAimed = g.everAimed
        const wasCanceled = g.canceledInCenter
        const maxDist = g.maxDist

        resetTracking()

        if (wasEverAimed) {
          if (finalAimed !== null && !wasCanceled) {
            triggerSlot(finalAimed)
          }
          return
        }

        if (maxDist > GESTURE_PAD_TAP_MAX_PX) return

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
        resetTracking()
      }}
      className={clsx(
        'trackpad-dots chassis-well relative rounded-[26px] border touch-none select-none overflow-hidden flex items-center justify-center',
        containerHeightCls,
      )}
    >
      {/* Layer 1: Subtle Rangefinder Corner Chamfer Ticks (Harmonized with Rectangular Frame) */}
      <svg
        viewBox="0 0 200 120"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full opacity-35"
      >
        <g
          stroke={isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.09)'}
          strokeWidth="0.9"
          strokeLinecap="round"
        >
          <line x1="16" y1="14" x2="44" y2="32" />
          <line x1="184" y1="14" x2="156" y2="32" />
          <line x1="16" y1="106" x2="44" y2="88" />
          <line x1="184" y1="106" x2="156" y2="88" />
        </g>
      </svg>

      {/* Layer 2: Directional Bezel Ambient Wash + 4 Chamfered Edge Light-Guide Bars */}
      {activeBezelQuad && (
        <div
          aria-hidden="true"
          style={{
            background: isLight
              ? activeBezelQuad.washStyleLight
              : activeBezelQuad.washStyleDark,
          }}
          className="pointer-events-none absolute inset-0 transition-opacity duration-150"
        />
      )}

      {SQUIRCLE_RADIAL_QUADRANTS.map((quad) => {
        const active =
          trackingState.aimedSlot === quad.slotIdx || isSlotFlashing(quad.slotIdx)
        return (
          <span
            key={`edge-${quad.slotIdx}`}
            aria-hidden="true"
            className={clsx(
              'pointer-events-none absolute',
              quad.edgeBarCls,
              active
                ? clsx(quad.edgeBarActiveCls, isLight ? 'bg-[#007aff]' : 'bg-[#30d158]')
                : 'w-6 h-[1.5px] opacity-0',
            )}
          />
        )
      })}

      {/* Layer 3: Architectural 4-Side Cardinal Action Capsules */}
      {SQUIRCLE_RADIAL_QUADRANTS.map((quad) => {
        const highlighted =
          trackingState.aimedSlot === quad.slotIdx || isSlotFlashing(quad.slotIdx)
        const dimmed = trackingState.aimedSlot !== null && !highlighted
        const tileId = slots[quad.slotIdx]
        const tile = tileId ? byId.get(tileId) : undefined
        const Icon = getTileIcon(tile?.icon ?? GESTURE_PAD_SLOT_SPECS[quad.slotIdx].icon)
        const accent = getAccentStyle(tile?.accent ?? 'slate', isLight)

        return (
          <div
            key={quad.slotIdx}
            data-radial-sector={quad.slotIdx}
            data-radial-active={highlighted ? 'true' : 'false'}
            className={clsx(
              'pointer-events-none absolute px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 max-w-[128px] transition-all duration-120',
              quad.badgePosCls,
              highlighted
                ? clsx('ak-primary-solid shadow-md z-20', quad.shiftCls)
                : clsx(
                    'border-transparent ak-text-2',
                    dimmed ? 'opacity-30 scale-95' : 'opacity-90',
                  ),
            )}
          >
            <Icon
              className={clsx('w-3.5 h-3.5 shrink-0', !highlighted && accent.iconText)}
              strokeWidth={2}
            />
            <span className="text-[11px] font-medium truncate">{slotLabel(quad.slotIdx)}</span>
          </div>
        )
      })}

      {/* Calm Center Squircle Anchor (Visible at Rest; Fades Cleanly When Floating Halo Spawns) */}
      <div
        className={clsx(
          'pointer-events-none px-3 py-1.5 rounded-[14px] border flex items-center gap-1.5 transition-all duration-120',
          trackingState.active
            ? 'opacity-0 scale-90'
            : isSlotFlashing(4) || isSlotFlashing(5)
              ? 'ak-primary-solid scale-95'
              : 'ak-elevated ak-text-2',
        )}
      >
        <span className="text-[11px] font-medium ak-text-1 truncate max-w-[108px]">
          {slotLabel(4)}
        </span>
        {hasDoubleTile && (
          <span className="text-[10px] font-mono ak-text-3 pl-1 border-l ak-border-subtle truncate max-w-[84px]">
            2× {slotLabel(5)}
          </span>
        )}
      </div>

      {/* Layer 4: Touch-Origin Floating Radial Compass Halo (Spawns Right Under Finger on Touch!) */}
      <svg
        viewBox="0 0 96 96"
        data-testid="radial-wheel-svg"
        aria-hidden="true"
        style={{
          left: `${trackingState.originLeftPct}%`,
          top: `${trackingState.originTopPct}%`,
        }}
        className={clsx(
          'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-[96px] h-[96px] overflow-visible z-10 transition-opacity duration-100',
          trackingState.active ? 'opacity-100' : 'opacity-0',
        )}
      >
        {/* Whisper-thin floating reticle base */}
        <circle
          cx="48"
          cy="48"
          r="36"
          fill={isLight ? 'rgba(255,255,255,0.55)' : 'rgba(20,21,24,0.58)'}
          stroke={isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)'}
          strokeWidth="1"
        />

        {/* 4 Precision 90-Degree Compass Arc Locks */}
        {SQUIRCLE_RADIAL_QUADRANTS.map((quad) => {
          const isAimed = trackingState.aimedSlot === quad.slotIdx
          return (
            <path
              key={`arc-${quad.slotIdx}`}
              d={isAimed ? quad.haloArcActive : quad.haloArcIdle}
              fill="none"
              stroke={
                isAimed
                  ? isLight
                    ? '#007aff'
                    : '#30d158'
                  : isLight
                    ? 'rgba(0,0,0,0.16)'
                    : 'rgba(255,255,255,0.18)'
              }
              strokeWidth={isAimed ? 2.8 : 1.35}
              strokeLinecap="round"
            />
          )
        })}

        {/* Inner Cancel Deadzone Ring */}
        <circle
          cx="48"
          cy="48"
          r="12"
          fill={
            trackingState.canceledInCenter
              ? 'rgba(239,68,68,0.16)'
              : 'transparent'
          }
          stroke={
            trackingState.canceledInCenter
              ? 'rgba(239,68,68,0.65)'
              : isLight
                ? 'rgba(0,0,0,0.10)'
                : 'rgba(255,255,255,0.12)'
          }
          strokeWidth="1"
          strokeDasharray={trackingState.canceledInCenter ? undefined : '2 2'}
        />

        {/* 1:1 Damped Magnetic Thumb Orb & Taut Filament */}
        {trackingState.active && (
          <g data-testid="radial-wheel-puck">
            <line
              x1="48"
              y1="48"
              x2={48 + trackingState.puckX}
              y2={48 + trackingState.puckY}
              stroke={
                trackingState.canceledInCenter
                  ? 'rgba(239,68,68,0.55)'
                  : isLight
                    ? 'rgba(28,28,30,0.42)'
                    : 'rgba(242,242,247,0.52)'
              }
              strokeWidth="1.6"
            />
            <circle
              cx={48 + trackingState.puckX}
              cy={48 + trackingState.puckY}
              r={trackingState.aimedSlot !== null ? 6.5 : 5}
              fill={
                trackingState.canceledInCenter
                  ? '#ef4444'
                  : isLight
                    ? '#1c1c1e'
                    : '#f2f2f7'
              }
              stroke={isLight ? '#ffffff' : '#141518'}
              strokeWidth="1.8"
            />
          </g>
        )}
      </svg>

      {/* Crisp Cancel Micro-Readout Pill when Dragged Back Into Deadzone */}
      {trackingState.active && trackingState.canceledInCenter && (
        <div className="pointer-events-none relative z-20 px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-[10.5px] font-semibold shadow-sm">
          松开取消
        </div>
      )}
    </div>
  )
}

interface BentoGridZoneProps {
  page: MobileDeckPage
  zone: MobileDeckZone
  zoneIdx: number
  hasClickpadRing: boolean
  byId: Map<string, MobileTile>
  editMode: boolean
  isLight: boolean
  selectedEditItem: SelectedEditItem
  pressedIds: Record<string, boolean>
  draggedTileId: string | null
  onSelectZone: () => void
  onAddTile: () => void
  onTilePointerDown: (
    e: React.PointerEvent<HTMLButtonElement>,
    tile: MobileTile,
    zone: MobileDeckZone,
  ) => void
  onTilePointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void
  onTilePointerFinish: (tileId: string, cancelled: boolean) => void
  onTileFallbackClick: (
    e: React.MouseEvent<HTMLButtonElement>,
    zoneId: string,
    tileId: string,
  ) => void
  fbRing: (id: string) => string
}

function BentoGridZone({
  page,
  zone,
  zoneIdx,
  hasClickpadRing,
  byId,
  editMode,
  isLight,
  selectedEditItem,
  pressedIds,
  draggedTileId,
  onSelectZone,
  onAddTile,
  onTilePointerDown,
  onTilePointerMove,
  onTilePointerFinish,
  onTileFallbackClick,
  fbRing,
}: BentoGridZoneProps) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [gridWidthPx, setGridWidthPx] = useState<number>(fallbackGridWidthPx)

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const syncWidth = () => {
      const measured = el.clientWidth || el.getBoundingClientRect().width
      setGridWidthPx(measured > 0 ? measured : fallbackGridWidthPx())
    }
    syncWidth()

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0
        if (w > 0) {
          setGridWidthPx(w)
        } else {
          syncWidth()
        }
      })
      ro.observe(el)
      return () => ro.disconnect()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', syncWidth)
      return () => window.removeEventListener('resize', syncWidth)
    }
  }, [])

  const cols = clampColumns(zone.columns, page.columns)
  const zoneTiles = zone.tileIds
    .map((id) => byId.get(id))
    .filter((t): t is MobileTile => Boolean(t))
  const packed = packBentoTiles(zoneTiles, cols)

  const isTopUtilityStrip =
    hasClickpadRing && zoneIdx === 0 && packed.totalRows === 1 && cols === 3
  const isFourColStrip = cols === 4 && packed.totalRows === 1

  const rowMinPx = isTopUtilityStrip
    ? 48
    : isFourColStrip
      ? 54
      : hasClickpadRing
        ? 52
        : 78

  const gapPx = 10
  const unitColWidthPx = Math.max(
    40,
    (gridWidthPx - (packed.columns - 1) * gapPx) / packed.columns,
  )

  return (
    <div
      ref={gridRef}
      onClick={(e) => {
        if (!editMode) return
        if (e.target === e.currentTarget) {
          e.stopPropagation()
          triggerHaptic('tap')
          onSelectZone()
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
        const isLarge2x2 = colSpan === 2 && rowSpan === 2

        const tileWidthPx = unitColWidthPx * colSpan + (colSpan - 1) * gapPx
        const tileHeightPx = rowMinPx * rowSpan + (rowSpan - 1) * gapPx
        const showSilk = canFitKeycapSilkscreen(
          tileWidthPx,
          tileHeightPx,
          isTall,
          isCompactUtility,
        )
        const silkText = showSilk ? resolveTileSilkscreen(tile) : null

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
            onPointerDown={(e) => onTilePointerDown(e, tile, zone)}
            onPointerMove={onTilePointerMove}
            onPointerUp={() => onTilePointerFinish(tile.id, false)}
            onPointerCancel={() => onTilePointerFinish(tile.id, true)}
            onClick={(e) => onTileFallbackClick(e, zone.id, tile.id)}
            className={clsx(
              'tile-surface relative rounded-[18px] border select-none touch-none overflow-hidden',
              style.card,
              isCompactUtility
                ? isFourColStrip
                  ? 'px-2 py-2 flex flex-col items-center justify-center gap-1 text-center'
                  : 'px-3 py-2 flex items-center justify-center gap-2 text-center'
                : isTall
                  ? 'p-3.5 flex flex-col items-center justify-center gap-2 text-center min-h-[164px]'
                  : isLarge2x2
                    ? 'p-3.5 flex flex-col justify-between text-left min-h-[164px]'
                    : 'p-3 flex flex-col justify-between text-left',
              pressed && !editMode && clsx('tile-pressed', style.pressedGlow),
              isSelected &&
                (isLight ? 'ring-2 ring-[#1c1c1e] z-10' : 'ring-2 ring-[#f2f2f7] z-10'),
              isDragged && 'z-30 scale-[1.03] opacity-95 shadow-xl',
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
                  <span className="ak-text-1 text-xs font-medium truncate">{tile.label}</span>
                </>
              )
            ) : isTall ? (
              <>
                <Icon className={clsx('w-5 h-5 shrink-0', style.iconText)} strokeWidth={1.9} />
                <span className="ak-text-1 text-xs font-medium leading-snug line-clamp-2">
                  {tile.label}
                </span>
                {silkText && (
                  <span
                    data-testid="tile-silkscreen"
                    className="ak-text-3 text-[10px] font-mono tracking-tight truncate max-w-full"
                  >
                    {silkText}
                  </span>
                )}
              </>
            ) : (
              <>
                <div className="w-full flex items-center justify-between gap-2">
                  <Icon
                    className={clsx(
                      isLarge2x2 ? 'w-5 h-5' : 'w-4 h-4',
                      'shrink-0',
                      style.iconText,
                    )}
                    strokeWidth={1.9}
                  />
                  {silkText && (
                    <span
                      data-testid="tile-silkscreen"
                      className="ak-text-3 text-[10.5px] font-mono tracking-tight truncate max-w-[68%]"
                    >
                      {silkText}
                    </span>
                  )}
                </div>
                <div
                  className={clsx(
                    'ak-text-1 font-medium tracking-tight truncate w-full',
                    isLarge2x2 ? 'text-sm' : 'text-[13px]',
                  )}
                >
                  {tile.label}
                </div>
              </>
            )}
          </button>
        )
      })}

      {editMode && (
        <button
          type="button"
          aria-label="添加按键"
          data-testid={`add-bento-tile-${zone.id}`}
          onClick={(e) => {
            e.stopPropagation()
            triggerHaptic('tap')
            onAddTile()
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
    triggerHaptic('detent')
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
        'w-full flex flex-col gap-2.5 select-none',
        hasClickpadRing ? 'min-h-full justify-between py-1.5 px-0.5' : 'pb-2',
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
            {zone.kind === 'bento-grid' && (
              <BentoGridZone
                page={page}
                zone={zone}
                zoneIdx={zoneIdx}
                hasClickpadRing={hasClickpadRing}
                byId={byId}
                editMode={editMode}
                isLight={isLight}
                selectedEditItem={selectedEditItem}
                pressedIds={pressedIds}
                draggedTileId={draggedTileId}
                onSelectZone={() =>
                  setSelectedEditItem({ kind: 'zone', pageId: page.id, zoneId: zone.id })
                }
                onAddTile={() => addTileToPage(page.id, zone.id)}
                onTilePointerDown={handleTilePointerDown}
                onTilePointerMove={handleTilePointerMove}
                onTilePointerFinish={finishTilePointer}
                onTileFallbackClick={handleTileFallbackClick}
                fbRing={fbRing}
              />
            )}

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

            {zone.kind === 'pointer-pad' && (
              <EmbeddedPointerPad
                pageId={page.id}
                zone={zone}
                editMode={editMode}
                isSelectedZone={isZoneSelected}
                isLight={isLight}
              />
            )}

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
