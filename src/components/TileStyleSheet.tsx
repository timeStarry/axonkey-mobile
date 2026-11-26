import { Check, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { BottomSheet } from './BottomSheet'
import { BENTO_SPAN_OPTIONS, clampSpan, normalizePageZones } from '../input/bentoLayout'
import type { TileMode } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'
import { ACCENT_KEYS, ICON_KEYS, getAccentStyle, getIconLabelZh, getTileIcon } from '../ui/icons'

export function TileStyleSheet() {
  const target = useMobileStore((s) => s.editingTileTarget)
  const deck = useMobileStore((s) => s.deck)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const closeTileEditor = useMobileStore((s) => s.closeTileEditor)
  const updateTile = useMobileStore((s) => s.updateTile)
  const deleteTile = useMobileStore((s) => s.deleteTile)

  const isLight = effectiveTheme === 'light'

  const page = target ? deck.pages.find((p) => p.id === target.pageId) : undefined
  const tile = page && target ? page.tiles.find((t) => t.id === target.tileId) : undefined
  const open = Boolean(target && page && tile)

  if (!open || !page || !tile) return null

  const zones = normalizePageZones(page)
  const zone =
    zones.find((z) => z.id === target?.zoneId) ??
    zones.find((z) => z.tileIds.includes(tile.id))
  const isBentoTile = !zone || zone.kind === 'bento-grid'

  const curColSpan = clampSpan(tile.colSpan)
  const curRowSpan = clampSpan(tile.rowSpan)

  const handleModeChange = (mode: TileMode) => {
    if (tile.mode === mode) return
    triggerHaptic('tap')
    updateTile(page.id, tile.id, { mode })
  }

  return (
    <BottomSheet
      open={open}
      onClose={closeTileEditor}
      title="编辑按键"
      closeAriaLabel="关闭样式面板"
      testId="tile-style-sheet-backdrop"
    >
      {/* Crisp 1-line PC Binding Readout */}
      <div className="ak-well px-3 py-2 rounded-[14px] border flex items-center justify-between gap-2 text-xs">
        <span className="ak-text-2 shrink-0">电脑端绑定</span>
        <span className="ak-text-1 font-mono truncate">
          {tile.actionSummary || '未绑定'}
        </span>
      </div>

      {/* Name Input */}
      <div className="flex items-center justify-between gap-3">
        <span className="ak-text-2 text-xs font-medium shrink-0">名称</span>
        <input
          type="text"
          aria-label="按键名称"
          value={tile.label}
          maxLength={24}
          placeholder="按键名称"
          onChange={(e) => updateTile(page.id, tile.id, { label: e.target.value })}
          className="ak-input flex-1 h-9 px-3 rounded-[14px] border text-xs focus:outline-none"
        />
      </div>

      {/* Bento Span Picker */}
      {isBentoTile && (
        <div className="space-y-1.5">
          <span className="ak-text-2 text-xs font-medium block">尺寸</span>
          <div className="grid grid-cols-4 gap-1.5">
            {BENTO_SPAN_OPTIONS.map((opt) => {
              const selected = opt.colSpan === curColSpan && opt.rowSpan === curRowSpan
              return (
                <button
                  key={opt.label}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`尺寸 ${opt.colSpan}乘${opt.rowSpan}`}
                  onClick={() => {
                    triggerHaptic('tap')
                    updateTile(page.id, tile.id, {
                      colSpan: opt.colSpan,
                      rowSpan: opt.rowSpan,
                    })
                  }}
                  className={clsx(
                    'h-9 rounded-[12px] border text-xs font-mono font-medium transition-colors',
                    selected ? 'ak-primary-solid' : 'ak-well ak-text-2',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Trigger Mode */}
      <div className="space-y-1.5">
        <span className="ak-text-2 text-xs font-medium block">触发方式</span>
        <div className="ak-seg grid grid-cols-2 gap-1 p-0.5 rounded-[14px] border">
          <button
            type="button"
            aria-pressed={tile.mode === 'gesture'}
            onClick={() => handleModeChange('gesture')}
            className={clsx(
              'h-8 rounded-[11px] text-xs font-medium transition-colors',
              tile.mode === 'gesture' ? 'ak-elevated-alt border' : 'ak-text-2',
            )}
          >
            轻点 / 双击 / 长按
          </button>
          <button
            type="button"
            aria-pressed={tile.mode === 'hold'}
            onClick={() => handleModeChange('hold')}
            className={clsx(
              'h-8 rounded-[11px] text-xs font-medium transition-colors',
              tile.mode === 'hold' ? 'ak-elevated-alt border' : 'ak-text-2',
            )}
          >
            持续按住 Hold
          </button>
        </div>
      </div>

      {/* Icon Semantic Color */}
      <div className="space-y-1.5">
        <span className="ak-text-2 text-xs font-medium block">图标色彩</span>
        <div className="grid grid-cols-6 gap-1.5">
          {ACCENT_KEYS.map((acc) => {
            const st = getAccentStyle(acc, isLight)
            const active = tile.accent === acc
            return (
              <button
                key={acc}
                type="button"
                aria-pressed={active}
                aria-label={`颜色：${st.label}`}
                onClick={() => {
                  triggerHaptic('tap')
                  updateTile(page.id, tile.id, { accent: acc })
                }}
                className={clsx(
                  'py-2 rounded-[12px] border flex flex-col items-center gap-1 transition-all',
                  active
                    ? isLight
                      ? 'bg-black/[0.06] border-[#1c1c1e]'
                      : 'bg-white/[0.08] border-[#f2f2f7]'
                    : 'ak-well ak-text-2',
                )}
              >
                <span className={clsx('w-3 h-3 rounded-full', st.swatch)} />
                <span className="text-[10px]">{st.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Icon Picker */}
      <div className="space-y-1.5">
        <span className="ak-text-2 text-xs font-medium block">图标</span>
        <div className="ak-well grid grid-cols-7 gap-1.5 p-2 rounded-[16px] border max-h-[148px] overflow-y-auto">
          {ICON_KEYS.map((iconKey) => {
            const IconComp = getTileIcon(iconKey)
            const selected = tile.icon === iconKey
            return (
              <button
                key={iconKey}
                type="button"
                aria-pressed={selected}
                aria-label={`图标：${getIconLabelZh(iconKey)}`}
                onClick={() => {
                  triggerHaptic('tap')
                  updateTile(page.id, tile.id, { icon: iconKey })
                }}
                className={clsx(
                  'h-9 rounded-[11px] inline-flex items-center justify-center border transition-colors',
                  selected
                    ? 'ak-primary-solid'
                    : 'ak-elevated border-transparent ak-text-2',
                )}
              >
                <IconComp className="w-4 h-4" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('heavy')
            deleteTile(page.id, tile.id)
          }}
          className="h-10 px-3.5 rounded-[14px] border border-rose-500/30 text-rose-500 text-xs font-medium inline-flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>删除</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('confirm')
            closeTileEditor()
          }}
          className="ak-primary-solid h-10 px-5 rounded-[14px] border text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          <span>完成</span>
        </button>
      </div>
    </BottomSheet>
  )
}
