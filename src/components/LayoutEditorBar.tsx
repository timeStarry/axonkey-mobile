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
  const setActivePage = useMobileStore((s) => s.setActivePage)
  const setWorkspaceMode = useMobileStore((s) => s.setWorkspaceMode)
  const setLayoutEditing = useMobileStore((s) => s.setLayoutEditing)
  const setPageManagerOpen = useMobileStore((s) => s.setPageManagerOpen)
  const addTileToPage = useMobileStore((s) => s.addTileToPage)
  const addZoneToPage = useMobileStore((s) => s.addZoneToPage)
  const openTileEditor = useMobileStore((s) => s.openTileEditor)

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
    <div className="shrink-0 mx-3 mt-2 p-2.5 rounded-2xl bg-[#121723] border border-blue-400/30 shadow-[0_8px_24px_rgba(0,0,0,0.45)] space-y-2">
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
                    ? 'bg-blue-500 text-white border-blue-400'
                    : 'bg-[#0d1018] text-zinc-400 border-white/[0.08]',
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
            className="h-7 px-2.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-xs font-semibold text-emerald-200 inline-flex items-center gap-1 shrink-0"
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
          className="h-7 px-2.5 rounded-full bg-white/[0.05] border border-white/[0.1] text-[11px] font-medium text-zinc-300 inline-flex items-center gap-1 shrink-0"
        >
          <Settings2 className="w-3.5 h-3.5 text-zinc-400" />
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
            className="h-8 px-3 rounded-xl bg-white/[0.06] border border-white/[0.11] text-xs font-semibold text-zinc-100 inline-flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
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
                ? 'bg-blue-500/20 border-blue-400/50 text-blue-200'
                : 'bg-white/[0.06] border-white/[0.11] text-zinc-100',
            )}
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-300" />
            <span>加区块</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('confirm')
            setLayoutEditing(false)
          }}
          className="h-8 px-3.5 rounded-xl bg-blue-500 text-xs font-bold text-white inline-flex items-center gap-1 shadow-[0_2px_10px_rgba(59,130,246,0.4)] active:scale-95 transition-transform shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
          <span>完成</span>
        </button>
      </div>

      {/* Expandable Zone Type Picker */}
      {zoneMenuOpen && (
        <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/[0.07]">
          <button
            type="button"
            onClick={() => handleAddZone('bento-grid')}
            className="p-2 rounded-xl bg-[#0d1018] border border-white/[0.08] flex flex-col items-center gap-1 text-[11px] font-semibold text-zinc-200 active:border-blue-400/50"
          >
            <LayoutGrid className="w-4 h-4 text-blue-400" />
            <span>Bento 网格</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddZone('pointer-pad')}
            className="p-2 rounded-xl bg-[#0d1018] border border-white/[0.08] flex flex-col items-center gap-1 text-[11px] font-semibold text-zinc-200 active:border-blue-400/50"
          >
            <MousePointer2 className="w-4 h-4 text-emerald-400" />
            <span>内嵌触控板</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddZone('dpad-3x3')}
            className="p-2 rounded-xl bg-[#0d1018] border border-white/[0.08] flex flex-col items-center gap-1 text-[11px] font-semibold text-zinc-200 active:border-blue-400/50"
          >
            <Gamepad2 className="w-4 h-4 text-violet-400" />
            <span>3×3 方向盘</span>
          </button>
        </div>
      )}

      <div className="text-[10.5px] text-zinc-400 px-0.5">
        按住按键拖动排位 · 点按键右下角切换尺寸 · 单击按键改图标与配色
      </div>
    </div>
  )
}
