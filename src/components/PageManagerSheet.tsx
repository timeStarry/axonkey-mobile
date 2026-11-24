import { useEffect, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
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
    <BottomSheet
      open={open}
      onClose={() => setOpen(false)}
      title="页面管理"
      closeAriaLabel="关闭页面管理"
      testId="page-manager-sheet-backdrop"
    >
      {/* Current Page Rename & Delete */}
      <div className="ak-well p-3 rounded-[18px] border space-y-2.5">
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
            className="ak-input flex-1 h-9 px-3 rounded-[12px] border text-xs focus:outline-none"
          />
          <button
            type="button"
            onClick={handleRename}
            className="ak-primary-solid h-9 px-3 rounded-[12px] border text-xs font-semibold inline-flex items-center gap-1 shrink-0"
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
            className="w-full h-9 rounded-[12px] border border-rose-500/30 text-rose-500 text-xs font-medium inline-flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删除当前页</span>
          </button>
        )}
      </div>

      {/* Geometric Page Layouts Only */}
      <div className="space-y-1.5">
        <span className="ak-text-2 text-xs font-medium block">新建页面布局</span>
        <div className="ak-well rounded-[18px] border divide-y divide-black/[0.04] dark:divide-white/[0.05]">
          {PAGE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleCreateTemplate(tpl.id)}
              className="w-full h-11 px-3.5 flex items-center justify-between text-xs text-left active:opacity-75 transition-opacity"
            >
              <span className="ak-text-1 font-medium">{tpl.title}</span>
              <span className="ak-text-2 inline-flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>新建</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
