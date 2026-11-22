import { useEffect } from 'react'
import {
  Gamepad2,
  LayoutGrid,
  MousePointer2,
  QrCode,
  RefreshCw,
  SlidersHorizontal,
  Wifi,
} from 'lucide-react'
import { clsx } from 'clsx'
import { ClassicRemoteView } from './components/ClassicRemoteView'
import { DeckGrid } from './components/DeckGrid'
import { LocalFeelSheet } from './components/LocalFeelSheet'
import { PairingSheet } from './components/PairingSheet'
import { TrackpadSurface } from './components/TrackpadSurface'
import { VoiceTextDock } from './components/VoiceTextDock'
import { useMobileStore, type WorkspaceMode } from './state/useMobileStore'
import { DEFAULT_DEMO_DECK } from './transport/defaultDeck'
import { triggerHaptic } from './transport/nativeBridge'

export function App() {
  const init = useMobileStore((s) => s.init)
  const phase = useMobileStore((s) => s.phase)
  const isDemoMode = useMobileStore((s) => s.isDemoMode)
  const hostName = useMobileStore((s) => s.hostName)
  const savedHosts = useMobileStore((s) => s.savedHosts)
  const discoveringLan = useMobileStore((s) => s.discoveringLan)
  const context = useMobileStore((s) => s.context)
  const deck = useMobileStore((s) => s.deck)
  const workspaceMode = useMobileStore((s) => s.workspaceMode)
  const conflictBanner = useMobileStore((s) => s.conflictBanner)
  const errorToast = useMobileStore((s) => s.errorToast)

  const setWorkspaceMode = useMobileStore((s) => s.setWorkspaceMode)
  const setActivePage = useMobileStore((s) => s.setActivePage)
  const setPairingOpen = useMobileStore((s) => s.setPairingOpen)
  const setFeelSheetOpen = useMobileStore((s) => s.setFeelSheetOpen)
  const discoverAndReconnect = useMobileStore((s) => s.discoverAndReconnect)
  const dismissConflict = useMobileStore((s) => s.dismissConflict)
  const clearError = useMobileStore((s) => s.clearError)

  useEffect(() => {
    init()
  }, [init])

  // Resolve Remote page vs Quick Deck pages cleanly
  const remotePage =
    deck.pages.find((p) => p.layout === 'remote' || p.id === 'classic-remote') ??
    DEFAULT_DEMO_DECK.pages[0]

  const gridPages = deck.pages.filter((p) => p.layout !== 'remote' && p.id !== 'classic-remote')
  const deckSelectablePages = gridPages.length > 0 ? gridPages : deck.pages
  const activeDeckPage =
    deckSelectablePages.find((p) => p.id === deck.activePageId) ?? deckSelectablePages[0]

  const isOnlineReal = phase === 'active' && !isDemoMode
  const isConnecting = phase === 'authenticating' || phase === 'synchronizing' || discoveringLan
  const contextBadge = context.appName
    ? context.appName
    : context.profileName && context.profileName !== '默认配置'
      ? context.profileName
      : null

  const navItems: { id: WorkspaceMode; icon: typeof Gamepad2; label: string }[] = [
    { id: 'remote', icon: Gamepad2, label: '遥控器' },
    { id: 'deck', icon: LayoutGrid, label: '快捷面板' },
    { id: 'pointer', icon: MousePointer2, label: '触控·空鼠' },
  ]

  return (
    <div className="h-full w-full flex flex-col bg-[#0a0c10] text-zinc-100 overflow-hidden">
      {/* Sleek Hardware Status Header */}
      <header className="shrink-0 flex items-center justify-between gap-2 px-3 pb-2 safe-top border-b border-white/[0.06] bg-[#0d1017]/95 backdrop-blur-md">
        {phase === 'active' ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setPairingOpen(true)
            }}
            className="flex items-center gap-2 min-w-0 h-8 px-2.5 rounded-full bg-white/[0.04] border border-white/[0.08] active:scale-[0.98] transition-transform"
          >
            <span
              className={clsx(
                'w-2 h-2 rounded-full shrink-0',
                isOnlineReal
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]'
                  : 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.65)]',
              )}
            />
            <span className="text-xs font-semibold text-zinc-100 truncate max-w-[118px]">
              {isDemoMode ? '模拟体验' : hostName}
            </span>
            {isDemoMode ? (
              <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-[10px] font-medium text-blue-300 shrink-0">
                扫码连电脑
              </span>
            ) : (
              (contextBadge || context.profileName) && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-[10px] font-medium text-emerald-200 truncate max-w-[104px]">
                  {contextBadge ?? context.profileName}
                </span>
              )
            )}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                if (savedHosts.length > 0) {
                  discoverAndReconnect(650)
                } else {
                  setPairingOpen(true)
                }
              }}
              className="flex items-center gap-2 min-w-0 h-8 px-2.5 rounded-full bg-amber-500/12 border border-amber-400/35 text-amber-200 active:scale-[0.98] transition-transform"
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="text-xs font-semibold truncate max-w-[116px]">
                {isConnecting ? '正在重连…' : savedHosts.length > 0 ? '未连接电脑' : '点击扫码配对'}
              </span>
              {savedHosts.length > 0 && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-400/20 text-[10px] font-semibold text-amber-100 shrink-0">
                  <RefreshCw className={clsx('w-2.5 h-2.5', isConnecting && 'animate-spin')} />
                  重试
                </span>
              )}
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setPairingOpen(true)
            }}
            aria-label="连接与配对"
            className="tile-surface h-8 w-8 rounded-xl bg-[#151923] border border-white/[0.08] inline-flex items-center justify-center text-zinc-300"
          >
            {savedHosts.length > 0 ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <QrCode className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setFeelSheetOpen(true)
            }}
            aria-label="本地手感设置"
            className="tile-surface h-8 w-8 rounded-xl bg-[#151923] border border-white/[0.08] inline-flex items-center justify-center text-zinc-300"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Non-Intrusive Toast Banners */}
      {conflictBanner && (
        <div className="mx-3 mt-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-between gap-2 text-xs text-amber-200 shrink-0">
          <span className="truncate">{conflictBanner}</span>
          <button type="button" onClick={dismissConflict} className="shrink-0 underline">
            知道了
          </button>
        </div>
      )}
      {errorToast && (
        <div className="mx-3 mt-2 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-400/30 flex items-center justify-between gap-2 text-xs text-rose-200 shrink-0">
          <span className="truncate">{errorToast}</span>
          <button type="button" onClick={clearError} className="shrink-0 underline">
            关闭
          </button>
        </div>
      )}

      {/* Main Controller Surface */}
      <main className="flex-1 min-h-0 flex flex-col px-3 py-2.5 overflow-hidden">
        {workspaceMode === 'remote' && (
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
            <ClassicRemoteView page={remotePage} />
          </div>
        )}

        {workspaceMode === 'deck' && (
          <div className="flex-1 min-h-0 flex flex-col gap-2.5">
            {deckSelectablePages.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto shrink-0 no-scrollbar">
                {deckSelectablePages.map((p) => {
                  const active = p.id === activeDeckPage?.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap')
                        setActivePage(p.id)
                      }}
                      className={clsx(
                        'h-7 px-3 rounded-full text-xs font-semibold shrink-0 transition-colors border',
                        active
                          ? 'bg-zinc-100 text-zinc-950 border-white'
                          : 'bg-[#141822] text-zinc-400 border-white/[0.07]',
                      )}
                    >
                      {p.name}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
              {activeDeckPage && <DeckGrid page={activeDeckPage} />}
            </div>
          </div>
        )}

        {workspaceMode === 'pointer' && (
          <div className="flex-1 min-h-0">
            <TrackpadSurface />
          </div>
        )}
      </main>

      {/* Ergonomic Thumb-Zone Primary Mode Segmented Bar (Right Above Voice/Text Dock) */}
      <nav
        aria-label="主工作区切换"
        className="shrink-0 px-3 pt-1.5 pb-1.5 bg-[#0c0f16] border-t border-white/[0.06]"
      >
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#121620] border border-white/[0.07]">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = workspaceMode === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (workspaceMode === item.id) return
                  triggerHaptic('tap')
                  setWorkspaceMode(item.id)
                }}
                className={clsx(
                  'h-9 rounded-xl inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-all',
                  active
                    ? 'bg-[#212838] text-white border border-white/[0.12] shadow-sm'
                    : 'text-zinc-400 active:text-zinc-200',
                )}
              >
                <Icon className={clsx('w-3.5 h-3.5', active ? 'text-blue-400' : 'text-zinc-500')} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Bottom Voice Key (mobile.voice) & Local IME Quick Text Dock */}
      <VoiceTextDock />

      {/* Bottom Sheets */}
      <PairingSheet />
      <LocalFeelSheet />
    </div>
  )
}
