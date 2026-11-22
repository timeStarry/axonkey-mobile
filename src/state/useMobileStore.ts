import { create } from 'zustand'
import type {
  DeckLayoutPatch,
  DeckSnapshot,
  DiscoveredLanHost,
  ForegroundContext,
  GyroGuardKind,
  HostCapabilities,
  PairingOfferQr,
  SessionPhase,
  TextCommitMode,
} from '../protocol/types'
import { DEFAULT_DEMO_DECK } from '../transport/defaultDeck'
import {
  discoverNativeLanHosts,
  loadLocalFeelPreferences,
  loadSavedHosts,
  parseDiscoveredLanHosts,
  removeHostProfile,
  saveHostProfile,
  saveLocalFeelPreferences,
  setHapticsEnabled,
  setKeepScreenOn,
  setNativeGyroClutch,
  setNativeGyroConfig,
  triggerHaptic,
  updateSavedHostAddrs,
  type LocalFeelPreferences,
  type SavedHostProfile,
} from '../transport/nativeBridge'
import {
  DemoLoopbackTransport,
  MobileSessionClient,
  NativeWssTransport,
} from '../transport/sessionClient'

export type WorkspaceMode = 'remote' | 'deck' | 'pointer'
export type PointerSubMode = 'trackpad' | 'relative' | 'absolute'

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
  pointerSubMode: PointerSubMode
  localFeel: LocalFeelPreferences
  pairingOpen: boolean
  feelSheetOpen: boolean

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
  setPointerSubMode: (subMode: PointerSubMode) => void
  setActivePage: (pageId: string) => void
  setPairingOpen: (open: boolean) => void
  setFeelSheetOpen: (open: boolean) => void
  updateLocalFeel: (patch: Partial<LocalFeelPreferences>) => void
  clearGyroGuard: () => void
  dismissConflict: () => void
  clearError: () => void

  submitDeckPatch: (patch: DeckLayoutPatch) => void
  updateSensitivity: (patch: { pointerSensitivity?: number; scrollSensitivity?: number }) => void
  sendText: (text: string, mode: TextCommitMode, submit: boolean) => boolean
  getClient: () => MobileSessionClient
}

const pendingTileReqMap = new Map<string, string>()

let singletonClient: MobileSessionClient | null = null
let listenersBound = false
let discoveryResetTimer: ReturnType<typeof setTimeout> | null = null
let gyroGuardTimer: ReturnType<typeof setTimeout> | null = null

function buildNativeTransportFactory() {
  return (host: SavedHostProfile, attempt = 0) => {
    const addrs = host.addrs.length > 0 ? host.addrs : ['127.0.0.1:49670']
    const addr = addrs[attempt % addrs.length]
    return new NativeWssTransport(`wss://${addr}/ws`, host.hostId, host.caCertDerB64)
  }
}

export const useMobileStore = create<MobileStoreState>((set, get) => {
  const initialFeel = loadLocalFeelPreferences()
  setHapticsEnabled(initialFeel.hapticsEnabled)

  const ensureClient = (): MobileSessionClient => {
    if (singletonClient) return singletonClient
    singletonClient = new MobileSessionClient({
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
        set({
          savedHosts: nextHosts,
          pairingOpen: false,
          connectingHostAddr: host.addrs[0] ?? null,
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
    })
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
    pointerSubMode: initialFeel.preferredPointerSubMode,
    localFeel: initialFeel,
    pairingOpen: false,
    feelSheetOpen: false,

    voiceLevel: 0,
    gyroGuard: null,

    conflictBanner: null,
    errorToast: null,
    tileFeedback: {},
    textDelivery: null,

    init: () => {
      const feel = loadLocalFeelPreferences()
      const hosts = loadSavedHosts()
      set({
        savedHosts: hosts,
        localFeel: feel,
        pointerSubMode: feel.preferredPointerSubMode,
      })
      const client = ensureClient()

      if (typeof window !== 'undefined' && !listenersBound) {
        listenersBound = true

        const handlePause = () => {
          setNativeGyroClutch(false)
          setNativeGyroConfig('off', get().localFeel.gyroSensitivity)
          set({ voiceLevel: 0 })
          client.handleVisibilityHidden()
        }

        const handleResume = () => {
          client.handleVisibilityVisible()
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

    setPointerSubMode: (subMode) => {
      const nextFeel: LocalFeelPreferences = {
        ...get().localFeel,
        preferredPointerSubMode: subMode,
      }
      saveLocalFeelPreferences(nextFeel)
      set({ pointerSubMode: subMode, localFeel: nextFeel, gyroGuard: null })
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

    updateLocalFeel: (patch) => {
      const next: LocalFeelPreferences = {
        ...get().localFeel,
        ...patch,
      }
      saveLocalFeelPreferences(next)
      setKeepScreenOn(get().phase === 'active' && next.keepScreenOn)
      set({
        localFeel: next,
        ...(patch.preferredPointerSubMode
          ? { pointerSubMode: patch.preferredPointerSubMode }
          : {}),
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
      const { deckRevision } = get()
      ensureClient().sendDeckUpdate(deckRevision, patch)
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

export function registerPendingTileRequest(requestId: string | null, tileId: string): void {
  if (requestId) {
    pendingTileReqMap.set(requestId, tileId)
  }
}
