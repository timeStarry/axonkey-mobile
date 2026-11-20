import { useEffect } from 'react'
import { Check, LayoutGrid, MousePointer2, Pencil, Rows2, Wifi } from 'lucide-react'
import { clsx } from 'clsx'
import { DeckEditorSheet } from './components/DeckEditorSheet'
import { DeckGrid } from './components/DeckGrid'
import { PairingSheet } from './components/PairingSheet'
import { QuickTextBar } from './components/QuickTextBar'
import { TrackpadSurface } from './components/TrackpadSurface'
import { useMobileStore, type ViewMode } from './state/useMobileStore'
import { triggerHaptic } from './transport/nativeBridge'

export function App() {
  const init = useMobileStore((s) => s.init)
  const phase = useMobileStore((s) => s.phase)
  const hostName = useMobileStore((s) => s.hostName)
  const context = useMobileStore((s) => s.context)
  const deck = useMobileStore((s) => s.deck)
  const viewMode = useMobileStore((s) => s.viewMode)
  const editMode = useMobileStore((s) => s.editMode)
  const conflictBanner = useMobileStore((s) => s.conflictBanner)
  const errorToast = useMobileStore((s) => s.errorToast)

  const setViewMode = useMobileStore((s) => s.setViewMode)
  const setActivePage = useMobileStore((s) => s.setActivePage)
  const setEditMode = useMobileStore((s) => s.setEditMode)
  const setPairingOpen = useMobileStore((s) => s.setPairingOpen)
  const dismissConflict = useMobileStore((s) => s.dismissConflict)
  const clearError = useMobileStore((s) => s.clearError)

  useEffect(() => {
    init()
  }, [init])

  const activePage = deck.pages.find((p) => p.id === deck.activePageId) ?? deck.pages[0]

  const statusDotClass =
    phase === 'active'
      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]'
      : phase === 'authenticating' || phase === 'synchronizing'
        ? 'bg-amber-400 animate-pulse'
        : phase === 'closed'
          ? 'bg-rose-400'
          : 'bg-zinc-500'

  const modeItems: { id: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
    { id: 'deck', icon: LayoutGrid, label: '面板' },
    { id: 'split', icon: Rows2, label: '分屏' },
    { id: 'trackpad', icon: MousePointer2, label: '触控' },
  ]

  return (
    <div className="h-full w-full flex flex-col bg-[#0d0f14] text-zinc-100 overflow-hidden">
      {/* Compact Top Status Header */}
      <header className="shrink-0 flex items-center justify-between gap-2 px-3 pb-2 safe-top border-b border-white/[0.06] bg-[#10131a]/90 backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            setPairingOpen(true)
          }}
          className="flex items-center gap-2 min-w-0 py-1 px-2 rounded-xl bg-white/[0.04] border border-white/[0.07]"
        >
          <span className={clsx('w-2 h-2 rounded-full shrink-0', statusDotClass)} />
          <span className="text-xs font-semibold text-zinc-100 truncate max-w-[110px]">
            {hostName}
          </span>
          {context.appName && (
            <span className="px-1.5 py-0.5 rounded-md bg-blue-500/20 text-[10px] font-medium text-blue-300 truncate max-w-[84px]">
              {context.appName}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex items-center rounded-xl bg-white/[0.04] border border-white/[0.07] p-0.5">
            {modeItems.map((item) => {
              const Icon = item.icon
              const active = viewMode === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap')
                    setViewMode(item.id)
                  }}
                  aria-label={item.label}
                  className={clsx(
                    'h-7 px-2 rounded-lg inline-flex items-center justify-center transition-colors',
                    active ? 'bg-white/[0.12] text-zinc-100' : 'text-zinc-400',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setEditMode(!editMode)
            }}
            aria-label={editMode ? '完成编辑' : '编辑面板'}
            className={clsx(
              'h-8 w-8 rounded-xl inline-flex items-center justify-center border transition-colors',
              editMode
                ? 'bg-blue-500 border-blue-400 text-white'
                : 'bg-white/[0.04] border-white/[0.07] text-zinc-300',
            )}
          >
            {editMode ? <Check className="w-4 h-4" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setPairingOpen(true)
            }}
            aria-label="连接设置"
            className="h-8 w-8 rounded-xl bg-white/[0.04] border border-white/[0.07] inline-flex items-center justify-center text-zinc-300"
          >
            <Wifi className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Conflict / Error Banners */}
      {conflictBanner && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-between gap-2 text-xs text-amber-200">
          <span className="truncate">{conflictBanner}</span>
          <button type="button" onClick={dismissConflict} className="shrink-0 underline">
            知道了
          </button>
        </div>
      )}
      {errorToast && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-400/30 flex items-center justify-between gap-2 text-xs text-rose-200">
          <span className="truncate">{errorToast}</span>
          <button type="button" onClick={clearError} className="shrink-0 underline">
            关闭
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 min-h-0 flex flex-col px-3 py-2.5 gap-2.5 overflow-hidden">
        {viewMode !== 'trackpad' && (
          <div
            className={clsx(
              'flex flex-col gap-2 min-h-0',
              viewMode === 'deck' ? 'flex-1' : 'flex-[1.15]',
            )}
          >
            {/* Page Switcher */}
            {deck.pages.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto shrink-0 no-scrollbar">
                {deck.pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap')
                      setActivePage(p.id)
                    }}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-colors',
                      p.id === activePage?.id
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'bg-white/[0.05] text-zinc-400',
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
              {activePage && <DeckGrid page={activePage} compact={viewMode === 'split'} />}
            </div>
          </div>
        )}

        {viewMode !== 'deck' && (
          <div className={clsx('min-h-0', viewMode === 'trackpad' ? 'flex-1' : 'flex-[0.85]')}>
            <TrackpadSurface />
          </div>
        )}
      </main>

      {/* Bottom Thumb-Zone Quick Text / Voice Bar */}
      <QuickTextBar />

      {/* Sheets */}
      <PairingSheet />
      <DeckEditorSheet />
    </div>
  )
}
