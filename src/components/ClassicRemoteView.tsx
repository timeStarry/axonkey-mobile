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
import type { MobileDeckPage, MobileTile, TileGestureKind } from '../protocol/types'
import { registerPendingTileRequest, useMobileStore } from '../state/useMobileStore'
import { triggerHaptic, type HapticKind } from '../transport/nativeBridge'
import { ACCENT_STYLES, getTileIcon } from '../ui/icons'

interface ClassicRemoteViewProps {
  page: MobileDeckPage
}

function resolveActivateHaptic(tileId: string, gesture: TileGestureKind): HapticKind {
  if (gesture === 'long') return 'heavy'
  if (gesture === 'double') return 'confirm'
  if (tileId === 'remote.esc') return 'heavy'
  if (tileId === 'remote.ok' || tileId === 'remote.q2') return 'confirm'
  return 'tap'
}

function GesturePills({ tile, compact = false }: { tile: MobileTile; compact?: boolean }) {
  if (tile.mode !== 'hold' && !tile.hasDoubleClick && !tile.hasLongPress) return null
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      {tile.mode === 'hold' && (
        <span
          className={clsx(
            'rounded font-semibold tracking-wider bg-white/[0.09] text-zinc-300',
            compact ? 'px-1 py-px text-[8px]' : 'px-1.5 py-0.5 text-[9px]',
          )}
        >
          HOLD
        </span>
      )}
      {tile.hasDoubleClick && (
        <span
          className={clsx(
            'rounded font-mono font-medium bg-white/[0.07] text-zinc-400',
            compact ? 'px-1 py-px text-[8px]' : 'px-1 py-0.5 text-[9px]',
          )}
        >
          2×
        </span>
      )}
      {tile.hasLongPress && (
        <span
          className={clsx(
            'rounded font-medium bg-white/[0.07] text-zinc-400',
            compact ? 'px-1 py-px text-[8px]' : 'px-1 py-0.5 text-[9px]',
          )}
        >
          长按
        </span>
      )}
    </span>
  )
}

