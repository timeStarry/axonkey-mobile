import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { TileGestureController } from '../input/tileGesture'
import type { MobileDeckPage, MobileTile, TileGestureKind } from '../protocol/types'
import { registerPendingTileRequest, useMobileStore } from '../state/useMobileStore'
import { triggerHaptic, type HapticKind } from '../transport/nativeBridge'
import { ACCENT_STYLES, getTileIcon } from '../ui/icons'

interface DeckGridProps {
  page: MobileDeckPage
  compact?: boolean
}

function resolveDeckHaptic(tile: MobileTile | undefined, gesture: TileGestureKind): HapticKind {
  if (gesture === 'long') return 'heavy'
  if (gesture === 'double') return 'confirm'
  if (tile?.accent === 'rose') return 'heavy'
  if (tile?.accent === 'emerald' || tile?.icon === 'enter' || tile?.icon === 'check') {
    return 'confirm'
  }
  return 'tap'
}

export function DeckGrid({ page, compact = false }: DeckGridProps) {
  const tileFeedback = useMobileStore((s) => s.tileFeedback)
  const deck = useMobileStore((s) => s.deck)
  const getClient = useMobileStore((s) => s.getClient)

  const [pressedIds, setPressedIds] = useState<Record<string, boolean>>({})
  const tilesRef = useRef<Map<string, MobileTile>>(new Map())
  tilesRef.current = new Map(page.tiles.map((t) => [t.id, t]))

  const controllerRef = useRef<TileGestureController | null>(null)

  if (!controllerRef.current) {
    controllerRef.current = new TileGestureController(
      {
        onActivate: (tileId, gesture) => {
          triggerHaptic(resolveDeckHaptic(tilesRef.current.get(tileId), gesture))
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

  const colClass =
    page.columns === 2 ? 'grid-cols-2' : page.columns === 4 ? 'grid-cols-4' : 'grid-cols-3'

  return (
    <div className={clsx('grid gap-2.5 w-full pb-1', colClass)}>
      {page.tiles.map((tile: MobileTile) => {
        const Icon = getTileIcon(tile.icon)
        const style = ACCENT_STYLES[tile.accent] ?? ACCENT_STYLES.slate
        const pressed = Boolean(pressedIds[tile.id])
        const fb = tileFeedback[tile.id]
        const recentFb = fb && Date.now() - fb.at < 650 ? fb.status : null

        return (
          <button
            key={tile.id}
            type="button"
            className={clsx(
              'tile-surface relative flex flex-col justify-between rounded-2xl border text-left select-none touch-none',
              compact ? 'min-h-[84px] p-3' : 'min-h-[108px] p-3.5',
              tile.colSpan === 2 && 'col-span-2',
              style.card,
              pressed && clsx('tile-pressed', style.pressedGlow),
              recentFb === 'ok' && 'ring-1 ring-emerald-400/75',
              recentFb === 'error' && 'ring-2 ring-rose-500/80',
            )}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setPressedIds((prev) => ({ ...prev, [tile.id]: true }))
              controllerRef.current?.onDown(tile)
            }}
            onPointerUp={() => {
              setPressedIds((prev) => ({ ...prev, [tile.id]: false }))
              controllerRef.current?.onUp(tile.id)
            }}
            onPointerCancel={() => {
              setPressedIds((prev) => ({ ...prev, [tile.id]: false }))
              controllerRef.current?.onCancel(tile.id)
            }}
          >
            <div className="flex items-start justify-between gap-1.5 w-full">
              <span
                className={clsx(
                  'inline-flex items-center justify-center rounded-xl shrink-0',
                  compact ? 'w-8 h-8' : 'w-9 h-9',
                  style.iconBg,
                  style.iconText,
                )}
              >
                <Icon className={compact ? 'w-4 h-4' : 'w-[18px] h-[18px]'} strokeWidth={2.1} />
              </span>

              <div className="flex items-center gap-1 flex-wrap justify-end">
                {tile.mode === 'hold' && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wider bg-white/[0.1] text-zinc-200">
                    HOLD
                  </span>
                )}
                {tile.hasDoubleClick && (
                  <span className="px-1 py-0.5 rounded text-[9px] font-mono font-medium bg-white/[0.08] text-zinc-400">
                    2×
                  </span>
                )}
                {tile.hasLongPress && (
                  <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-white/[0.08] text-zinc-400">
                    长按
                  </span>
                )}
              </div>
            </div>

            <div className="mt-2.5 min-w-0">
              <div className="text-[13.5px] font-semibold text-zinc-100 truncate leading-tight">
                {tile.label}
              </div>
              <div
                className={clsx(
                  'text-[10.5px] font-mono truncate mt-0.5 leading-tight',
                  style.silkscreen,
                )}
              >
                {tile.actionSummary ?? tile.subtitle ?? '桌面端配置动作'}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
