import { useEffect, useState } from 'react'
import {
  Gamepad2,
  LayoutGrid,
  MousePointer2,
  PencilRuler,
  Plus,
  QrCode,
  RefreshCw,
  SlidersHorizontal,
  Wifi,
} from 'lucide-react'
import { clsx } from 'clsx'
import { AboutUpdateSheet } from './components/AboutUpdateSheet'
import { LayoutEditorBar } from './components/LayoutEditorBar'
import { LocalFeelSheet } from './components/LocalFeelSheet'
import { PageManagerSheet } from './components/PageManagerSheet'
import { PageZoneRenderer } from './components/PageZoneRenderer'
import { PairingSheet } from './components/PairingSheet'
import { PresetWizardSheet } from './components/PresetWizardSheet'
import { TileStyleSheet } from './components/TileStyleSheet'
import { TrackpadSurface } from './components/TrackpadSurface'
import { VoiceTextDock } from './components/VoiceTextDock'
import { useMobileStore, type WorkspaceMode } from './state/useMobileStore'
import { DEFAULT_DEMO_DECK } from './transport/defaultDeck'
import { triggerHaptic } from './transport/nativeBridge'

function readViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 390, height: 844 }
  return { width: window.innerWidth, height: window.innerHeight }
}

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
  const layoutEditing = useMobileStore((s) => s.layoutEditing)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const screenOrientation = useMobileStore((s) => s.localFeel.screenOrientation)
  const conflictBanner = useMobileStore((s) => s.conflictBanner)
  const errorToast = useMobileStore((s) => s.errorToast)

  const setWorkspaceMode = useMobileStore((s) => s.setWorkspaceMode)
  const setActivePage = useMobileStore((s) => s.setActivePage)
  const setPairingOpen = useMobileStore((s) => s.setPairingOpen)
  const setFeelSheetOpen = useMobileStore((s) => s.setFeelSheetOpen)
  const setLayoutEditing = useMobileStore((s) => s.setLayoutEditing)
  const setPageManagerOpen = useMobileStore((s) => s.setPageManagerOpen)
  const discoverAndReconnect = useMobileStore((s) => s.discoverAndReconnect)
  const dismissConflict = useMobileStore((s) => s.dismissConflict)
  const clearError = useMobileStore((s) => s.clearError)

  const isLight = effectiveTheme === 'light'
  const [viewport, setViewport] = useState(readViewportSize)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      setViewport(readViewportSize())
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  const isWideViewport = viewport.width > viewport.height
  const isSplitLandscape =
    (isWideViewport && viewport.height < 580) ||
    (screenOrientation === 'landscape' && isWideViewport)

  // Resolve Remote pages vs Custom/Grid/Mixed pages harmoniously
  const remotePages = deck.pages.filter((p) => p.layout === 'remote' || p.id === 'classic-remote')
  const remotePage =
    remotePages.find((p) => p.id === deck.activePageId) ??
    remotePages[0] ??
    deck.pages[0] ??
    DEFAULT_DEMO_DECK.pages[0]

  const gridPages = deck.pages.filter((p) => p.layout !== 'remote' && p.id !== 'classic-remote')
  const deckSelectablePages = gridPages.length > 0 ? gridPages : deck.pages
  const activeDeckPage =
    deckSelectablePages.find((p) => p.id === deck.activePageId) ?? deckSelectablePages[0]

  const editingCurrentPage =
    deck.pages.find((p) => p.id === deck.activePageId) ??
    (workspaceMode === 'remote' ? remotePage : activeDeckPage) ??
    deck.pages[0] ??
    DEFAULT_DEMO_DECK.pages[0]

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
    { id: 'pointer', icon: MousePointer2, label: '触控·飞鼠' },
  ]

  const handlePrimaryTabSelect = (mode: WorkspaceMode) => {
    triggerHaptic('tap')
    if (mode === 'pointer') {
      if (layoutEditing) setLayoutEditing(false)
      setWorkspaceMode('pointer')
      return
    }
    setWorkspaceMode(mode)
    if (mode === 'remote' && remotePage) {
      setActivePage(remotePage.id)
    } else if (mode === 'deck' && activeDeckPage) {
      setActivePage(activeDeckPage.id)
    }
  }

  const renderMainStage = () => (
    <>
      {conflictBanner && (
        <div
          className={clsx(
            'mx-3 mt-2 px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2 text-xs shrink-0',
            isLight
              ? 'bg-amber-500/15 border-amber-500/35 text-amber-900'
              : 'bg-amber-500/15 border-amber-400/30 text-amber-200',
          )}
        >
          <span className="truncate">{conflictBanner}</span>
          <button type="button" onClick={dismissConflict} className="shrink-0 underline">
            知道了
          </button>
        </div>
      )}
      {errorToast && (
        <div
          className={clsx(
            'mx-3 mt-2 px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2 text-xs shrink-0',
            isLight
              ? 'bg-rose-500/12 border-rose-500/30 text-rose-800'
              : 'bg-rose-500/15 border-rose-400/30 text-rose-200',
          )}
        >
          <span className="truncate">{errorToast}</span>
          <button type="button" onClick={clearError} className="shrink-0 underline">
            关闭
          </button>
        </div>
      )}

      {layoutEditing && <LayoutEditorBar currentPage={editingCurrentPage} />}

      <main className="flex-1 min-h-0 flex flex-col px-3 py-2.5 overflow-hidden">
        {layoutEditing ? (
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
            <PageZoneRenderer page={editingCurrentPage} />
          </div>
        ) : (
          <>
            {workspaceMode === 'remote' && (
              <div className="flex-1 min-h-0 flex flex-col gap-2">
                {remotePages.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto shrink-0 no-scrollbar">
                    {remotePages.map((p) => {
                      const active = p.id === remotePage.id
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
                              ? isLight
                                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                : 'bg-zinc-100 text-zinc-950 border-white'
                              : 'ak-elevated ak-text-2',
                          )}
                        >
                          {p.name}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                  <PageZoneRenderer page={remotePage} />
                </div>
              </div>
            )}

            {workspaceMode === 'deck' && (
              <div className="flex-1 min-h-0 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1">
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
                              ? isLight
                                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                : 'bg-zinc-100 text-zinc-950 border-white'
                              : 'ak-elevated ak-text-2',
                          )}
                        >
                          {p.name}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap')
                      setLayoutEditing(true)
                      setPageManagerOpen(true)
                    }}
                    aria-label="新建自定义页面"
                    className="ak-pill ak-text-2 h-7 px-2.5 rounded-full border text-[11px] font-semibold inline-flex items-center gap-0.5 shrink-0"
                  >
                    <Plus className={clsx('w-3 h-3', isLight ? 'text-blue-600' : 'text-blue-400')} />
                    <span>新页面</span>
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                  {activeDeckPage && <PageZoneRenderer page={activeDeckPage} />}
                </div>
              </div>
            )}

            {workspaceMode === 'pointer' && (
              <div className="flex-1 min-h-0">
                <TrackpadSurface />
              </div>
            )}
          </>
        )}
      </main>
    </>
  )

  const renderSheets = () => (
    <>
      <PairingSheet />
      <LocalFeelSheet />
      <TileStyleSheet />
      <PageManagerSheet currentPage={editingCurrentPage} />
      <AboutUpdateSheet />
      <PresetWizardSheet />
    </>
  )

  // Responsive Split Landscape Ergonomic Layout (Left Control Rail w-[208px] + Right Full-Height Stage)
  if (isSplitLandscape) {
    return (
      <div
        data-testid="split-landscape-shell"
        className="ak-canvas h-full w-full flex flex-row overflow-hidden"
      >
        <aside className="ak-chrome w-[208px] shrink-0 h-full border-r p-2.5 flex flex-col justify-between gap-2 overflow-y-auto no-scrollbar">
          <div className="space-y-2">
            {/* Compact Host Status Badge */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                if (phase !== 'active' && savedHosts.length > 0) {
                  discoverAndReconnect(650)
                } else {
                  setPairingOpen(true)
                }
              }}
              className="ak-pill w-full flex items-center justify-between gap-1.5 h-8 px-2.5 rounded-xl border text-left"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={clsx(
                    'w-2 h-2 rounded-full shrink-0',
                    phase === 'active'
                      ? isOnlineReal
                        ? 'bg-emerald-500'
                        : 'bg-cyan-500'
                      : 'bg-amber-500 animate-pulse',
                  )}
                />
                <span className="ak-text-1 text-xs font-semibold truncate">
                  {phase === 'active'
                    ? isDemoMode
                      ? '模拟体验'
                      : hostName
                    : isConnecting
                      ? '重连中…'
                      : '未连接'}
                </span>
              </div>
              {phase === 'active' && !isDemoMode && (contextBadge || context.profileName) && (
                <span className="ak-text-3 text-[10px] truncate max-w-[64px]">
                  {contextBadge ?? context.profileName}
                </span>
              )}
            </button>

            {/* Compact Utility Row: 布局 / 配对 / 设置 */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  setLayoutEditing(!layoutEditing)
                }}
                aria-label="自定义布局"
                aria-pressed={layoutEditing}
                className={clsx(
                  'tile-surface h-8 rounded-xl border inline-flex items-center justify-center gap-1 text-[11px] font-semibold',
                  layoutEditing
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'ak-elevated ak-text-2',
                )}
              >
                <PencilRuler className="w-3.5 h-3.5" />
                <span>布局</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  setPairingOpen(true)
                }}
                aria-label="连接与配对"
                className="tile-surface ak-elevated ak-text-2 h-8 rounded-xl border inline-flex items-center justify-center"
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
                className="tile-surface ak-elevated ak-text-2 h-8 rounded-xl border inline-flex items-center justify-center"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Primary Workspace Buttons */}
            <nav aria-label="主工作区切换" className="ak-seg p-1 rounded-2xl border space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const active = workspaceMode === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (workspaceMode === item.id && !layoutEditing) return
                      handlePrimaryTabSelect(item.id)
                    }}
                    className={clsx(
                      'w-full h-9 px-2.5 rounded-xl inline-flex items-center gap-2 text-xs font-semibold transition-all touch-none',
                      active
                        ? clsx(
                            'tile-surface ak-active-tab border shadow-xs',
                            isLight ? 'border-blue-500/35' : 'border-blue-400/30',
                          )
                        : 'ak-text-2',
                    )}
                  >
                    <Icon
                      className={clsx(
                        'w-4 h-4 shrink-0',
                        active ? (isLight ? 'text-blue-600' : 'text-blue-400') : 'ak-text-3',
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Dedicated Thumb-Zone Voice & Text Dock */}
          <VoiceTextDock compactLandscape />
        </aside>

        {/* Right Full-Height Uncramped Stage */}
        <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
          {renderMainStage()}
        </div>

        {renderSheets()}
      </div>
    )
  }

  return (
    <div className="ak-canvas h-full w-full flex flex-col overflow-hidden">
      {/* Sleek Hardware Status Header */}
      <header className="ak-chrome shrink-0 flex items-center justify-between gap-2 px-3.5 pb-2.5 safe-top border-b backdrop-blur-md">
        {phase === 'active' ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setPairingOpen(true)
            }}
            className="ak-pill flex items-center gap-2 min-w-0 h-9 px-3 rounded-full border active:scale-[0.98] transition-transform"
          >
            <span
              className={clsx(
                'w-2 h-2 rounded-full shrink-0',
                isOnlineReal
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]'
                  : 'bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.6)]',
              )}
            />
            <span className="ak-text-1 text-[12.5px] font-semibold truncate max-w-[110px]">
              {isDemoMode ? '模拟体验' : hostName}
            </span>
            {isDemoMode ? (
              <span
                className={clsx(
                  'px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0',
                  isLight ? 'bg-blue-600/12 text-blue-700' : 'bg-blue-500/20 text-blue-300',
                )}
              >
                扫码连电脑
              </span>
            ) : (
              (contextBadge || context.profileName) && (
                <span
                  className={clsx(
                    'px-2 py-0.5 rounded-full border text-[10.5px] font-medium truncate max-w-[96px]',
                    isLight
                      ? 'bg-emerald-600/10 border-emerald-600/25 text-emerald-800'
                      : 'bg-emerald-500/15 border-emerald-400/25 text-emerald-200',
                  )}
                >
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
              className={clsx(
                'flex items-center gap-2 min-w-0 h-9 px-3 rounded-full border active:scale-[0.98] transition-transform',
                isLight
                  ? 'bg-amber-500/12 border-amber-500/35 text-amber-900'
                  : 'bg-amber-500/12 border-amber-400/35 text-amber-200',
              )}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="text-[12.5px] font-semibold truncate max-w-[108px]">
                {isConnecting ? '正在重连…' : savedHosts.length > 0 ? '未连接电脑' : '点击扫码配对'}
              </span>
              {savedHosts.length > 0 && (
                <span
                  className={clsx(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0',
                    isLight ? 'bg-amber-500/20 text-amber-900' : 'bg-amber-400/20 text-amber-100',
                  )}
                >
                  <RefreshCw className={clsx('w-3 h-3', isConnecting && 'animate-spin')} />
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
              setLayoutEditing(!layoutEditing)
            }}
            aria-label="自定义布局"
            aria-pressed={layoutEditing}
            className={clsx(
              'tile-surface h-9 px-2.5 rounded-xl border inline-flex items-center justify-center gap-1 text-xs font-semibold transition-colors',
              layoutEditing
                ? isLight
                  ? 'bg-blue-600 text-white border-blue-600 shadow-[0_2px_10px_rgba(37,99,235,0.28)]'
                  : 'bg-blue-500/25 border-blue-400/60 text-blue-100 shadow-[0_0_14px_rgba(59,130,246,0.28)]'
                : 'ak-elevated ak-text-2',
            )}
          >
            <PencilRuler className="w-3.5 h-3.5" />
            <span>布局</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setPairingOpen(true)
            }}
            aria-label="连接与配对"
            className="tile-surface ak-elevated ak-text-2 h-9 w-9 rounded-xl border inline-flex items-center justify-center"
          >
            {savedHosts.length > 0 ? (
              <Wifi className="w-4 h-4" />
            ) : (
              <QrCode className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap')
              setFeelSheetOpen(true)
            }}
            aria-label="本地手感设置"
            className="tile-surface ak-elevated ak-text-2 h-9 w-9 rounded-xl border inline-flex items-center justify-center"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      {renderMainStage()}

      {/* Ergonomic Thumb-Zone Primary Mode Segmented Bar (Right Above Voice/Text Dock) */}
      <nav aria-label="主工作区切换" className="ak-dock shrink-0 px-3 pt-2 pb-1 border-t">
        <div className="ak-seg grid grid-cols-3 gap-1.5 p-1.5 rounded-[20px] border">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = workspaceMode === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (workspaceMode === item.id && !layoutEditing) return
                  handlePrimaryTabSelect(item.id)
                }}
                className={clsx(
                  'h-12 rounded-2xl inline-flex items-center justify-center gap-2 text-[13px] font-semibold transition-all touch-none',
                  active
                    ? clsx(
                        'tile-surface ak-active-tab border shadow-xs',
                        isLight ? 'border-blue-500/35' : 'border-blue-400/30',
                      )
                    : 'ak-text-2',
                )}
              >
                <Icon
                  className={clsx(
                    'w-4 h-4',
                    active ? (isLight ? 'text-blue-600' : 'text-blue-400') : 'ak-text-3',
                  )}
                />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Bottom Voice Key (mobile.voice) & Local IME Quick Text Dock */}
      <VoiceTextDock />

      {/* Bottom Sheets */}
      {renderSheets()}
    </div>
  )
}