export function ClassicRemoteView({ page }: ClassicRemoteViewProps) {
  const tileFeedback = useMobileStore((s) => s.tileFeedback)
  const deck = useMobileStore((s) => s.deck)
  const getClient = useMobileStore((s) => s.getClient)

  const [pressedIds, setPressedIds] = useState<Record<string, boolean>>({})
  const controllerRef = useRef<TileGestureController | null>(null)

  if (!controllerRef.current) {
    controllerRef.current = new TileGestureController(
      {
        onActivate: (tileId, gesture) => {
          triggerHaptic(resolveActivateHaptic(tileId, gesture))
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
        e.currentTarget.setPointerCapture(e.pointerId)
        setPressedIds((prev) => ({ ...prev, [tile.id]: true }))
        controllerRef.current?.onDown(tile)
      },
      onPointerUp: () => {
        setPressedIds((prev) => ({ ...prev, [tile.id]: false }))
        controllerRef.current?.onUp(tile.id)
      },
      onPointerCancel: () => {
        setPressedIds((prev) => ({ ...prev, [tile.id]: false }))
        controllerRef.current?.onCancel(tile.id)
      },
    }
  }

  const fbRing = (id: string) => {
    const fb = tileFeedback[id]
    if (!fb || Date.now() - fb.at >= 650) return ''
    return fb.status === 'ok' ? 'ring-1 ring-emerald-400/70' : 'ring-2 ring-rose-500/80'
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
    <div className="w-full h-full flex flex-col justify-between gap-2.5 select-none">
      {/* Row 1: 3 Anodized System Utility Keycaps */}
      <div className="grid grid-cols-3 gap-2.5 shrink-0">
        {escTile && (
          <button
            type="button"
            {...bindHandlers(escTile)}
            className={clsx(
              'tile-surface relative h-[60px] px-2.5 rounded-2xl border border-rose-400/25 bg-[#221319] flex items-center gap-2 text-left touch-none',
              pressedIds[escTile.id] &&
                'tile-pressed border-rose-400/60 shadow-[0_0_16px_rgba(244,63,94,0.3)]',
              fbRing(escTile.id),
            )}
          >
            <span className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-300 inline-flex items-center justify-center shrink-0">
              <Power className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[12.5px] font-semibold text-zinc-100 truncate">{escTile.label}</div>
              <div className="text-[10.5px] text-rose-300/85 font-mono truncate mt-0.5">
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
              'tile-surface relative h-[60px] px-2.5 rounded-2xl border border-blue-400/20 bg-[#121a2a] flex items-center gap-2 text-left touch-none',
              pressedIds[menuTile.id] &&
                'tile-pressed border-blue-400/60 shadow-[0_0_16px_rgba(59,130,246,0.28)]',
              fbRing(menuTile.id),
            )}
          >
            <span className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-300 inline-flex items-center justify-center shrink-0">
              <Menu className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[12.5px] font-semibold text-zinc-100 truncate">{menuTile.label}</div>
              <div className="text-[10.5px] text-blue-300/85 font-mono truncate mt-0.5">
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
              'tile-surface relative h-[60px] px-2.5 rounded-2xl border border-white/[0.09] bg-[#151922] flex items-center gap-2 text-left touch-none',
              pressedIds[homeTile.id] &&
                'tile-pressed border-zinc-300/40 shadow-[0_0_14px_rgba(255,255,255,0.1)]',
              fbRing(homeTile.id),
            )}
          >
            <span className="w-8 h-8 rounded-xl bg-white/[0.07] text-zinc-200 inline-flex items-center justify-center shrink-0">
              <Home className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[12.5px] font-semibold text-zinc-100 truncate">{homeTile.label}</div>
              <div className="text-[10.5px] text-zinc-400 font-mono truncate mt-0.5">
                {homeTile.actionSummary ?? 'Ctrl+L'}
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Center: Balanced Square-Proportioned 3x3 Navigation & Media Matrix */}
      <div className="chassis-well flex-[2.6] min-h-[228px] p-2.5 rounded-[26px] border border-white/[0.07] flex flex-col">
        <div className="grid grid-cols-3 grid-rows-3 gap-2.5 flex-1">
          {/* Row 1: Back | UP | Vol+ */}
          {backTile && (
            <button
              type="button"
              {...bindHandlers(backTile)}
              className={clsx(
                'tile-surface relative rounded-2xl border border-white/[0.08] bg-[#151922] flex flex-col items-center justify-center gap-0.5 px-1.5 touch-none',
                pressedIds[backTile.id] && 'tile-pressed border-zinc-300/35',
                fbRing(backTile.id),
              )}
            >
              <div className="absolute top-1.5 right-1.5">
                <GesturePills tile={backTile} compact />
              </div>
              <Undo2 className="w-4 h-4 text-zinc-300" />
              <span className="text-xs font-medium text-zinc-200">{backTile.label}</span>
              {backTile.actionSummary && (
                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-full">
                  {backTile.actionSummary}
                </span>
              )}
            </button>
          )}

          {upTile && (
            <button
              type="button"
              aria-label={upTile.label}
              {...bindHandlers(upTile)}
              className={clsx(
                'tile-surface relative rounded-2xl border border-white/[0.12] bg-[#1b202d] flex flex-col items-center justify-center gap-0.5 text-zinc-100 touch-none',
                pressedIds[upTile.id] &&
                  'tile-pressed border-blue-400/45 shadow-[0_0_16px_rgba(59,130,246,0.2)]',
                fbRing(upTile.id),
              )}
            >
              <ChevronUp className="w-7 h-7" strokeWidth={2.3} />
              <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[84px]">
                {upTile.actionSummary ?? '↑'}
              </span>
            </button>
          )}

          {volUpTile && (
            <button
              type="button"
              {...bindHandlers(volUpTile)}
              className={clsx(
                'tile-surface relative rounded-2xl border border-white/[0.08] bg-[#151922] flex flex-col items-center justify-center gap-0.5 px-1.5 touch-none',
                pressedIds[volUpTile.id] && 'tile-pressed border-zinc-300/35',
                fbRing(volUpTile.id),
              )}
            >
              <div className="absolute top-1.5 right-1.5">
                <GesturePills tile={volUpTile} compact />
              </div>
              <Volume2 className="w-4 h-4 text-zinc-300" />
              <span className="text-xs font-medium text-zinc-200">{volUpTile.label}</span>
              {volUpTile.actionSummary && volUpTile.actionSummary !== volUpTile.label && (
                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-full">
                  {volUpTile.actionSummary}
                </span>
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
                'tile-surface relative rounded-2xl border border-white/[0.12] bg-[#1b202d] flex flex-col items-center justify-center gap-0.5 text-zinc-100 touch-none',
                pressedIds[leftTile.id] &&
                  'tile-pressed border-blue-400/45 shadow-[0_0_16px_rgba(59,130,246,0.2)]',
                fbRing(leftTile.id),
              )}
            >
              <ChevronLeft className="w-7 h-7" strokeWidth={2.3} />
              <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[84px]">
                {leftTile.actionSummary ?? '←'}
              </span>
            </button>
          )}

          {okTile && (
            <button
              type="button"
              {...bindHandlers(okTile)}
              className={clsx(
                'tile-surface relative rounded-[20px] border border-blue-400/45 bg-gradient-to-b from-[#243658] to-[#172238] shadow-[0_0_22px_rgba(59,130,246,0.2)] flex flex-col items-center justify-center gap-1 px-1.5 touch-none',
                pressedIds[okTile.id] &&
                  'tile-pressed border-blue-300/80 shadow-[0_0_24px_rgba(59,130,246,0.45)]',
                fbRing(okTile.id),
              )}
            >
              <div className="absolute top-1.5 right-1.5">
                <GesturePills tile={okTile} compact />
              </div>
              <span className="text-[15px] font-bold tracking-wide text-white">{okTile.label}</span>
              {okTile.actionSummary && (
                <span className="px-2 py-0.5 rounded-md bg-blue-400/20 border border-blue-300/20 text-[10px] text-blue-100 font-mono truncate max-w-[90px]">
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
                'tile-surface relative rounded-2xl border border-white/[0.12] bg-[#1b202d] flex flex-col items-center justify-center gap-0.5 text-zinc-100 touch-none',
                pressedIds[rightTile.id] &&
                  'tile-pressed border-blue-400/45 shadow-[0_0_16px_rgba(59,130,246,0.2)]',
                fbRing(rightTile.id),
              )}
            >
              <ChevronRight className="w-7 h-7" strokeWidth={2.3} />
              <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[84px]">
                {rightTile.actionSummary ?? '→'}
              </span>
            </button>
          )}

          {/* Row 3: Mute | DOWN | Vol- */}
          {muteTile && (
            <button
              type="button"
              {...bindHandlers(muteTile)}
              className={clsx(
                'tile-surface relative rounded-2xl border border-white/[0.08] bg-[#151922] flex flex-col items-center justify-center gap-0.5 px-1.5 touch-none',
                pressedIds[muteTile.id] && 'tile-pressed border-zinc-300/35',
                fbRing(muteTile.id),
              )}
            >
              <div className="absolute top-1.5 right-1.5">
                <GesturePills tile={muteTile} compact />
              </div>
              <VolumeX className="w-4 h-4 text-zinc-300" />
              <span className="text-xs font-medium text-zinc-200">{muteTile.label}</span>
              {muteTile.actionSummary && muteTile.actionSummary !== muteTile.label && (
                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-full">
                  {muteTile.actionSummary}
                </span>
              )}
            </button>
          )}

          {downTile && (
            <button
              type="button"
              aria-label={downTile.label}
              {...bindHandlers(downTile)}
              className={clsx(
                'tile-surface relative rounded-2xl border border-white/[0.12] bg-[#1b202d] flex flex-col items-center justify-center gap-0.5 text-zinc-100 touch-none',
                pressedIds[downTile.id] &&
                  'tile-pressed border-blue-400/45 shadow-[0_0_16px_rgba(59,130,246,0.2)]',
                fbRing(downTile.id),
              )}
            >
              <ChevronDown className="w-7 h-7" strokeWidth={2.3} />
              <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[84px]">
                {downTile.actionSummary ?? '↓'}
              </span>
            </button>
          )}

          {volDownTile && (
            <button
              type="button"
              {...bindHandlers(volDownTile)}
              className={clsx(
                'tile-surface relative rounded-2xl border border-white/[0.08] bg-[#151922] flex flex-col items-center justify-center gap-0.5 px-1.5 touch-none',
                pressedIds[volDownTile.id] && 'tile-pressed border-zinc-300/35',
                fbRing(volDownTile.id),
              )}
            >
              <div className="absolute top-1.5 right-1.5">
                <GesturePills tile={volDownTile} compact />
              </div>
              <Volume1 className="w-4 h-4 text-zinc-300" />
              <span className="text-xs font-medium text-zinc-200">{volDownTile.label}</span>
              {volDownTile.actionSummary && volDownTile.actionSummary !== volDownTile.label && (
                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-full">
                  {volDownTile.actionSummary}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Bottom 2x2 Large Blind-Touch Programmable Quick Action Keycaps */}
      {quickTiles.length > 0 && (
        <div className="grid grid-cols-2 grid-rows-2 gap-2.5 flex-[1.35] min-h-[148px]">
          {quickTiles.map((tile) => {
            const Icon = getTileIcon(tile.icon)
            const style = ACCENT_STYLES[tile.accent] ?? ACCENT_STYLES.slate
            const pressed = Boolean(pressedIds[tile.id])
            return (
              <button
                key={tile.id}
                type="button"
                {...bindHandlers(tile)}
                className={clsx(
                  'tile-surface relative min-h-[70px] px-3.5 py-2.5 rounded-[20px] border flex items-center gap-3 text-left touch-none',
                  style.card,
                  pressed && clsx('tile-pressed', style.pressedGlow),
                  fbRing(tile.id),
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
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[13.5px] font-semibold text-zinc-100 truncate">
                      {tile.label}
                    </span>
                    <GesturePills tile={tile} compact />
                  </div>
                  <div
                    className={clsx(
                      'text-[11px] font-mono truncate mt-0.5',
                      style.silkscreen,
                    )}
                  >
                    {tile.actionSummary ?? tile.subtitle ?? '桌面可配'}
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
