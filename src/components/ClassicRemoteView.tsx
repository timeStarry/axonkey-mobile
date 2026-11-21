import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Home,
  Menu,
  Power,
  Undo2,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { clsx } from 'clsx'
import { TileGestureController } from '../input/tileGesture'
import type { MobileDeckPage, MobileTile } from '../protocol/types'
import { registerPendingTileRequest, useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'
import { ACCENT_STYLES, getTileIcon } from '../ui/icons'

interface ClassicRemoteViewProps {
  page: MobileDeckPage
}

export function ClassicRemoteView({ page }: ClassicRemoteViewProps) {
  const editMode = useMobileStore((s) => s.editMode)
  const setEditingTileId = useMobileStore((s) => s.setEditingTileId)
  const tileFeedback = useMobileStore((s) => s.tileFeedback)
  const deck = useMobileStore((s) => s.deck)
  const getClient = useMobileStore((s) => s.getClient)

  const [pressedIds, setPressedIds] = useState<Record<string, boolean>>({})
  const controllerRef = useRef<TileGestureController | null>(null)

  if (!controllerRef.current) {
    controllerRef.current = new TileGestureController(
      {
        onActivate: (tileId, gesture) => {
          triggerHaptic(gesture === 'long' ? 'heavy' : 'tap')
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
    const ctrl = controllerRef.current
    return () => ctrl?.cancelAll()
  }, [])

  const byId = new Map(page.tiles.map((t) => [t.id, t]))
  const getTile = (id: string): MobileTile | undefined => byId.get(id)

  const bindHandlers = (tile: MobileTile | undefined) => {
    if (!tile) return {}
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (editMode) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setPressedIds((prev) => ({ ...prev, [tile.id]: true }))
        controllerRef.current?.onDown(tile)
      },
      onPointerUp: () => {
        if (editMode) return
        setPressedIds((prev) => ({ ...prev, [tile.id]: false }))
        controllerRef.current?.onUp(tile.id)
      },
      onPointerCancel: () => {
        setPressedIds((prev) => ({ ...prev, [tile.id]: false }))
        controllerRef.current?.onCancel(tile.id)
      },
      onClick: () => {
        if (editMode) {
          triggerHaptic('tap')
          setEditingTileId(tile.id)
        }
      },
    }
  }

  const fbRing = (id: string) => {
    const fb = tileFeedback[id]
    if (!fb || Date.now() - fb.at >= 700) return ''
    return fb.status === 'ok' ? 'ring-2 ring-emerald-400/75' : 'ring-2 ring-rose-500/80'
  }

  const escTile = getTile('remote.esc')
  const menuTile = getTile('remote.menu')
  const upTile = getTile('remote.up')
  const downTile = getTile('remote.down')
  const leftTile = getTile('remote.left')
  const rightTile = getTile('remote.right')
  const okTile = getTile('remote.ok')
  const backTile = getTile('remote.back')
  const homeTile = getTile('remote.home')
  const volUpTile = getTile('remote.vol_up')
  const volDownTile = getTile('remote.vol_down')
  const muteTile = getTile('remote.mute')
  const quickTiles = ['remote.q1', 'remote.q2', 'remote.q3', 'remote.q4']
    .map((id) => getTile(id))
    .filter((t): t is MobileTile => Boolean(t))

  return (
    <div className="w-full max-w-[360px] mx-auto flex flex-col items-center gap-4 py-1 select-none">
      {/* Top Row: Power/Esc & Menu */}
      <div className="w-full flex items-center justify-between px-4">
        {escTile && (
          <button
            type="button"
            {...bindHandlers(escTile)}
            className={clsx(
              'tile-surface h-12 px-4 rounded-full border border-rose-400/25 bg-[#24151b] flex items-center gap-2 text-rose-300 touch-none',
              pressedIds[escTile.id] && 'tile-pressed',
              fbRing(escTile.id),
              editMode && 'border-dashed border-blue-400/60',
            )}
          >
            <Power className="w-4 h-4" />
            <div className="text-left leading-tight">
              <div className="text-xs font-semibold text-zinc-100">{escTile.label}</div>
              {escTile.actionSummary && (
                <div className="text-[10px] text-rose-300/80 font-mono">{escTile.actionSummary}</div>
              )}
            </div>
          </button>
        )}

        {menuTile && (
          <button
            type="button"
            {...bindHandlers(menuTile)}
            className={clsx(
              'tile-surface h-12 px-4 rounded-full border border-white/10 bg-[#171b24] flex items-center gap-2 text-blue-300 touch-none',
              pressedIds[menuTile.id] && 'tile-pressed',
              fbRing(menuTile.id),
              editMode && 'border-dashed border-blue-400/60',
            )}
          >
            <Menu className="w-4 h-4" />
            <div className="text-left leading-tight">
              <div className="text-xs font-semibold text-zinc-100">{menuTile.label}</div>
              {menuTile.actionSummary && (
                <div className="text-[10px] text-zinc-400 font-mono">{menuTile.actionSummary}</div>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Circular Classic D-Pad Ring + Center OK */}
      <div className="relative w-[224px] h-[224px] rounded-full bg-[#151923] border border-white/[0.09] shadow-[inset_0_2px_12px_rgba(0,0,0,0.6),0_8px_28px_rgba(0,0,0,0.45)] flex items-center justify-center">
        {/* Up */}
        {upTile && (
          <button
            type="button"
            aria-label={upTile.label}
            {...bindHandlers(upTile)}
            className={clsx(
              'absolute top-2 left-1/2 -translate-x-1/2 w-20 h-14 rounded-t-full flex flex-col items-center justify-center text-zinc-200 active:bg-white/[0.08] touch-none',
              pressedIds[upTile.id] && 'bg-white/[0.1]',
              fbRing(upTile.id),
            )}
          >
            <ChevronUp className="w-6 h-6" />
            {upTile.actionSummary && upTile.actionSummary !== '↑' && (
              <span className="text-[9px] text-zinc-400 font-mono truncate max-w-[64px]">
                {upTile.actionSummary}
              </span>
            )}
          </button>
        )}

        {/* Down */}
        {downTile && (
          <button
            type="button"
            aria-label={downTile.label}
            {...bindHandlers(downTile)}
            className={clsx(
              'absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-14 rounded-b-full flex flex-col items-center justify-center text-zinc-200 active:bg-white/[0.08] touch-none',
              pressedIds[downTile.id] && 'bg-white/[0.1]',
              fbRing(downTile.id),
            )}
          >
            {downTile.actionSummary && downTile.actionSummary !== '↓' && (
              <span className="text-[9px] text-zinc-400 font-mono truncate max-w-[64px]">
                {downTile.actionSummary}
              </span>
            )}
            <ChevronDown className="w-6 h-6" />
          </button>
        )}

        {/* Left */}
        {leftTile && (
          <button
            type="button"
            aria-label={leftTile.label}
            {...bindHandlers(leftTile)}
            className={clsx(
              'absolute left-2 top-1/2 -translate-y-1/2 w-14 h-20 rounded-l-full flex flex-col items-center justify-center text-zinc-200 active:bg-white/[0.08] touch-none',
              pressedIds[leftTile.id] && 'bg-white/[0.1]',
              fbRing(leftTile.id),
            )}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Right */}
        {rightTile && (
          <button
            type="button"
            aria-label={rightTile.label}
            {...bindHandlers(rightTile)}
            className={clsx(
              'absolute right-2 top-1/2 -translate-y-1/2 w-14 h-20 rounded-r-full flex flex-col items-center justify-center text-zinc-200 active:bg-white/[0.08] touch-none',
              pressedIds[rightTile.id] && 'bg-white/[0.1]',
              fbRing(rightTile.id),
            )}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Center OK Button */}
        {okTile && (
          <button
            type="button"
            {...bindHandlers(okTile)}
            className={clsx(
              'tile-surface w-[90px] h-[90px] rounded-full bg-gradient-to-b from-[#232b3d] to-[#171c28] border border-blue-400/35 flex flex-col items-center justify-center gap-0.5 touch-none z-10',
              pressedIds[okTile.id] && 'tile-pressed',
              fbRing(okTile.id),
              editMode && 'border-dashed border-blue-400',
            )}
          >
            <span className="text-sm font-bold text-white">{okTile.label}</span>
            {okTile.actionSummary && (
              <span className="text-[10px] text-blue-300 font-mono truncate max-w-[74px]">
                {okTile.actionSummary}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Navigation & Volume Row */}
      <div className="w-full grid grid-cols-3 gap-2.5 px-2">
        {backTile && (
          <button
            type="button"
            {...bindHandlers(backTile)}
            className={clsx(
              'tile-surface h-14 rounded-2xl border border-white/[0.08] bg-[#171b24] flex flex-col items-center justify-center gap-0.5 touch-none',
              pressedIds[backTile.id] && 'tile-pressed',
              fbRing(backTile.id),
            )}
          >
            <Undo2 className="w-4 h-4 text-zinc-200" />
            <span className="text-[11px] font-medium text-zinc-200">{backTile.label}</span>
            {backTile.actionSummary && (
              <span className="text-[9px] text-zinc-400 font-mono">{backTile.actionSummary}</span>
            )}
          </button>
        )}

        {homeTile && (
          <button
            type="button"
            {...bindHandlers(homeTile)}
            className={clsx(
              'tile-surface h-14 rounded-2xl border border-white/[0.08] bg-[#171b24] flex flex-col items-center justify-center gap-0.5 touch-none',
              pressedIds[homeTile.id] && 'tile-pressed',
              fbRing(homeTile.id),
            )}
          >
            <Home className="w-4 h-4 text-zinc-200" />
            <span className="text-[11px] font-medium text-zinc-200">{homeTile.label}</span>
            {homeTile.actionSummary && (
              <span className="text-[9px] text-zinc-400 font-mono">{homeTile.actionSummary}</span>
            )}
          </button>
        )}

        {/* Volume Rocker */}
        <div className="h-14 rounded-2xl border border-white/[0.08] bg-[#171b24] grid grid-cols-3 overflow-hidden">
          {volDownTile && (
            <button
              type="button"
              aria-label="音量-"
              {...bindHandlers(volDownTile)}
              className="flex items-center justify-center text-zinc-300 active:bg-white/10 touch-none"
            >
              <Volume1 className="w-4 h-4" />
            </button>
          )}
          {muteTile && (
            <button
              type="button"
              aria-label="静音"
              {...bindHandlers(muteTile)}
              className="flex items-center justify-center text-zinc-400 border-x border-white/[0.06] active:bg-white/10 touch-none"
            >
              <VolumeX className="w-3.5 h-3.5" />
            </button>
          )}
          {volUpTile && (
            <button
              type="button"
              aria-label="音量+"
              {...bindHandlers(volUpTile)}
              className="flex items-center justify-center text-zinc-300 active:bg-white/10 touch-none"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 4 Customizable Quick Slots (Dynamic PC Silkscreen) */}
      {quickTiles.length > 0 && (
        <div className="w-full grid grid-cols-2 gap-2.5 px-2">
          {quickTiles.map((tile) => {
            const Icon = getTileIcon(tile.icon)
            const style = ACCENT_STYLES[tile.accent] ?? ACCENT_STYLES.slate
            return (
              <button
                key={tile.id}
                type="button"
                {...bindHandlers(tile)}
                className={clsx(
                  'tile-surface h-16 px-3 rounded-2xl border flex items-center gap-2.5 text-left touch-none',
                  style.card,
                  pressedIds[tile.id] && 'tile-pressed',
                  fbRing(tile.id),
                  editMode && 'border-dashed border-blue-400/60',
                )}
              >
                <span
                  className={clsx(
                    'w-8 h-8 rounded-xl inline-flex items-center justify-center shrink-0',
                    style.iconBg,
                    style.iconText,
                  )}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-zinc-100 truncate">{tile.label}</div>
                  <div className="text-[10px] text-zinc-400 font-mono truncate">
                    {tile.actionSummary ?? tile.subtitle ?? '未映射'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
