import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { clsx } from 'clsx'
import type { MobileTile, TileAccent } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'
import { ACCENT_KEYS, ACCENT_STYLES, getTileIcon, ICON_KEYS } from '../ui/icons'

export function DeckEditorSheet() {
  const editingTileId = useMobileStore((s) => s.editingTileId)
  const setEditingTileId = useMobileStore((s) => s.setEditingTileId)
  const deck = useMobileStore((s) => s.deck)
  const submitDeckPatch = useMobileStore((s) => s.submitDeckPatch)

  const activePage = deck.pages.find((p) => p.id === deck.activePageId) ?? deck.pages[0]
  const tile = activePage?.tiles.find((t) => t.id === editingTileId) ?? null

  const [label, setLabel] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [icon, setIcon] = useState('zap')
  const [accent, setAccent] = useState<TileAccent>('slate')
  const [colSpan, setColSpan] = useState<1 | 2>(1)

  useEffect(() => {
    if (!tile) return
    setLabel(tile.label)
    setSubtitle(tile.subtitle ?? '')
    setIcon(tile.icon)
    setAccent(tile.accent)
    setColSpan(tile.colSpan)
  }, [tile])

  if (!tile || !activePage) return null

  const handleSave = () => {
    const trimmed = label.trim()
    if (!trimmed) return
    const nextPages = deck.pages.map((p) =>
      p.id === activePage.id
        ? {
            ...p,
            tiles: p.tiles.map((t): MobileTile =>
              t.id === tile.id
                ? {
                    ...t,
                    label: trimmed,
                    subtitle: subtitle.trim() || undefined,
                    icon,
                    accent,
                    colSpan,
                  }
                : t,
            ),
          }
        : p,
    )
    triggerHaptic('confirm')
    submitDeckPatch({ pages: nextPages })
    setEditingTileId(null)
  }

  const handleDelete = () => {
    const nextPages = deck.pages.map((p) =>
      p.id === activePage.id
        ? { ...p, tiles: p.tiles.filter((t) => t.id !== tile.id) }
        : p,
    )
    triggerHaptic('heavy')
    submitDeckPatch({ pages: nextPages })
    setEditingTileId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-[#141821] border-t border-white/10 p-5 safe-bottom space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">自定义按键外观</h2>
          <button
            type="button"
            onClick={() => setEditingTileId(null)}
            className="w-8 h-8 rounded-full bg-white/[0.06] inline-flex items-center justify-center text-zinc-400"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={20}
            placeholder="按键名称"
            className="h-10 px-3 rounded-xl bg-[#0d1017] border border-white/10 text-sm text-zinc-100 focus:outline-none focus:border-blue-400/60"
          />
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={20}
            placeholder="副标题（可选）"
            className="h-10 px-3 rounded-xl bg-[#0d1017] border border-white/10 text-sm text-zinc-100 focus:outline-none focus:border-blue-400/60"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {ACCENT_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setAccent(key)}
                aria-label={ACCENT_STYLES[key].label}
                className={clsx(
                  'w-7 h-7 rounded-full transition-transform',
                  ACCENT_STYLES[key].swatch,
                  accent === key ? 'ring-2 ring-white scale-110' : 'opacity-65',
                )}
              />
            ))}
          </div>

          <div className="inline-flex rounded-xl bg-[#0d1017] p-0.5 border border-white/10">
            {([1, 2] as const).map((span) => (
              <button
                key={span}
                type="button"
                onClick={() => setColSpan(span)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg text-xs font-medium',
                  colSpan === span ? 'bg-blue-500 text-white' : 'text-zinc-400',
                )}
              >
                {span === 1 ? '1×1' : '2×1'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {ICON_KEYS.map((key) => {
            const Icon = getTileIcon(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                className={clsx(
                  'h-10 rounded-xl inline-flex items-center justify-center border transition-colors',
                  icon === key
                    ? 'bg-blue-500/25 border-blue-400 text-blue-200'
                    : 'bg-[#0d1017] border-white/[0.06] text-zinc-400',
                )}
              >
                <Icon className="w-4 h-4" />
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleDelete}
            className="h-11 px-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 h-11 rounded-xl bg-blue-500 text-white text-sm font-semibold active:scale-[0.98]"
          >
            保存并同步桌面
          </button>
        </div>
      </div>
    </div>
  )
}
