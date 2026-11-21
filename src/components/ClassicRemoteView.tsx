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
  const homeTile = getTile('remote.home')
  const upTile = getTile('remote.up')
  const downTile = getTile('remote.down')
  const leftTile = getTile('remote.left')
  const rightTile = getTile('remote.right')
  const okTile = getTile('remote.ok')
  const backTile = getTile('remote.back')
  const volUpTile = getTile('remote.vol_up')
  const volDownTile = getTile('remote.vol_down')
  const muteTile = getTile('remote.mute')
  const quickTiles = ['remote.q1', 'remote.q2', 'remote.q3', 'remote.q4']
    .map((id) => getTile(id))
    .filter((t): t is MobileTile => Boolean(t))

  return (
    <div className="w-full flex flex-col gap-3 pb-1 select-none">
      {/* Top Row: 3 Equal Full-Width Utility Keycaps */}
      <div className="grid grid-cols-3 gap-2.5">
        {escTile && (
          <button
            type="button"
            {...bindHandlers(escTile)}
            className={clsx(
              'tile-surface h-[58px] px-3 rounded-2xl border border-rose-400/25 bg-[#23141a] flex items-center gap-2.5 text-left touch-none',
              pressedIds[escTile.id] && 'tile-pressed',
              fbRing(escTile.id),
              editMode && 'border-dashed border-blue-400/60',
            )}
          >
            <span className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-300 inline-flex items-center justify-center shrink-0">
              <Power className="w-4 h-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-semibold text-zinc-100 truncate">{escTile.label}</div>
              <div className="text-[10px] text-rose-300/80 font-mono truncate">
                {escTile.actionSummary ?? 'Esc'}
              </div>
            </div>
          </button>
        )}

        {menuTile && (
          <button
            type="button"
            {...bindHandlers(menuTile)}
            className={clsx(
              'tile-surface h-[58px] px-3 rounded-2xl border border-blue-400/20 bg-[#131b2b] flex items-center gap-2.5 text-left touch-none',
              pressedIds[menuTile.id] && 'tile-pressed',
              fbRing(menuTile.id),
              editMode && 'border-dashed border-blue-400/60',
            )}
          >
            <span className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-300 inline-flex items-center justify-center shrink-0">
              <Menu className="w-4 h-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-semibold text-zinc-100 truncate">{menuTile.label}</div>
              <div className="text-[10px] text-blue-300/80 font-mono truncate">
                {menuTile.actionSummary ?? 'Ctrl+K'}
              </div>
            </div>
          </button>
        )}

        {homeTile && (
          <button
            type="button"
            {...bindHandlers(homeTile)}
            className={clsx(
              'tile-surface h-[58px] px-3 rounded-2xl border border-white/[0.09] bg-[#171b24] flex items-center gap-2.5 text-left touch-none',
              pressedIds[homeTile.id] && 'tile-pressed',
              fbRing(homeTile.id),
              editMode && 'border-dashed border-blue-400/60',
            )}
          >
            <span className="w-8 h-8 rounded-xl bg-white/[0.07] text-zinc-200 inline-flex items-center justify-center shrink-0">
              <Home className="w-4 h-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-semibold text-zinc-100 truncate">{homeTile.label}</div>
              <div className="text-[10px] text-zinc-400 font-mono truncate">
                {homeTile.actionSummary ?? 'Ctrl+L'}
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Full-Width 3x3 Square/Squircle Hardware D-Pad Matrix */}
      <div className="p-2.5 rounded-3xl bg-[#121620] border border-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="grid grid-cols-3 gap-2.5">
          {/* Row 1: Back | UP | Vol+ */}
          {backTile && (
            <button
              type="button"
              {...bindHandlers(backTile)}
              className={clsx(
                'tile-surface min-h-[78px] rounded-2xl border border-white/[0.07] bg-[#171b24] flex flex-col items-center justify-center gap-1 touch-none',
                pressedIds[backTile.id] && 'tile-pressed',
                fbRing(backTile.id),
                editMode && 'border-dashed border-blue-400/60',
              )}
            >
              <Undo2 className="w-4 h-4 text-zinc-300" />
              <span className="text-xs font-medium text-zinc-200">{backTile.label}</span>
              {backTile.actionSummary && (
                <span className="text-[10px] text-zinc-400 font-mono">{backTile.actionSummary}</span>
              )}
            </button>
          )}

          {upTile && (
            <button
              type="button"
              aria-label={upTile.label}
              {...bindHandlers(upTile)}
              className={clsx(
                'tile-surface min-h-[78px] rounded-2xl border border-white/[0.11] bg-[#1d2230] flex flex-col items-center justify-center gap-0.5 text-zinc-100 touch-none',
                pressedIds[upTile.id] && 'tile-pressed',
                fbRing(upTile.id),
                editMode && 'border-dashed border-blue-400/60',
              )}
            >
              <ChevronUp className="w-7 h-7" strokeWidth={2.2} />
              {upTile.actionSummary && upTile.actionSummary !== '↑' && (
                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[84px]">
                  {upTile.actionSummary}
                </span>
              )}
            </button>
          )}

          {volUpTile && (
            <button
              type="button"
              {...bindHandlers(volUpTile)}
              className={clsx(
                'tile-surface min-h-[78px] rounded-2xl border border-white/[0.07] bg-[#171b24] flex flex-col items-center justify-center gap-1 touch-none',
                pressedIds[volUpTile.id] && 'tile-pressed',
                fbRing(volUpTile.id),
                editMode && 'border-dashed border-blue-400/60',
              )}
            >
              <Volume2 className="w-4 h-4 text-zinc-300" />
              <span className="text-xs font-medium text-zinc-200">{volUpTile.label}</span>
              {volUpTile.actionSummary && volUpTile.actionSummary !== '音量+' && (
                <span className="text-[10px] text-zinc-400 font-mono">{volUpTile.actionSummary}</span>
              )}
            </button>
          )}

          {/* Row 2: LEFT | OK | RIGHT */}
          {leftTile && (
            <button
              type="button"
              aria-label={leftTile.label}
              {...bindHandlers(leftTile)}
              className={clsx(
                'tile-surface min-h-[84px] rounded-2xl border border-white/[0.11] bg-[#1d2230] flex flex-col items-center justify-center gap-0.5 text-zinc-100 touch-none',
                pressedIds[leftTile.id] && 'tile-pressed',
                fbRing(leftTile.id),
                editMode && 'border-dashed border-blue-400/60',
              )}
            >
              <ChevronLeft className="w-7 h-7" strokeWidth={2.2} />
              {leftTile.actionSummary && leftTile.actionSummary !== '←' && (
                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[84px]">
                  {leftTile.actionSummary}
                </span>
              )}
            </button>
          )}

          {okTile && (
            <button
              type="button"
              {...bindHandlers(okTile)}
              className={clsx(
                'tile-surface min-h-[84px] rounded-2xl border border-blue-400/45 bg-gradient-to-b from-[#253657] to-[#1a253d] shadow-[0_0_20px_rgba(59,130,246,0.18)] flex flex-col items-center justify-center gap-1 touch-none',
                pressedIds[okTile.id] && 'tile-pressed',
                fbRing(okTile.id),
                editMode && 'border-dashed border-blue-300',
              )}
            >
              <span className="text-[16px] font-bold tracking-wide text-white">{okTile.label}</span>
              {okTile.actionSummary && (
                <span className="px-2 py-0.5 rounded-md bg-blue-400/20 text-[10px] text-blue-200 font-mono truncate max-w-[92px]">
                  {okTile.actionSummary}
                </span>
              )}
            </button>
          )}

          {rightTile && (
            <button
              type="button"
              aria-label={rightTile.label}
              {...bindHandlers(rightTile)}
              className={clsx(
                'tile-surface min-h-[84px] rounded-2xl border border-white/[0.11] bg-[#1d2230] flex flex-col items-center justify-center gap-0.5 text-zinc-100 touch-none',
                pressedIds[rightTile.id] && 'tile-pressed',
                fbRing(rightTile.id),
                editMode && 'border-dashed border-blue-400/60',
              )}
            >
              <ChevronRight className="w-7 h-7" strokeWidth={2.2} />
              {rightTile.actionSummary && rightTile.actionSummary !== '→' && (
                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[84px]">
                  {rightTile.actionSummary}
                </span>
              )}
            </button>
          )}

          {/* Row 3: Mute | DOWN | Vol- */}
          {muteTile && (
            <button
              type="button"
              {...bindHandlers(muteTile)}
              className={clsx(
                'tile-surface min-h-[78px] rounded-2xl border border-white/[0.07] bg-[#171b24] flex flex-col items-center justify-center gap-1 touch-none',
                pressedIds[muteTile.id] && 'tile-pressed',
                fbRing(muteTile.id),
                editMode && 'border-dashed border-blue-400/60',
              )}
            >
              <VolumeX className="w-4 h-4 text-zinc-300" />
              <span className="text-xs font-medium text-zinc-200">{muteTile.label}</span>
              {muteTile.actionSummary && muteTile.actionSummary !== '静音' && (
                <span className="text-[10px] text-zinc-400 font-mono">{muteTile.actionSummary}</span>
              )}
            </button>
          )}

          {downTile && (
            <button
              type="button"
              aria-label={downTile.label}
              {...bindHandlers(downTile)}
              className={clsx(
                'tile-surface min-h-[78px] rounded-2xl border border-white/[0.11] bg-[#1d2230] flex flex-col items-center justify-center gap-0.5 text-zinc-100 touch-none',
                pressedIds[downTile.id] && 'tile-pressed',
                fbRing(downTile.id),
                editMode && 'border-dashed border-blue-400/60',
              )}
            >
              <ChevronDown className="w-7 h-7" strokeWidth={2.2} />
              {downTile.actionSummary && downTile.actionSummary !== '↓' && (
                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[84px]">
                  {downTile.actionSummary}
                </span>
              )}
            </button>
          )}

          {volDownTile && (
            <button
              type="button"
              {...bindHandlers(volDownTile)}
              className={clsx(
                'tile-surface min-h-[78px] rounded-2xl border border-white/[0.07] bg-[#171b24] flex flex-col items-center justify-center gap-1 touch-none',
                pressedIds[volDownTile.id] && 'tile-pressed',
                fbRing(volDownTile.id),
                editMode && 'border-dashed border-blue-400/60',
              )}
            >
              <Volume1 className="w-4 h-4 text-zinc-300" />
              <span className="text-xs font-medium text-zinc-200">{volDownTile.label}</span>
              {volDownTile.actionSummary && volDownTile.actionSummary !== '音量-' && (
                <span className="text-[10px] text-zinc-400 font-mono">{volDownTile.actionSummary}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Bottom 2x2 Quick Action Deck */}
      {quickTiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {quickTiles.map((tile) => {
            const Icon = getTileIcon(tile.icon)
            const style = ACCENT_STYLES[tile.accent] ?? ACCENT_STYLES.slate
            return (
              <button
                key={tile.id}
                type="button"
                {...bindHandlers(tile)}
                className={clsx(
                  'tile-surface h-[68px] px-3.5 rounded-2xl border flex items-center gap-3 text-left touch-none',
                  style.card,
                  pressedIds[tile.id] && 'tile-pressed',
                  fbRing(tile.id),
                  editMode && 'border-dashed border-blue-400/60',
                )}
              >
                <span
                  className={clsx(
                    'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0',
                    style.iconBg,
                    style.iconText,
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-zinc-100 truncate">
                    {tile.label}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono truncate mt-0.5">
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
