import { Check, Monitor, Palette, Trash2, X } from 'lucide-react'
import { clsx } from 'clsx'
import { BENTO_SPAN_OPTIONS, clampSpan, normalizePageZones } from '../input/bentoLayout'
import type { TileMode } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'
import { ACCENT_KEYS, ACCENT_STYLES, ICON_KEYS, getTileIcon } from '../ui/icons'

export function TileStyleSheet() {
  const target = useMobileStore((s) => s.editingTileTarget)
  const deck = useMobileStore((s) => s.deck)
  const closeTileEditor = useMobileStore((s) => s.closeTileEditor)
  const updateTile = useMobileStore((s) => s.updateTile)
  const deleteTile = useMobileStore((s) => s.deleteTile)

  if (!target) return null

  const page = deck.pages.find((p) => p.id === target.pageId)
  const tile = page?.tiles.find((t) => t.id === target.tileId)
  if (!page || !tile) return null

  const zones = normalizePageZones(page)
  const zone =
    zones.find((z) => z.id === target.zoneId) ??
    zones.find((z) => z.tileIds.includes(tile.id))
  const isBentoTile = !zone || zone.kind === 'bento-grid'

  const curColSpan = clampSpan(tile.colSpan)
  const curRowSpan = clampSpan(tile.rowSpan)
  const activeStyle = ACCENT_STYLES[tile.accent] ?? ACCENT_STYLES.slate
  const PreviewIcon = getTileIcon(tile.icon)

  const handleModeChange = (mode: TileMode) => {
    if (tile.mode === mode) return
    triggerHaptic('tap')
    updateTile(page.id, tile.id, { mode })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-[#121620] border-t border-white/[0.1] p-4 safe-bottom space-y-3.5 max-h-[88vh] overflow-y-auto">
        {/* Header with Live Keycap Preview */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={clsx(
                'w-9 h-9 rounded-xl border inline-flex items-center justify-center shrink-0',
                activeStyle.card,
                activeStyle.iconText,
              )}
            >
              <PreviewIcon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <h2 className="text-sm font-bold text-zinc-100 truncate">按键样式与模式</h2>
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                {page.name} · {tile.label}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={closeTileEditor}
            aria-label="关闭样式面板"
            className="w-8 h-8 rounded-full bg-white/[0.06] inline-flex items-center justify-center text-zinc-400 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Read-only PC Binding Status Banner */}
        <div className="px-3 py-2.5 rounded-2xl bg-blue-500/10 border border-blue-400/25 flex items-start gap-2">
          <Monitor className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-zinc-200 leading-snug">
            电脑端当前绑定：
            <span className="font-mono font-semibold text-blue-200">
              {tile.actionSummary ?? '未绑定 — 请在电脑端右侧泳道配置'}
            </span>
          </div>
        </div>

        {/* Bento Span Picker (1x1 | 2x1 | 1x2 | 2x2) */}
        {isBentoTile && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-zinc-300">按键尺寸 (Bento 混排)</div>
            <div className="grid grid-cols-4 gap-1.5">
              {BENTO_SPAN_OPTIONS.map((opt) => {
                const selected = opt.colSpan === curColSpan && opt.rowSpan === curRowSpan
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap')
                      updateTile(page.id, tile.id, {
                        colSpan: opt.colSpan,
                        rowSpan: opt.rowSpan,
                      })
                    }}
                    className={clsx(
                      'p-2 rounded-xl border flex flex-col items-center gap-0.5 transition-colors',
                      selected
                        ? 'bg-blue-500/20 border-blue-400 text-white shadow-sm'
                        : 'bg-[#0d1018] border-white/[0.08] text-zinc-400',
                    )}
                  >
                    <span className="text-xs font-mono font-bold">{opt.label}</span>
                    <span className="text-[10px] opacity-85">{opt.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Label & Subtitle Inputs */}
        <div className="grid grid-cols-2 gap-2.5">
          <label className="space-y-1 block">
            <span className="text-xs font-semibold text-zinc-300">主标题</span>
            <input
              type="text"
              value={tile.label}
              maxLength={24}
              placeholder="按键名称"
              onChange={(e) => updateTile(page.id, tile.id, { label: e.target.value })}
              className="w-full h-9 px-3 rounded-xl bg-[#0d1018] border border-white/[0.1] text-xs text-zinc-100 focus:outline-none focus:border-blue-400/60"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-xs font-semibold text-zinc-300">副标备注 (丝印)</span>
            <input
              type="text"
              value={tile.subtitle ?? ''}
              maxLength={28}
              placeholder="未绑定时显示"
              onChange={(e) =>
                updateTile(page.id, tile.id, {
                  subtitle: e.target.value || undefined,
                })
              }
              className="w-full h-9 px-3 rounded-xl bg-[#0d1018] border border-white/[0.1] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-400/60"
            />
          </label>
        </div>

        {/* 6 Anodized Accents */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-zinc-300">阳极氧化色系</div>
          <div className="grid grid-cols-6 gap-1.5">
            {ACCENT_KEYS.map((acc) => {
              const st = ACCENT_STYLES[acc]
              const active = tile.accent === acc
              return (
                <button
                  key={acc}
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap')
                    updateTile(page.id, tile.id, { accent: acc })
                  }}
                  className={clsx(
                    'p-1.5 rounded-xl border flex flex-col items-center gap-1 transition-all',
                    active
                      ? 'bg-white/[0.09] border-white/50 text-white'
                      : 'bg-[#0d1018] border-white/[0.07] text-zinc-400',
                  )}
                >
                  <span className={clsx('w-4 h-4 rounded-full', st.swatch)} />
                  <span className="text-[10px] font-medium">{st.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Trigger Mode: Gesture vs Hold */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-zinc-300">触发模式</div>
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#0d1018] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => handleModeChange('gesture')}
              className={clsx(
                'h-8 rounded-xl text-xs font-semibold transition-colors',
                tile.mode === 'gesture' ? 'bg-blue-500 text-white' : 'text-zinc-400',
              )}
            >
              单击/双击/长按手势
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('hold')}
              className={clsx(
                'h-8 rounded-xl text-xs font-semibold transition-colors',
                tile.mode === 'hold' ? 'bg-blue-500 text-white' : 'text-zinc-400',
              )}
            >
              持续按住 Hold
            </button>
          </div>
        </div>

        {/* 18+ Icon Picker Grid */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-zinc-300">按键图标</div>
          <div className="grid grid-cols-7 gap-1.5 p-2 rounded-2xl bg-[#0d1018] border border-white/[0.07] max-h-[156px] overflow-y-auto">
            {ICON_KEYS.map((iconKey) => {
              const IconComp = getTileIcon(iconKey)
              const selected = tile.icon === iconKey
              return (
                <button
                  key={iconKey}
                  type="button"
                  aria-label={`图标 ${iconKey}`}
                  onClick={() => {
                    triggerHaptic('tap')
                    updateTile(page.id, tile.id, { icon: iconKey })
                  }}
                  className={clsx(
                    'h-9 rounded-xl inline-flex items-center justify-center border transition-colors',
                    selected
                      ? 'bg-blue-500/25 border-blue-400 text-blue-200'
                      : 'bg-white/[0.03] border-transparent text-zinc-300 active:bg-white/[0.08]',
                  )}
                >
                  <IconComp className="w-4 h-4" />
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer Actions: Delete Tile & Done */}
        <div className="flex items-center justify-between gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('heavy')
              deleteTile(page.id, tile.id)
            }}
            className="h-10 px-3.5 rounded-xl bg-rose-500/15 border border-rose-400/30 text-xs font-semibold text-rose-200 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除按键</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('confirm')
              closeTileEditor()
            }}
            className="h-10 px-5 rounded-xl bg-blue-500 text-xs font-bold text-white inline-flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>完成设置</span>
          </button>
        </div>
      </div>
    </div>
  )
}
