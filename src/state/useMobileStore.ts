import { create } from 'zustand'
import type {
  DeckLayoutPatch,
  DeckSnapshot,
  DeckZoneKind,
  DiscoveredLanHost,
  ForegroundContext,
  GyroGuardKind,
  HostCapabilities,
  MobileDeckPage,
  MobileDeckZone,
  MobileTile,
  PairingOfferQr,
  PointerButtonName,
  SessionPhase,
  StarterPresetId,
  TextCommitMode,
  VoicePresetKind,
} from '../protocol/types'
import {
  MAX_TILES_PER_PAGE,
  MAX_ZONES_PER_PAGE,
  createNewCustomTile,
  createNewZone,
  createPageFromTemplate,
  cycleBentoSpan,
  normalizeDpadSlotIds,
  normalizeGesturePadSlotIds,
  normalizePageZones,
  type PageTemplateId,
} from '../input/bentoLayout'
import { DEFAULT_DEMO_DECK, buildDemoPresetDeck } from '../transport/defaultDeck'
import {
  applyEffectiveThemeToDocument,
  discoverNativeLanHosts,
  loadLocalFeelPreferences,
  loadSavedHosts,
  parseDiscoveredLanHosts,
  querySystemDarkMode,
  removeHostProfile,
  resolveEffectiveTheme,
  saveHostProfile,
  saveLocalFeelPreferences,
  setHapticsEnabled,
  setKeepScreenOn,
  setNativeGyroClutch,
  setNativeGyroConfig,
  setNativeScreenOrientationMode,
  setNativeVolumeKeyMouseConfig,
  triggerHaptic,
  updateSavedHostAddrs,
  type AirMouseFeelMode,
  type AirMouseHandedness,
  type EffectiveTheme,
  type LocalFeelPreferences,
  type PointerTabMode,
  type SavedHostProfile,
  type ScreenOrientationMode,
  type ThemeMode,
  type VolumeKeyMouseMode,
} from '../transport/nativeBridge'
import {
  DemoLoopbackTransport,
  MobileSessionClient,
  NativeWssTransport,
} from '../transport/sessionClient'

export type WorkspaceMode = 'remote' | 'deck' | 'pointer'
export type {
  AirMouseFeelMode,
  AirMouseHandedness,
  EffectiveTheme,
  PointerTabMode,
  ScreenOrientationMode,
  ThemeMode,
  VolumeKeyMouseMode,
}

export const PRESET_ONBOARDED_STORAGE_KEY = 'axonkey_mobile_preset_onboarded_v1'

export interface TileFeedback {
  status: 'ok' | 'error'
  at: number
}

export interface TextDeliveryBanner {
  status: 'sent' | 'ok' | 'error' | 'unknown'
  message?: string
}

export interface GyroGuardNotice {
  kind: GyroGuardKind
  at: number
}

export interface EditingTileTarget {
  pageId: string
  zoneId: string
  tileId: string
}

interface MobileStoreState {
  phase: SessionPhase
  statusDetail: string
  hostName: string
  hostId: string | null
  connectingHostAddr: string | null
  isDemoMode: boolean
  capabilities: HostCapabilities | null
  deck: DeckSnapshot
  deckRevision: number
  context: ForegroundContext
  contextRevision: number
  savedHosts: SavedHostProfile[]
  discoveredHosts: DiscoveredLanHost[]
  discoveringLan: boolean

  workspaceMode: WorkspaceMode
  pointerTab: PointerTabMode
  airMouseFeel: AirMouseFeelMode
  effectiveTheme: EffectiveTheme
  localFeel: LocalFeelPreferences
  pairingOpen: boolean
  feelSheetOpen: boolean
  aboutSheetOpen: boolean
  presetWizardOpen: boolean
  embeddedAirMouseActive: boolean

  layoutEditing: boolean
  editingTileTarget: EditingTileTarget | null
  pageManagerOpen: boolean

  voiceLevel: number
  gyroGuard: GyroGuardNotice | null

  conflictBanner: string | null
  errorToast: string | null
  tileFeedback: Record<string, TileFeedback>
  textDelivery: TextDeliveryBanner | null

  init: () => void
  connectDemo: () => void
  connectSavedHost: (host: SavedHostProfile) => void
  pairFromOffer: (offer: PairingOfferQr) => void
  discoverAndReconnect: (timeoutMs?: number) => void
  applyDiscoveredHosts: (hosts: DiscoveredLanHost[]) => void
  forgetHost: (hostId: string) => void
  disconnect: () => void

  setWorkspaceMode: (mode: WorkspaceMode) => void
  setPointerTab: (tab: PointerTabMode) => void
  setAirMouseFeel: (feel: AirMouseFeelMode) => void
  setThemeMode: (mode: ThemeMode) => void
  setActivePage: (pageId: string) => void
  setPairingOpen: (open: boolean) => void
  setFeelSheetOpen: (open: boolean) => void
  setAboutSheetOpen: (open: boolean) => void
  setPresetWizardOpen: (open: boolean) => void
  setEmbeddedAirMouseZoneActive: (zoneId: string, active: boolean) => void
  applyStarterPreset: (preset: StarterPresetId, voicePreset?: VoicePresetKind) => boolean
  setLayoutEditing: (editing: boolean) => void
  openTileEditor: (pageId: string, zoneId: string, tileId: string) => void
  closeTileEditor: () => void
  setPageManagerOpen: (open: boolean) => void
  updateLocalFeel: (patch: Partial<LocalFeelPreferences>) => void
  clearGyroGuard: () => void
  dismissConflict: () => void
  clearError: () => void

