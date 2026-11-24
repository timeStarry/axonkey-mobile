import { useState } from 'react'
import {
  Check,
  Gamepad2,
  LayoutGrid,
  MousePointer2,
  Plus,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { DeckZoneKind, MobileDeckPage } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'

interface LayoutEditorBarProps {
  currentPage: MobileDeckPage
}

export function LayoutEditorBar({ currentPage }: LayoutEditorBarProps) {
  const deck = useMobileStore((s) => s.deck)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const setActivePage = useMobileStore((s) => s.setActivePage)
  const setWorkspaceMode = useMobileStore((s) => s.setWorkspaceMode)
  const setLayoutEditing = useMobileStore((s) => s.setLayoutEditing)
  const setPageManagerOpen = useMobileStore((s) => s.setPageManagerOpen)
  const addTileToPage = useMobileStore((s) => s.addTileToPage)
  const addZoneToPage = useMobileStore((s) => s.addZoneToPage)
  const openTileEditor = useMobileStore((s) => s.openTileEditor)

  const isLight = effectiveTheme === 'light'
  const [zoneMenuOpen, setZoneMenuOpen] = useState(false)

  const handleSelectPage = (page: MobileDeckPage) => {
    triggerHaptic('tap')
    setActivePage(page.id)
    if (page.layout === 'remote' || page.id === 'classic-remote') {
      setWorkspaceMode('remote')
    } else {
      setWorkspaceMode('deck')
    }
  }

  const handleAddZone = (kind: DeckZoneKind) => {
    triggerHaptic('confirm')
    addZoneToPage(currentPage.id, kind)
    setZoneMenuOpen(false)
  }

  return (
    <div
      className={clsx(
        'ak-sheet shrink-0 mx-3 mt-2 p-2.5 rounded-2xl border space-y-2',
        isLight
          ? 'border-blue-500/30 shadow-[0_8px_22px_rgba(15,23,42,0.09)]'
          : 'border-blue-400/30 shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
      )}
    >
      {/* Row 1: All Page Pills + New Page / Page Settings */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1">
          {deck.pages.map((p) => {
            const active = p.id === currentPage.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPage(p)}
                className={clsx(
                  'h-7 px-2.5 rounded-full text-xs font-semibold shrink-0 transition-colors border',
                  active
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'ak-well ak-text-2',
                )}
              >
                {p.name}
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setPageManagerOpen(true)
            }}
            className={clsx(
              'h-7 px-2.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1 shrink-0',
              isLight
                ? 'bg-emerald-600/10 border-emerald-600/30 text-emerald-800'
                : 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200',
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建页</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            setPageManagerOpen(true)
          }}
          aria-label="页设置"
          className="ak-pill ak-text-2 h-7 px-2.5 rounded-full border text-[11px] font-medium inline-flex items-center gap-1 shrink-0"
        >
          <Settings2 className="w-3.5 h-3.5 ak-text-3" />
          <span>页设置</span>
        </button>
      </div>

      {/* Row 2: Add Tile | Add Zone | Done */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('confirm')
              const tile = addTileToPage(currentPage.id)
              if (tile) {
                openTileEditor(currentPage.id, '', tile.id)
              }
            }}
            className="ak-elevated ak-text-1 h-8 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Plus className={clsx('w-3.5 h-3.5', isLight ? 'text-blue-600' : 'text-blue-400')} />
            <span>加按键</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setZoneMenuOpen((v) => !v)
            }}
            className={clsx(
              'h-8 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 transition-colors',
              zoneMenuOpen
                ? isLight
                  ? 'bg-blue-600/12 border-blue-500/45 text-blue-700'
                  : 'bg-blue-500/20 border-blue-400/50 text-blue-200'
                : 'ak-elevated ak-text-1',
            )}
          >
            <Sparkles
              className={clsx('w-3.5 h-3.5', isLight ? 'text-violet-600' : 'text-violet-300')}
            />
            <span>加区块</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('confirm')
            setLayoutEditing(false)
          }}
          className="h-8 px-3.5 rounded-xl bg-blue-600 text-xs font-bold text-white inline-flex items-center gap-1 shadow-[0_2px_10px_rgba(37,99,235,0.32)] active:scale-95 transition-transform shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
          <span>完成</span>
        </button>
      </div>

      {/* Expandable Zone Type Picker */}
      {zoneMenuOpen && (
        <div className="ak-border grid grid-cols-3 gap-1.5 pt-1 border-t">
          <button
            type="button"
            onClick={() => handleAddZone('bento-grid')}
            className="ak-well ak-text-1 p-2 rounded-xl border flex flex-col items-center gap-1 text-[11px] font-semibold active:border-blue-500/50"
          >
            <LayoutGrid className={clsx('w-4 h-4', isLight ? 'text-blue-600' : 'text-blue-400')} />
            <span>Bento 网格</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddZone('pointer-pad')}
            className="ak-well ak-text-1 p-2 rounded-xl border flex flex-col items-center gap-1 text-[11px] font-semibold active:border-blue-500/50"
          >
            <MousePointer2
              className={clsx('w-4 h-4', isLight ? 'text-emerald-600' : 'text-emerald-400')}
            />
            <span>内嵌触控/飞鼠</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddZone('dpad-3x3')}
            className="ak-well ak-text-1 p-2 rounded-xl border flex flex-col items-center gap-1 text-[11px] font-semibold active:border-blue-500/50"
          >
            <Gamepad2
              className={clsx('w-4 h-4', isLight ? 'text-violet-600' : 'text-violet-400')}
            />
            <span>3×3 方向盘</span>
          </button>
        </div>
      )}

      <div className="ak-text-2 text-[10.5px] px-0.5">
        按住按键拖动排位 · 点按键右下角切换尺寸 · 单击按键改图标与配色
      </div>
    </div>
  )
}
