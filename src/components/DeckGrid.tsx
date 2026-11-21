import { useEffect, useRef, useState } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { clsx } from 'clsx'
import { TileGestureController } from '../input/tileGesture'
import type { MobileDeckPage, MobileTile } from '../protocol/types'
import { registerPendingTileRequest, useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'
import { ACCENT_STYLES, getTileIcon } from '../ui/icons'

interface DeckGridProps {
  page: MobileDeckPage
  compact?: boolean
}

export function DeckGrid({ page, compact = false }: DeckGridProps) {
  const editMode = useMobileStore((s) => s.editMode)
  const setEditingTileId = useMobileStore((s) => s.setEditingTileId)
  const tileFeedback = useMobileStore((s) => s.tileFeedback)
  const deck = useMobileStore((s) => s.deck)
  const getClient = useMobileStore((s) => s.getClient)
  const submitDeckPatch = useMobileStore((s) => s.submitDeckPatch)

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

  const handleAddTile = () => {
    const newId = `tile.custom.${Date.now().toString(36)}`
    const nextPages = deck.pages.map((p) =>
      p.id === page.id
        ? {
            ...p,
            tiles: [
              ...p.tiles,
              {
                id: newId,
                label: '新按键',
                icon: 'zap',
                accent: 'slate' as const,
                colSpan: 1 as const,
                mode: 'gesture' as const,
                hasDoubleClick: false,
                hasLongPress: false,
              },
            ],
          }
        : p,
    )
    submitDeckPatch({ pages: nextPages })
    setEditingTileId(newId)
  }

  const colClass =
    page.columns === 2 ? 'grid-cols-2' : page.columns === 4 ? 'grid-cols-4' : 'grid-cols-3'

  return (
    <div className={clsx('grid gap-2.5 w-full', colClass)}>
      {page.tiles.map((tile: MobileTile) => {
        const Icon = getTileIcon(tile.icon)
        const style = ACCENT_STYLES[tile.accent] ?? ACCENT_STYLES.slate
        const pressed = Boolean(pressedIds[tile.id])
        const fb = tileFeedback[tile.id]
        const recentFb = fb && Date.now() - fb.at < 700 ? fb.status : null

        return (
          <button
            key={tile.id}
            type="button"
            className={clsx(
              'tile-surface relative flex flex-col justify-between rounded-2xl border text-left transition-all duration-100 select-none touch-none',
              compact ? 'min-h-[76px] p-3' : 'min-h-[92px] p-3.5',
              tile.colSpan === 2 && 'col-span-2',
              style.card,
              pressed && 'tile-pressed',
              recentFb === 'ok' && 'ring-2 ring-emerald-400/70',
              recentFb === 'error' && 'ring-2 ring-rose-500/80',
              editMode && 'border-dashed border-blue-400/50',
            )}
            onPointerDown={(e) => {
              if (editMode) return
              e.currentTarget.setPointerCapture(e.pointerId)
              setPressedIds((prev) => ({ ...prev, [tile.id]: true }))
              controllerRef.current?.onDown(tile)
            }}
            onPointerUp={() => {
              if (editMode) return
              setPressedIds((prev) => ({ ...prev, [tile.id]: false }))
              controllerRef.current?.onUp(tile.id)
            }}
            onPointerCancel={() => {
              setPressedIds((prev) => ({ ...prev, [tile.id]: false }))
              controllerRef.current?.onCancel(tile.id)
            }}
            onClick={() => {
              if (editMode) {
                triggerHaptic('tap')
                setEditingTileId(tile.id)
              }
            }}
          >
            <div className="flex items-start justify-between gap-2 w-full">
              <span
                className={clsx(
                  'inline-flex items-center justify-center rounded-xl',
                  compact ? 'w-8 h-8' : 'w-9 h-9',
                  style.iconBg,
                  style.iconText,
                )}
              >
                <Icon className={compact ? 'w-4 h-4' : 'w-[18px] h-[18px]'} strokeWidth={2.1} />
              </span>

              {editMode ? (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  {tile.mode === 'hold' && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wider bg-white/10 text-zinc-300">
                      HOLD
                    </span>
                  )}
                  {tile.hasDoubleClick && (
                    <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-white/[0.08] text-zinc-400">
                      2×
                    </span>
                  )}
                  {tile.hasLongPress && (
                    <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-white/[0.08] text-zinc-400">
                      长按
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-2 min-w-0">
              <div className="text-[14px] font-semibold text-zinc-100 truncate leading-tight">
                {tile.label}
              </div>
              {(tile.actionSummary || tile.subtitle) && (
                <div className="text-[11px] text-zinc-400/90 font-mono truncate mt-0.5 leading-tight">
                  {tile.actionSummary ?? tile.subtitle}
                </div>
              )}
            </div>
          </button>
        )
      })}

      {editMode && (
        <button
          type="button"
          onClick={handleAddTile}
          className="min-h-[82px] rounded-2xl border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.05] flex flex-col items-center justify-center gap-1.5 text-zinc-400 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs font-medium">添加按键</span>
        </button>
      )}
    </div>
  )
}