  submitDeckPatch: (patch: DeckLayoutPatch) => void
  updateTile: (pageId: string, tileId: string, patch: Partial<MobileTile>) => void
  cycleTileSpan: (pageId: string, tileId: string) => void
  deleteTile: (pageId: string, tileId: string) => void
  addTileToPage: (pageId: string, zoneId?: string, slotIndex?: number) => MobileTile | null
  addZoneToPage: (pageId: string, kind: DeckZoneKind) => void
  updateZone: (
    pageId: string,
    zoneId: string,
    patch: Partial<
      Pick<MobileDeckZone, 'columns' | 'pointerMode' | 'padHeight' | 'showButtons' | 'tileIds'>
    >,
  ) => void
  moveZone: (pageId: string, zoneId: string, dir: -1 | 1) => void
  deleteZone: (pageId: string, zoneId: string) => void
  updatePageZonesOrder: (pageId: string, nextZones: MobileDeckZone[]) => void
  addPageFromTemplate: (template: PageTemplateId, customName?: string) => MobileDeckPage
  renamePage: (pageId: string, name: string) => void
  deletePage: (pageId: string) => void

  updateSensitivity: (patch: { pointerSensitivity?: number; scrollSensitivity?: number }) => void
  sendText: (text: string, mode: TextCommitMode, submit: boolean) => boolean
  getClient: () => MobileSessionClient
}

const pendingTileReqMap = new Map<string, string>()
const activeEmbeddedAirMouseZoneIds = new Set<string>()
const heldVolKeyButtons = new Map<
  'up' | 'down',
  { button: PointerButtonName; pressId: string }
>()

let singletonClient: MobileSessionClient | null = null
let listenersBound = false
let discoveryResetTimer: ReturnType<typeof setTimeout> | null = null
let gyroGuardTimer: ReturnType<typeof setTimeout> | null = null
let volPressSeq = 1
let appPausedRuntime = false
let textInputFocusedRuntime = false
let lastVolCaptureActive: boolean | null = null
let lastVolCaptureMode: VolumeKeyMouseMode | null = null

function computeShouldCaptureVolumeKeys(state: MobileStoreState): boolean {
  if (appPausedRuntime || textInputFocusedRuntime) return false
  if (state.phase !== 'active' || state.layoutEditing) return false
  if (state.localFeel.volumeKeyMouseMode === 'off') return false
  const anySheetOpen =
    state.pairingOpen ||
    state.feelSheetOpen ||
    state.pageManagerOpen ||
    Boolean(state.editingTileTarget) ||
    state.aboutSheetOpen ||
    state.presetWizardOpen
  if (anySheetOpen) return false

  const inStandaloneAirMouse =
    state.workspaceMode === 'pointer' && state.pointerTab === 'airmouse'
  const inEmbeddedAirMouse =
    state.workspaceMode !== 'pointer' && state.embeddedAirMouseActive
  return inStandaloneAirMouse || inEmbeddedAirMouse
}

function releaseHeldVolumeKeyButtons(client: MobileSessionClient | null): void {
  if (heldVolKeyButtons.size === 0) return
  const entries = Array.from(heldVolKeyButtons.values())
  heldVolKeyButtons.clear()
  if (client) {
    for (const entry of entries) {
      client.sendPointerButton(entry.button, 'up', entry.pressId)
    }
  }
}

function buildNativeTransportFactory() {
  return (host: SavedHostProfile, attempt = 0) => {
    const addrs = host.addrs.length > 0 ? host.addrs : ['127.0.0.1:49670']
    const addr = addrs[attempt % addrs.length]
    return new NativeWssTransport(`wss://${addr}/ws`, host.hostId, host.caCertDerB64)
  }
}

