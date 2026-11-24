import { useEffect, useState } from 'react'
import { Check, Layers, Plus, Trash2, X } from 'lucide-react'
import { clsx } from 'clsx'
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
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const addPageFromTemplate = useMobileStore((s) => s.addPageFromTemplate)
  const renamePage = useMobileStore((s) => s.renamePage)
  const deletePage = useMobileStore((s) => s.deletePage)

  const isLight = effectiveTheme === 'light'
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
    <div className="ak-backdrop fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm">
      <div className="ak-sheet w-full max-w-md rounded-t-3xl border-t p-5 safe-bottom space-y-4 max-h-[86vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className={clsx('w-4 h-4', isLight ? 'text-blue-600' : 'text-blue-400')} />
            <h2 className="ak-text-1 text-base font-semibold">页面管理与新建模板</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭页面管理"
            className="ak-pill ak-text-2 w-8 h-8 rounded-full border inline-flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Page Rename & Delete */}
        <div className="ak-well p-3.5 rounded-2xl border space-y-2.5">
          <div className="ak-text-1 text-xs font-semibold">当前页面：{currentPage.name}</div>
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
              className="ak-input flex-1 h-9 px-3 rounded-xl border text-xs focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleRename}
              className="h-9 px-3 rounded-xl bg-blue-600 text-xs font-semibold text-white inline-flex items-center gap-1 shrink-0"
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
              className={clsx(
                'w-full h-9 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5',
                isLight
                  ? 'bg-rose-600/10 border-rose-500/25 text-rose-700'
                  : 'bg-rose-500/12 border-rose-400/25 text-rose-200',
              )}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除「{currentPage.name}」页面</span>
            </button>
          )}
        </div>

        {/* New Page Templates */}
        <div className="space-y-2">
          <div className="ak-text-2 text-xs font-semibold">从预设模板新建页面</div>
          <div className="grid grid-cols-1 gap-2">
            {PAGE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleCreateTemplate(tpl.id)}
                className="ak-well w-full p-3 rounded-2xl border flex items-center justify-between gap-3 text-left active:border-blue-500/50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="ak-text-1 text-xs font-bold">{tpl.title}</div>
                  <div className="ak-text-2 text-[11px] mt-0.5 leading-snug">{tpl.subtitle}</div>
                </div>
                <span
                  className={clsx(
                    'h-8 px-2.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 shrink-0',
                    isLight
                      ? 'bg-blue-600/10 border-blue-500/30 text-blue-700'
                      : 'bg-blue-500/15 border-blue-400/30 text-blue-200',
                  )}
                >
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
