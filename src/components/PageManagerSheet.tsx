import { useEffect, useState } from 'react'
import { Check, Layers, Plus, Trash2, X } from 'lucide-react'
import { PAGE_TEMPLATES, type PageTemplateId } from '../input/bentoLayout'
import type { MobileDeckPage } from '../protocol/types'
import { useMobileStore } from '../state/useMobileStore'
import { triggerHaptic } from '../transport/nativeBridge'

interface PageManagerSheetProps {
  currentPage: MobileDeckPage
}

export function PageManagerSheet({ currentPage }: PageManagerSheetProps) {
  const open = useMobileStore((s) => s.pageManagerOpen)
  const setOpen = useMobileStore((s) => s.setPageManagerOpen)
  const deck = useMobileStore((s) => s.deck)
  const addPageFromTemplate = useMobileStore((s) => s.addPageFromTemplate)
  const renamePage = useMobileStore((s) => s.renamePage)
  const deletePage = useMobileStore((s) => s.deletePage)

  const [nameDraft, setNameDraft] = useState(currentPage.name)

  useEffect(() => {
    setNameDraft(currentPage.name)
  }, [currentPage.id, currentPage.name, open])

  if (!open) return null

  const handleRename = () => {
    const cleaned = nameDraft.trim().slice(0, 24)
    if (!cleaned) return
    renamePage(currentPage.id, cleaned)
    triggerHaptic('confirm')
  }

  const handleCreateTemplate = (tplId: PageTemplateId) => {
    triggerHaptic('confirm')
    addPageFromTemplate(tplId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-[#121620] border-t border-white/[0.1] p-5 safe-bottom space-y-4 max-h-[86vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h2 className="text-base font-semibold text-zinc-100">页面管理与新建模板</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭页面管理"
            className="w-8 h-8 rounded-full bg-white/[0.06] inline-flex items-center justify-center text-zinc-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Page Rename & Delete */}
        <div className="p-3.5 rounded-2xl bg-[#0d1018] border border-white/[0.07] space-y-2.5">
          <div className="text-xs font-semibold text-zinc-200">
            当前页面：{currentPage.name}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameDraft}
              maxLength={24}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
              }}
              placeholder="页面名称"
              className="flex-1 h-9 px-3 rounded-xl bg-[#141926] border border-white/[0.1] text-xs text-zinc-100 focus:outline-none focus:border-blue-400/60"
            />
            <button
              type="button"
              onClick={handleRename}
              className="h-9 px-3 rounded-xl bg-blue-500 text-xs font-semibold text-white inline-flex items-center gap-1 shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              <span>改名</span>
            </button>
          </div>

          {deck.pages.length > 1 && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('heavy')
                deletePage(currentPage.id)
                setOpen(false)
              }}
              className="w-full h-9 rounded-xl bg-rose-500/12 border border-rose-400/25 text-xs font-semibold text-rose-200 inline-flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除「{currentPage.name}」页面</span>
            </button>
          )}
        </div>

        {/* New Page Templates */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-zinc-300">从预设模板新建页面</div>
          <div className="grid grid-cols-1 gap-2">
            {PAGE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleCreateTemplate(tpl.id)}
                className="w-full p-3 rounded-2xl bg-[#0d1018] border border-white/[0.08] flex items-center justify-between gap-3 text-left active:border-blue-400/50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-zinc-100">{tpl.title}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    {tpl.subtitle}
                  </div>
                </div>
                <span className="h-8 px-2.5 rounded-xl bg-blue-500/15 border border-blue-400/30 text-xs font-semibold text-blue-200 inline-flex items-center gap-1 shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                  <span>新建</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