export const useMobileStore = create<MobileStoreState>((set, get) => {
  const initialFeel = loadLocalFeelPreferences()
  const initialEffectiveTheme = resolveEffectiveTheme(initialFeel.themeMode)
  setHapticsEnabled(initialFeel.hapticsEnabled)
  applyEffectiveThemeToDocument(initialEffectiveTheme)

  const ensureClient = (): MobileSessionClient => {
    if (singletonClient) return singletonClient
    singletonClient = new MobileSessionClient(
      {
        onPhaseChange: (phase, detail) => {
        const keepOn = phase === 'active' && get().localFeel.keepScreenOn
        setKeepScreenOn(keepOn)
        if (phase !== 'active') {
          setNativeGyroClutch(false)
          setNativeGyroConfig('off', get().localFeel.gyroSensitivity)
          set({ phase, statusDetail: detail ?? '', voiceLevel: 0 })
        } else {
          set({ phase, statusDetail: detail ?? '' })
        }
      },
      onPaired: (host) => {
        const nextHosts = saveHostProfile(host)
        let shouldAutoOpenPresetWizard = false
        if (typeof window !== 'undefined') {
          try {
            if (!window.localStorage.getItem(PRESET_ONBOARDED_STORAGE_KEY)) {
              window.localStorage.setItem(PRESET_ONBOARDED_STORAGE_KEY, '1')
              shouldAutoOpenPresetWizard = true
            }
          } catch {
            // Ignore storage errors
          }
        }
        set({
          savedHosts: nextHosts,
          pairingOpen: false,
          connectingHostAddr: host.addrs[0] ?? null,
          ...(shouldAutoOpenPresetWizard ? { presetWizardOpen: true } : {}),
        })
        triggerHaptic('confirm')
      },
      onReady: (payload) => {
        set({
          hostId: payload.hostId,
          hostName: payload.hostName,
          capabilities: payload.capabilities,
          deck: payload.deckSnapshot,
          deckRevision: payload.deckRevision,
          context: payload.context,
          contextRevision: payload.contextRevision,
          pairingOpen: false,
          conflictBanner: null,
          errorToast: null,
        })
        triggerHaptic('confirm')
      },
      onDeckUpdate: (snapshot, revision) => {
        set({ deck: snapshot, deckRevision: revision, conflictBanner: null })
      },
      onDeckConflict: (latestSnapshot, latestRevision, message) => {
        set({
          deck: latestSnapshot,
          deckRevision: latestRevision,
          conflictBanner: message,
        })
        triggerHaptic('error')
      },
      onContextChanged: (context, revision) => {
        set({ context, contextRevision: revision })
      },
      onCommandResult: (requestId, ok, _code, message) => {
        const tileId = pendingTileReqMap.get(requestId)
        if (tileId) {
          pendingTileReqMap.delete(requestId)
          if (!ok) triggerHaptic('error')
          set((s) => ({
            tileFeedback: {
              ...s.tileFeedback,
              [tileId]: { status: ok ? 'ok' : 'error', at: Date.now() },
            },
            errorToast: !ok && message ? message : s.errorToast,
          }))
        } else if (!ok && message) {
          set({ errorToast: message })
        }
      },
      onTextStatus: (_requestId, status, message) => {
        if (status === 'ok') triggerHaptic('confirm')
        if (status === 'error' || status === 'unknown') triggerHaptic('error')
        set({ textDelivery: { status, message } })
      },
      onError: (message) => {
        set({ errorToast: message })
      },
    },
    get().localFeel.deviceName,
    )
    return singletonClient
  }

  return {
    phase: 'disconnected',
    statusDetail: '未连接桌面端',
    hostName: '未连接',
    hostId: null,
    connectingHostAddr: null,
    isDemoMode: false,
    capabilities: null,
    deck: structuredClone(DEFAULT_DEMO_DECK),
    deckRevision: 1,
    context: { appId: null, appName: null, profileName: '默认配置' },
    contextRevision: 1,
    savedHosts: [],
    discoveredHosts: [],
    discoveringLan: false,

    workspaceMode: 'remote',
    pointerTab: initialFeel.preferredPointerTab,
    airMouseFeel: initialFeel.airMouseFeel,
    effectiveTheme: initialEffectiveTheme,
    localFeel: initialFeel,
    pairingOpen: false,
    feelSheetOpen: false,
    aboutSheetOpen: false,
    presetWizardOpen: false,
    embeddedAirMouseActive: false,

    layoutEditing: false,
    editingTileTarget: null,
    pageManagerOpen: false,

    voiceLevel: 0,
    gyroGuard: null,

    conflictBanner: null,
    errorToast: null,
    tileFeedback: {},
    textDelivery: null,

    init: () => {
      const feel = loadLocalFeelPreferences()
      const hosts = loadSavedHosts()
      const resolvedTheme = resolveEffectiveTheme(feel.themeMode)
      applyEffectiveThemeToDocument(resolvedTheme)
      setNativeScreenOrientationMode(feel.screenOrientation)
      lastVolCaptureActive = null
      lastVolCaptureMode = null
      set({
        savedHosts: hosts,
        localFeel: feel,
        pointerTab: feel.preferredPointerTab,
        airMouseFeel: feel.airMouseFeel,
        effectiveTheme: resolvedTheme,
      })
      const client = ensureClient()

      if (typeof window !== 'undefined') {
        window.__axonkeyNativeOnVolumeKey = (key, keyPhase) => {
          if (keyPhase === 'up') {
            const held = heldVolKeyButtons.get(key)
            if (held) {
              heldVolKeyButtons.delete(key)
              ensureClient().sendPointerButton(held.button, 'up', held.pressId)
            }
            return
          }

          const state = get()
          if (!computeShouldCaptureVolumeKeys(state)) return
          const mode = state.localFeel.volumeKeyMouseMode

          if (mode === 'lr' || mode === 'rl') {
            if (keyPhase !== 'down') return
            if (heldVolKeyButtons.has(key)) return
            const button: PointerButtonName =
              key === 'up'
                ? mode === 'lr'
                  ? 'left'
                  : 'right'
                : mode === 'lr'
                  ? 'right'
                  : 'left'
            volPressSeq += 1
            const pressId = `vol-${button}-${volPressSeq}`
            heldVolKeyButtons.set(key, { button, pressId })
            triggerHaptic('tap')
            ensureClient().sendPointerButton(button, 'down', pressId)
            return
          }

          if (mode === 'scroll') {
            if (keyPhase === 'down') triggerHaptic('tap')
            const deltaY = key === 'up' ? 2.4 : -2.4
            ensureClient().sendPointerScroll(0, deltaY)
          }
        }
      }

      if (typeof window !== 'undefined' && !listenersBound) {
        listenersBound = true

        const isEditableElement = (el: EventTarget | null): boolean => {
          if (!el || !(el instanceof HTMLElement)) return false
          const tag = el.tagName
          if (tag === 'TEXTAREA' || el.isContentEditable) return true
          if (tag === 'INPUT') {
            const inputType = (el as HTMLInputElement).type?.toLowerCase() || 'text'
            return inputType !== 'range' && inputType !== 'button' && inputType !== 'checkbox'
          }
          return false
        }

        document.addEventListener('focusin', (e) => {
          const nextFocused = isEditableElement(e.target)
          if (nextFocused !== textInputFocusedRuntime) {
            textInputFocusedRuntime = nextFocused
            syncVolumeKeyCaptureWithStore(get())
          }
        })

        document.addEventListener('focusout', () => {
          setTimeout(() => {
            const nextFocused = isEditableElement(document.activeElement)
            if (nextFocused !== textInputFocusedRuntime) {
              textInputFocusedRuntime = nextFocused
              syncVolumeKeyCaptureWithStore(get())
            }
          }, 0)
        })

        const refreshSystemTheme = (overrideSystemDark?: boolean) => {
          const curMode = get().localFeel.themeMode
          if (curMode !== 'system') return
          const nextEffective = resolveEffectiveTheme(
            'system',
            overrideSystemDark ?? querySystemDarkMode(),
          )
          applyEffectiveThemeToDocument(nextEffective)
          if (get().effectiveTheme !== nextEffective) {
            set({ effectiveTheme: nextEffective })
          }
        }

        if (typeof window.matchMedia === 'function') {
          try {
            const mql = window.matchMedia('(prefers-color-scheme: dark)')
            const onMediaChange = (e: MediaQueryListEvent) => refreshSystemTheme(e.matches)
            if (typeof mql.addEventListener === 'function') {
              mql.addEventListener('change', onMediaChange)
            }
          } catch {
            // Ignore in restricted environments
          }
        }

        window.__axonkeyNativeOnSystemDarkChanged = (isDark) => {
          refreshSystemTheme(Boolean(isDark))
        }

        const handlePause = () => {
          appPausedRuntime = true
          releaseHeldVolumeKeyButtons(singletonClient)
          setNativeGyroClutch(false)
          setNativeGyroConfig('off', get().localFeel.gyroSensitivity)
          syncVolumeKeyCaptureWithStore(get())
          set({ voiceLevel: 0 })
          client.handleVisibilityHidden()
        }

        const handleResume = () => {
          appPausedRuntime = false
          refreshSystemTheme()
          client.handleVisibilityVisible()
          syncVolumeKeyCaptureWithStore(get())
          const s = get()
          if (!s.isDemoMode && s.savedHosts.length > 0 && s.phase !== 'active') {
            discoverNativeLanHosts(600)
          }
        }

        document.addEventListener('visibilitychange', () => {
          if (document.hidden) handlePause()
          else handleResume()
        })

        window.__axonkeyNativeOnLifecycle = (state) => {
          if (state === 'paused') handlePause()
          else handleResume()
        }

        window.__axonkeyNativeOnVoiceLevel = (level) => {
          const clamped = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0
          set({ voiceLevel: clamped })
        }

        window.__axonkeyNativeOnGyroState = (state) => {
          if (state === 'vertical_guard' || state === 'out_of_bounds') {
            if (gyroGuardTimer) clearTimeout(gyroGuardTimer)
            set({ gyroGuard: { kind: state, at: Date.now() } })
            gyroGuardTimer = setTimeout(() => {
              set({ gyroGuard: null })
              gyroGuardTimer = null
            }, 2400)
          } else if (state === 'ok' || state === 'active' || state === 'off') {
            if (gyroGuardTimer) {
              clearTimeout(gyroGuardTimer)
              gyroGuardTimer = null
            }
            set({ gyroGuard: null })
          } else if (state === 'unavailable') {
            set({ errorToast: '当前设备缺少陀螺仪或姿态传感器' })
          }
        }

        window.__axonkeyNativeOnHostsDiscovered = (rawJson) => {
          const discovered = parseDiscoveredLanHosts(rawJson)
          get().applyDiscoveredHosts(discovered)
        }
      }

      if (get().phase !== 'disconnected') {
        return
      }

      if (hosts.length > 0) {
        get().connectSavedHost(hosts[0])
        // Also run UDP LAN auto-discovery immediately in case PC IP or WSS port changed!
        discoverNativeLanHosts(600)
      } else {
        // Start in Demo Mode so first-time users can immediately feel the hardware UI,
        // and also discover LAN hosts in background for PairingSheet hints.
        get().connectDemo()
        discoverNativeLanHosts(600)
      }
    },

    connectDemo: () => {
      const client = ensureClient()
      setNativeGyroClutch(false)
      setNativeGyroConfig('off', get().localFeel.gyroSensitivity)
      set({
        isDemoMode: true,
        connectingHostAddr: 'demo',
        errorToast: null,
        voiceLevel: 0,
      })
      client.connectToHost(
        {
          hostId: 'demo-desktop',
          hostName: 'Demo Desktop',
          addrs: ['demo'],
          caCertDerB64: '',
          peerId: 'demo-peer',
          peerToken: 'demo-token',
          lastConnectedAt: Date.now(),
        },
        () => new DemoLoopbackTransport(),
      )
    },

    connectSavedHost: (host) => {
      const client = ensureClient()
      const refreshed: SavedHostProfile = {
        ...host,
        lastConnectedAt: Date.now(),
      }
      const nextSaved = saveHostProfile(refreshed)
      set({
        savedHosts: nextSaved,
        isDemoMode: false,
        hostId: refreshed.hostId,
        hostName: refreshed.hostName,
        connectingHostAddr: refreshed.addrs[0] ?? null,
        errorToast: null,
      })
      client.connectToHost(refreshed, buildNativeTransportFactory())
    },

    pairFromOffer: (offer) => {
      const client = ensureClient()
      set({
        isDemoMode: false,
        hostId: offer.hostId,
        hostName: offer.hostName,
        connectingHostAddr: offer.addrs[0] ?? null,
        errorToast: null,
      })
      const url = `wss://${offer.addrs[0]}/ws`
      client.connectWithPairing(
        offer,
        new NativeWssTransport(url, offer.hostId, offer.caCertDerB64),
        buildNativeTransportFactory(),
      )
    },

    discoverAndReconnect: (timeoutMs = 600) => {
      const { savedHosts, phase, isDemoMode } = get()
      if (discoveryResetTimer) clearTimeout(discoveryResetTimer)
      const startedNative = discoverNativeLanHosts(timeoutMs)
      if (startedNative) {
        set({ discoveringLan: true, errorToast: null })
        discoveryResetTimer = setTimeout(() => {
          set({ discoveringLan: false })
          discoveryResetTimer = null
        }, timeoutMs + 200)
      }
      if (savedHosts.length > 0 && (phase !== 'active' || isDemoMode)) {
        get().connectSavedHost(savedHosts[0])
      }
    },

    applyDiscoveredHosts: (discovered) => {
      if (discoveryResetTimer) {
        clearTimeout(discoveryResetTimer)
        discoveryResetTimer = null
      }
      set({ discoveredHosts: discovered, discoveringLan: false })
      if (discovered.length === 0) return

      const prevSaved = get().savedHosts
      if (prevSaved.length === 0) return

      const discoveredMap = new Map(discovered.map((d) => [d.hostId, d]))
      let latestSaved = prevSaved
      let bestMatch: { updated: SavedHostProfile; prevPrimaryAddr: string | undefined } | null = null

      for (const saved of prevSaved) {
        const announce = discoveredMap.get(saved.hostId)
        if (!announce || announce.addrs.length === 0) continue
        const prevPrimary = saved.addrs[0]
        const res = updateSavedHostAddrs(saved.hostId, announce.addrs, announce.hostName)
        latestSaved = res.hosts
        if (!bestMatch && res.updated) {
          bestMatch = { updated: res.updated, prevPrimaryAddr: prevPrimary }
        }
      }

      if (latestSaved !== prevSaved) {
        set({ savedHosts: latestSaved })
      }

      if (!bestMatch) return
      const state = get()
      if (state.isDemoMode || state.phase === 'active') return

      const newPrimary = bestMatch.updated.addrs[0]
      const addrChanged =
        bestMatch.prevPrimaryAddr !== newPrimary || state.connectingHostAddr !== newPrimary
      const needsImmediateConnect =
        state.phase === 'disconnected' ||
        state.phase === 'closed' ||
        state.hostId !== bestMatch.updated.hostId ||
        addrChanged

      if (needsImmediateConnect) {
        get().connectSavedHost(bestMatch.updated)
      }
    },

    forgetHost: (hostId) => {
      const next = removeHostProfile(hostId)
      if (get().hostId === hostId) {
        ensureClient().disconnect('host_forgotten')
      }
      set({ savedHosts: next })
    },

    disconnect: () => {
      setNativeGyroClutch(false)
      setNativeGyroConfig('off', get().localFeel.gyroSensitivity)
      ensureClient().disconnect('user_disconnect')
      set({ isDemoMode: false, connectingHostAddr: null, voiceLevel: 0 })
    },

    setWorkspaceMode: (mode) => {
      if (mode !== 'pointer') {
        setNativeGyroClutch(false)
        setNativeGyroConfig('off', get().localFeel.gyroSensitivity)
      }
      set({ workspaceMode: mode, gyroGuard: null })
    },

    setPointerTab: (tab) => {
      const nextFeel: LocalFeelPreferences = {
        ...get().localFeel,
        preferredPointerTab: tab,
      }
      saveLocalFeelPreferences(nextFeel)
      set({ pointerTab: tab, localFeel: nextFeel, gyroGuard: null })
    },

    setAirMouseFeel: (feel) => {
      const nextFeel: LocalFeelPreferences = {
        ...get().localFeel,
        airMouseFeel: feel,
      }
      saveLocalFeelPreferences(nextFeel)
      set({ airMouseFeel: feel, localFeel: nextFeel, gyroGuard: null })
    },

    setThemeMode: (mode) => {
      get().updateLocalFeel({ themeMode: mode })
    },

    setActivePage: (pageId) => {
      const { deck } = get()
      if (deck.activePageId === pageId) return
      set({ deck: { ...deck, activePageId: pageId } })
      ensureClient().sendDeckUpdate(get().deckRevision, { activePageId: pageId })
    },

    setPairingOpen: (open) => {
      set({ pairingOpen: open })
      if (open) {
        discoverNativeLanHosts(600)
      }
    },

    setFeelSheetOpen: (open) => set({ feelSheetOpen: open }),

    setAboutSheetOpen: (open) => set({ aboutSheetOpen: open }),

    setPresetWizardOpen: (open) => {
      if (!open && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(PRESET_ONBOARDED_STORAGE_KEY, '1')
        } catch {
          // Ignore storage issues
        }
      }
      set({ presetWizardOpen: open })
    },

    setEmbeddedAirMouseZoneActive: (zoneId, active) => {
      if (active) activeEmbeddedAirMouseZoneIds.add(zoneId)
      else activeEmbeddedAirMouseZoneIds.delete(zoneId)
      const nextActive = activeEmbeddedAirMouseZoneIds.size > 0
      if (get().embeddedAirMouseActive !== nextActive) {
        set({ embeddedAirMouseActive: nextActive })
      }
    },

    applyStarterPreset: (preset, voicePreset) => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(PRESET_ONBOARDED_STORAGE_KEY, '1')
        } catch {
          // Ignore storage issues
        }
      }
      const nextWorkspace: WorkspaceMode = preset === 'daily-remote' ? 'remote' : 'deck'
      const previewDeck = buildDemoPresetDeck(preset, voicePreset)
      const s = get()
      if (s.phase === 'active') {
        const reqId = ensureClient().sendApplyPreset(preset, voicePreset)
        set({
          workspaceMode: nextWorkspace,
          layoutEditing: false,
          presetWizardOpen: false,
        })
        return reqId !== null
      }
      set({
        deck: previewDeck,
        workspaceMode: nextWorkspace,
        layoutEditing: false,
        presetWizardOpen: false,
      })
      return true
    },

    setLayoutEditing: (editing) => {
      if (editing) {
        setNativeGyroClutch(false)
        setNativeGyroConfig('off', get().localFeel.gyroSensitivity)
        const s = get()
        const nextMode: WorkspaceMode =
          s.workspaceMode === 'pointer' ? 'deck' : s.workspaceMode
        // Ensure activePageId matches the visible page when entering edit mode
        let targetPageId = s.deck.activePageId
        if (nextMode === 'remote') {
          const remote =
            s.deck.pages.find((p) => p.layout === 'remote' || p.id === 'classic-remote') ??
            s.deck.pages[0]
          if (remote) targetPageId = remote.id
        } else if (nextMode === 'deck') {
          const gridPages = s.deck.pages.filter(
            (p) => p.layout !== 'remote' && p.id !== 'classic-remote',
          )
          const selectable = gridPages.length > 0 ? gridPages : s.deck.pages
          const active = selectable.find((p) => p.id === s.deck.activePageId) ?? selectable[0]
          if (active) targetPageId = active.id
        }
        set({
          layoutEditing: true,
          workspaceMode: nextMode,
          editingTileTarget: null,
          pageManagerOpen: false,
          gyroGuard: null,
          ...(targetPageId && targetPageId !== s.deck.activePageId
            ? { deck: { ...s.deck, activePageId: targetPageId } }
            : {}),
        })
        if (targetPageId && targetPageId !== s.deck.activePageId) {
          ensureClient().sendDeckUpdate(s.deckRevision, { activePageId: targetPageId })
        }
      } else {
        set({
          layoutEditing: false,
          editingTileTarget: null,
          pageManagerOpen: false,
        })
      }
    },

    openTileEditor: (pageId, zoneId, tileId) => {
      set({ editingTileTarget: { pageId, zoneId, tileId } })
    },

    closeTileEditor: () => {
      set({ editingTileTarget: null })
    },

    setPageManagerOpen: (open) => {
      set({ pageManagerOpen: open })
    },

    updateLocalFeel: (patch) => {
      const merged: LocalFeelPreferences = {
        ...get().localFeel,
        ...patch,
      }
      if (patch.deviceName !== undefined) {
        const cleaned = patch.deviceName.trim().slice(0, 48)
        if (cleaned) {
          merged.deviceName = cleaned
        }
        ensureClient().setDeviceName(merged.deviceName)
      }
      const nextEffectiveTheme = resolveEffectiveTheme(merged.themeMode)
      if (patch.themeMode !== undefined || get().effectiveTheme !== nextEffectiveTheme) {
        applyEffectiveThemeToDocument(nextEffectiveTheme)
      }
      if (patch.screenOrientation !== undefined) {
        setNativeScreenOrientationMode(merged.screenOrientation)
      }
      saveLocalFeelPreferences(merged)
      setKeepScreenOn(get().phase === 'active' && merged.keepScreenOn)
      set({
        localFeel: merged,
        effectiveTheme: nextEffectiveTheme,
        ...(patch.preferredPointerTab ? { pointerTab: patch.preferredPointerTab } : {}),
        ...(patch.airMouseFeel ? { airMouseFeel: patch.airMouseFeel } : {}),
      })
    },

    clearGyroGuard: () => {
      if (gyroGuardTimer) {
        clearTimeout(gyroGuardTimer)
        gyroGuardTimer = null
      }
      set({ gyroGuard: null })
    },

    dismissConflict: () => set({ conflictBanner: null }),
    clearError: () => set({ errorToast: null }),

    submitDeckPatch: (patch) => {
      const { deck, deckRevision } = get()
      const nextPages = patch.pages ? structuredClone(patch.pages) : deck.pages
      const requestedActive = patch.activePageId ?? deck.activePageId
      const validActive = nextPages.some((p) => p.id === requestedActive)
        ? requestedActive
        : (nextPages[0]?.id ?? deck.activePageId)
      const nextDeck: DeckSnapshot = {
        ...deck,
        activePageId: validActive,
        ...(patch.trackpadSplit !== undefined ? { trackpadSplit: patch.trackpadSplit } : {}),
        ...(patch.pointerSensitivity !== undefined
          ? { pointerSensitivity: patch.pointerSensitivity }
          : {}),
        ...(patch.scrollSensitivity !== undefined
          ? { scrollSensitivity: patch.scrollSensitivity }
          : {}),
        pages: nextPages,
      }
      set({ deck: nextDeck })
      ensureClient().sendDeckUpdate(deckRevision, patch)
    },

    updateTile: (pageId, tileId, patch) => {
      const { deck } = get()
      const nextPages = deck.pages.map((p) => {
        if (p.id !== pageId) return p
        return {
          ...p,
          tiles: p.tiles.map((t) => (t.id === tileId ? { ...t, ...patch } : t)),
        }
      })
      get().submitDeckPatch({ pages: nextPages })
    },

    cycleTileSpan: (pageId, tileId) => {
      const { deck } = get()
      const page = deck.pages.find((p) => p.id === pageId)
      const tile = page?.tiles.find((t) => t.id === tileId)
      if (!page || !tile) return
      const nextSpan = cycleBentoSpan(tile.colSpan, tile.rowSpan)
      const zones = normalizePageZones(page)
      const nextPages = deck.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              zones,
              tiles: p.tiles.map((t) => (t.id === tileId ? { ...t, ...nextSpan } : t)),
            }
          : p,
      )
      get().submitDeckPatch({ pages: nextPages })
    },

    deleteTile: (pageId, tileId) => {
      const { deck, editingTileTarget } = get()
      const page = deck.pages.find((p) => p.id === pageId)
      if (!page) return
      const zones = normalizePageZones(page).map((z) => {
        if (z.kind === 'dpad-3x3') {
          return {
            ...z,
            tileIds: normalizeDpadSlotIds(z.tileIds).map((id) => (id === tileId ? '' : id)),
          }
        }
        if (z.kind === 'gesture-pad') {
          return {
            ...z,
            tileIds: normalizeGesturePadSlotIds(z.tileIds).map((id) => (id === tileId ? '' : id)),
          }
        }
        return {
          ...z,
          tileIds: z.tileIds.filter((id) => id !== tileId),
        }
      })
      const nextPages = deck.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              tiles: p.tiles.filter((t) => t.id !== tileId),
              zones,
            }
          : p,
      )
      if (editingTileTarget?.tileId === tileId) {
        set({ editingTileTarget: null })
      }
      get().submitDeckPatch({ pages: nextPages })
    },

    addTileToPage: (pageId, zoneId, slotIndex) => {
      const { deck } = get()
      const page = deck.pages.find((p) => p.id === pageId)
      if (!page) return null
      if (page.tiles.length >= MAX_TILES_PER_PAGE) {
        set({ errorToast: `单页最多支持 ${MAX_TILES_PER_PAGE} 个按键` })
        return null
      }
      const newTile = createNewCustomTile(page.tiles.length + 1)
      const zones = normalizePageZones(page)

      let placed = false
      const nextZones = zones.map((z) => {
        if (zoneId && z.id === zoneId) {
          if (z.kind === 'dpad-3x3' && slotIndex !== undefined && slotIndex >= 0 && slotIndex < 9) {
            const slots = normalizeDpadSlotIds(z.tileIds)
            slots[slotIndex] = newTile.id
            placed = true
            return { ...z, tileIds: slots }
          }
          if (
            z.kind === 'gesture-pad' &&
            slotIndex !== undefined &&
            slotIndex >= 0 &&
            slotIndex < 6
          ) {
            const slots = normalizeGesturePadSlotIds(z.tileIds)
            slots[slotIndex] = newTile.id
            placed = true
            return { ...z, tileIds: slots }
          }
          if (z.kind === 'bento-grid') {
            placed = true
            return { ...z, tileIds: [...z.tileIds, newTile.id] }
          }
        }
        return z
      })

      if (!placed) {
        let lastBentoIdx = -1
        for (let i = nextZones.length - 1; i >= 0; i -= 1) {
          if (nextZones[i].kind === 'bento-grid') {
            lastBentoIdx = i
            break
          }
        }
        if (lastBentoIdx >= 0) {
          nextZones[lastBentoIdx] = {
            ...nextZones[lastBentoIdx],
            tileIds: [...nextZones[lastBentoIdx].tileIds, newTile.id],
          }
        } else if (nextZones.length < MAX_ZONES_PER_PAGE) {
          nextZones.push({
            id: `${page.id}-bento-${nextZones.length + 1}`,
            kind: 'bento-grid',
            columns: page.columns,
            tileIds: [newTile.id],
          })
        } else {
          set({ errorToast: '当前页面无网格区块可放入新按键' })
          return null
        }
      }

      const nextPages = deck.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              tiles: [...p.tiles, newTile],
              zones: nextZones,
            }
          : p,
      )
      get().submitDeckPatch({ pages: nextPages })
      return newTile
    },

    addZoneToPage: (pageId, kind) => {
      const { deck } = get()
      const page = deck.pages.find((p) => p.id === pageId)
      if (!page) return
      const zones = normalizePageZones(page)
      if (zones.length >= MAX_ZONES_PER_PAGE) {
        set({ errorToast: `单页最多支持 ${MAX_ZONES_PER_PAGE} 个区块` })
        return
      }
      const { zone, addedTiles } = createNewZone(page, kind)
      const nextZones = kind === 'pointer-pad' ? [zone, ...zones] : [...zones, zone]
      const nextPages = deck.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              tiles: [...p.tiles, ...addedTiles],
              zones: nextZones,
            }
          : p,
      )
      get().submitDeckPatch({ pages: nextPages })
    },

    updateZone: (pageId, zoneId, patch) => {
      const { deck } = get()
      const page = deck.pages.find((p) => p.id === pageId)
      if (!page) return
      const zones = normalizePageZones(page)
      const nextZones = zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z))
      const bentoCount = nextZones.filter((z) => z.kind === 'bento-grid').length
      const nextColumns =
        patch.columns && bentoCount === 1 ? patch.columns : page.columns
      const nextPages = deck.pages.map((p) =>
        p.id === pageId ? { ...p, columns: nextColumns, zones: nextZones } : p,
      )
      get().submitDeckPatch({ pages: nextPages })
    },

    moveZone: (pageId, zoneId, dir) => {
      const { deck } = get()
      const page = deck.pages.find((p) => p.id === pageId)
      if (!page) return
      const zones = normalizePageZones(page)
      const idx = zones.findIndex((z) => z.id === zoneId)
      const targetIdx = idx + dir
      if (idx < 0 || targetIdx < 0 || targetIdx >= zones.length) return
      const nextZones = [...zones]
      const [moved] = nextZones.splice(idx, 1)
      nextZones.splice(targetIdx, 0, moved)
      const nextPages = deck.pages.map((p) => (p.id === pageId ? { ...p, zones: nextZones } : p))
      get().submitDeckPatch({ pages: nextPages })
    },

    deleteZone: (pageId, zoneId) => {
      const { deck, editingTileTarget } = get()
      const page = deck.pages.find((p) => p.id === pageId)
      if (!page) return
      const zones = normalizePageZones(page)
      if (zones.length <= 1) {
        set({ errorToast: '每页至少保留一个区块' })
        return
      }
      const nextZones = zones.filter((z) => z.id !== zoneId)
      const retainedIds = new Set(nextZones.flatMap((z) => z.tileIds.filter(Boolean)))
      const removedZone = zones.find((z) => z.id === zoneId)
      const removedIds = new Set(removedZone?.tileIds.filter(Boolean) ?? [])
      const nextTiles = page.tiles.filter(
        (t) => !removedIds.has(t.id) || retainedIds.has(t.id),
      )
      if (editingTileTarget && editingTileTarget.zoneId === zoneId) {
        set({ editingTileTarget: null })
      }
      const nextPages = deck.pages.map((p) =>
        p.id === pageId ? { ...p, tiles: nextTiles, zones: nextZones } : p,
      )
      get().submitDeckPatch({ pages: nextPages })
    },

    updatePageZonesOrder: (pageId, nextZones) => {
      const { deck } = get()
      const nextPages = deck.pages.map((p) =>
        p.id === pageId ? { ...p, zones: nextZones } : p,
      )
      get().submitDeckPatch({ pages: nextPages })
    },

    addPageFromTemplate: (template, customName) => {
      const { deck } = get()
      const newPage = createPageFromTemplate(template, deck.pages.length + 1, customName)
      const nextPages = [...deck.pages, newPage]
      const nextWorkspace: WorkspaceMode =
        newPage.layout === 'remote' && deck.pages.every((p) => p.layout !== 'remote' && p.id !== 'classic-remote')
          ? 'remote'
          : 'deck'
      set({ workspaceMode: nextWorkspace, pageManagerOpen: false })
      get().submitDeckPatch({ pages: nextPages, activePageId: newPage.id })
      return newPage
    },

    renamePage: (pageId, name) => {
      const cleaned = name.trim().slice(0, 24)
      if (!cleaned) return
      const { deck } = get()
      const nextPages = deck.pages.map((p) => (p.id === pageId ? { ...p, name: cleaned } : p))
      get().submitDeckPatch({ pages: nextPages })
    },

    deletePage: (pageId) => {
      const { deck } = get()
      if (deck.pages.length <= 1) {
        set({ errorToast: '至少保留一个控制页面' })
        return
      }
      const nextPages = deck.pages.filter((p) => p.id !== pageId)
      const nextActive =
        deck.activePageId === pageId ? nextPages[0].id : deck.activePageId
      set({ editingTileTarget: null })
      get().submitDeckPatch({ pages: nextPages, activePageId: nextActive })
    },

    updateSensitivity: (patch) => {
      const { deck, deckRevision } = get()
      const nextDeck: DeckSnapshot = {
        ...deck,
        ...(patch.pointerSensitivity !== undefined
          ? { pointerSensitivity: patch.pointerSensitivity }
          : {}),
        ...(patch.scrollSensitivity !== undefined
          ? { scrollSensitivity: patch.scrollSensitivity }
          : {}),
      }
      set({ deck: nextDeck })
      ensureClient().sendDeckUpdate(deckRevision, patch)
    },

    sendText: (text, mode, submit) => {
      const reqId = ensureClient().sendTextCommit(text, mode, submit)
      return reqId !== null
    },

    getClient: () => ensureClient(),
  }
})

function syncVolumeKeyCaptureWithStore(state: MobileStoreState): void {
  const shouldCapture = computeShouldCaptureVolumeKeys(state)
  const mode = state.localFeel.volumeKeyMouseMode
  if (shouldCapture === lastVolCaptureActive && mode === lastVolCaptureMode) return
  if (!shouldCapture || mode !== lastVolCaptureMode) {
    releaseHeldVolumeKeyButtons(singletonClient)
  }
  lastVolCaptureActive = shouldCapture
  lastVolCaptureMode = mode
  setNativeVolumeKeyMouseConfig(shouldCapture, mode)
}

useMobileStore.subscribe((state) => {
  syncVolumeKeyCaptureWithStore(state)
})

export function registerPendingTileRequest(requestId: string | null, tileId: string): void {
  if (requestId) {
    pendingTileReqMap.set(requestId, tileId)
  }
}
