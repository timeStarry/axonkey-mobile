import type { DiscoveredLanHost, GyroMode, PairingOfferQr } from '../protocol/types'

export interface SavedHostProfile {
  hostId: string
  hostName: string
  addrs: string[]
  caCertDerB64: string
  peerId: string
  peerToken: string
  lastConnectedAt: number
}

export type HapticKind =
  | 'tap'
  | 'confirm'
  | 'error'
  | 'heavy'
  | 'voiceStart'
  | 'voiceStop'
  | 'recenter'

export interface LocalFeelPreferences {
  gyroSensitivity: number
  preferredPointerSubMode: 'trackpad' | 'relative' | 'absolute'
  hapticsEnabled: boolean
  keepScreenOn: boolean
  preferredDockMode: 'voice' | 'text'
}

export interface AxonkeyAndroidBridge {
  haptic(kind: string): void
  setKeepScreenOn(enabled: boolean): void
  openQrScanner(): void
  connectWss(url: string, hostId: string, caCertDerB64: string, subprotocol: string): void
  sendWssText(payload: string): boolean
  closeWss(reason: string): void
  startAudioCapture?(): boolean
  stopAudioCapture?(): void
  saveHostCredentials(json: string): void
  loadHostCredentials(): string
  deleteHostCredentials(hostId: string): void

  // Protocol v2 native arbiter, pointer fast-path, dual-mode gyro, voice & LAN discovery
  syncSessionAuth?(
    sessionId: string,
    inputEpoch: number,
    inputGeneration: number,
    leaseId: number,
  ): void
  sendControlFrame?(jsonPayload: string): boolean
  sendPointerDelta?(dx: number, dy: number): void
  flushPointerDelta?(): void
  setGyroConfig?(mode: GyroMode, sensitivity: number): void
  setGyroClutch?(engaged: boolean): void
  recenterGyro?(): void
  startVoiceStream?(requestId: string): number
  stopVoiceStream?(streamId: number, requestId: string): void
  cancelVoiceStream?(streamId: number, reason: string): void
  discoverLanHosts?(timeoutMs: number): void
}

declare global {
  interface Window {
    AxonkeyNative?: AxonkeyAndroidBridge
    __axonkeyNativeOnOpen?: () => void
    __axonkeyNativeOnMessage?: (text: string) => void
    __axonkeyNativeOnClose?: (code: number, reason: string) => void
    __axonkeyNativeOnError?: (message: string) => void
    __axonkeyNativeOnQrScanned?: (raw: string) => void
    __axonkeyNativeOnLifecycle?: (state: 'paused' | 'resumed') => void
    __axonkeyNativeOnVoiceLevel?: (level: number) => void
    __axonkeyNativeOnGyroState?: (state: string) => void
    __axonkeyNativeOnHostsDiscovered?: (jsonArray: string) => void
  }
}

const FALLBACK_STORAGE_KEY = 'axonkey_mobile_saved_hosts_v1'
const LOCAL_FEEL_STORAGE_KEY = 'axonkey_mobile_local_feel_v2'

export const DEFAULT_LOCAL_FEEL: LocalFeelPreferences = {
  gyroSensitivity: 1.2,
  preferredPointerSubMode: 'trackpad',
  hapticsEnabled: true,
  keepScreenOn: true,
  preferredDockMode: 'voice',
}

let hapticsEnabledRuntime = true

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabledRuntime = enabled
}

export function loadLocalFeelPreferences(): LocalFeelPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_LOCAL_FEEL }
  try {
    const raw = window.localStorage.getItem(LOCAL_FEEL_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LOCAL_FEEL }
    const parsed = JSON.parse(raw) as Partial<LocalFeelPreferences>
    const prefs: LocalFeelPreferences = {
      gyroSensitivity:
        typeof parsed.gyroSensitivity === 'number' && Number.isFinite(parsed.gyroSensitivity)
          ? Math.min(5.0, Math.max(0.2, parsed.gyroSensitivity))
          : DEFAULT_LOCAL_FEEL.gyroSensitivity,
      preferredPointerSubMode:
        parsed.preferredPointerSubMode === 'relative' ||
        parsed.preferredPointerSubMode === 'absolute' ||
        parsed.preferredPointerSubMode === 'trackpad'
          ? parsed.preferredPointerSubMode
          : DEFAULT_LOCAL_FEEL.preferredPointerSubMode,
      hapticsEnabled:
        typeof parsed.hapticsEnabled === 'boolean'
          ? parsed.hapticsEnabled
          : DEFAULT_LOCAL_FEEL.hapticsEnabled,
      keepScreenOn:
        typeof parsed.keepScreenOn === 'boolean'
          ? parsed.keepScreenOn
          : DEFAULT_LOCAL_FEEL.keepScreenOn,
      preferredDockMode:
        parsed.preferredDockMode === 'text' || parsed.preferredDockMode === 'voice'
          ? parsed.preferredDockMode
          : DEFAULT_LOCAL_FEEL.preferredDockMode,
    }
    hapticsEnabledRuntime = prefs.hapticsEnabled
    return prefs
  } catch {
    return { ...DEFAULT_LOCAL_FEEL }
  }
}

export function saveLocalFeelPreferences(prefs: LocalFeelPreferences): void {
  hapticsEnabledRuntime = prefs.hapticsEnabled
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_FEEL_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore storage quota issues in restricted WebView environments.
  }
}

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && typeof window.AxonkeyNative !== 'undefined'
}

export function hasNativeControlArbiter(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.AxonkeyNative?.sendControlFrame === 'function'
  )
}

export function hasNativeBinaryPointer(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.AxonkeyNative?.sendPointerDelta === 'function'
  )
}

export function hasNativeVoiceStream(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.AxonkeyNative?.startVoiceStream === 'function'
  )
}

export function triggerHaptic(kind: HapticKind = 'tap'): void {
  if (!hapticsEnabledRuntime || typeof window === 'undefined') return
  if (window.AxonkeyNative) {
    window.AxonkeyNative.haptic(kind)
    return
  }
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    const pattern =
      kind === 'tap' || kind === 'voiceStop'
        ? 8
        : kind === 'voiceStart'
          ? 15
          : kind === 'confirm'
            ? [10, 30, 12]
            : kind === 'recenter'
              ? [12, 24, 12]
              : kind === 'heavy'
                ? 20
                : [25, 40, 25]
    navigator.vibrate(pattern)
  }
}

export function setKeepScreenOn(enabled: boolean): void {
  if (typeof window !== 'undefined' && window.AxonkeyNative) {
    window.AxonkeyNative.setKeepScreenOn(enabled)
  }
}

export function syncNativeSessionAuth(
  sessionId: string,
  inputEpoch: number,
  inputGeneration: number,
  leaseId: number,
): void {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.syncSessionAuth === 'function') {
    window.AxonkeyNative.syncSessionAuth(sessionId, inputEpoch, inputGeneration, leaseId)
  }
}

export function clearNativeSessionAuth(): void {
  syncNativeSessionAuth('', 0, 0, 0)
}

export function sendNativeControlFrame(jsonPayload: string): boolean {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.sendControlFrame === 'function') {
    return window.AxonkeyNative.sendControlFrame(jsonPayload)
  }
  return false
}

export function sendNativePointerDelta(dx: number, dy: number): boolean {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.sendPointerDelta === 'function') {
    window.AxonkeyNative.sendPointerDelta(dx, dy)
    return true
  }
  return false
}

export function flushNativePointerDelta(): void {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.flushPointerDelta === 'function') {
    window.AxonkeyNative.flushPointerDelta()
  }
}

export function setNativeGyroConfig(mode: GyroMode, sensitivity: number): void {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.setGyroConfig === 'function') {
    window.AxonkeyNative.setGyroConfig(mode, Math.min(5.0, Math.max(0.2, sensitivity)))
  }
}

export function setNativeGyroClutch(engaged: boolean): void {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.setGyroClutch === 'function') {
    window.AxonkeyNative.setGyroClutch(engaged)
  }
}

export function recenterNativeGyro(): void {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.recenterGyro === 'function') {
    window.AxonkeyNative.recenterGyro()
  } else {
    triggerHaptic('recenter')
  }
}

export function startNativeVoiceStream(requestId: string): number {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.startVoiceStream === 'function') {
    return window.AxonkeyNative.startVoiceStream(requestId)
  }
  return 0
}

export function stopNativeVoiceStream(streamId: number, requestId: string): void {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.stopVoiceStream === 'function') {
    window.AxonkeyNative.stopVoiceStream(streamId, requestId)
  }
}

export function cancelNativeVoiceStream(streamId: number, reason: string): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.cancelVoiceStream === 'function'
  ) {
    window.AxonkeyNative.cancelVoiceStream(streamId, reason)
  }
}

export function discoverNativeLanHosts(timeoutMs = 600): boolean {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.discoverLanHosts === 'function') {
    window.AxonkeyNative.discoverLanHosts(timeoutMs)
    return true
  }
  return false
}

export function parseDiscoveredLanHosts(raw: string): DiscoveredLanHost[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: DiscoveredLanHost[] = []
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof item.hostId === 'string' &&
        item.hostId.length > 0 &&
        Array.isArray(item.addrs)
      ) {
        const addrs = item.addrs.filter((a: unknown): a is string => typeof a === 'string' && a.length > 0)
        if (addrs.length > 0) {
          out.push({
            hostId: item.hostId,
            hostName: typeof item.hostName === 'string' && item.hostName ? item.hostName : 'Axonkey PC',
            port: typeof item.port === 'number' ? item.port : 0,
            addrs,
          })
        }
      }
    }
    return out
  } catch {
    return []
  }
}

export function startNativeAudioCapture(): boolean {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.startAudioCapture === 'function') {
    return window.AxonkeyNative.startAudioCapture()
  }
  return false
}

export function stopNativeAudioCapture(): void {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.stopAudioCapture === 'function') {
    window.AxonkeyNative.stopAudioCapture()
  }
}

export function requestNativeQrScan(onScanned: (raw: string) => void): boolean {
  if (typeof window === 'undefined' || !window.AxonkeyNative) return false
  window.__axonkeyNativeOnQrScanned = (raw: string) => {
    onScanned(raw)
  }
  window.AxonkeyNative.openQrScanner()
  return true
}

export function loadSavedHosts(): SavedHostProfile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.AxonkeyNative
      ? window.AxonkeyNative.loadHostCredentials()
      : window.localStorage.getItem(FALLBACK_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHostProfile(profile: SavedHostProfile): SavedHostProfile[] {
  const existing = loadSavedHosts().filter((h) => h.hostId !== profile.hostId)
  const next = [profile, ...existing].slice(0, 8)
  const raw = JSON.stringify(next)
  if (typeof window !== 'undefined') {
    if (window.AxonkeyNative) {
      window.AxonkeyNative.saveHostCredentials(raw)
    } else {
      window.localStorage.setItem(FALLBACK_STORAGE_KEY, raw)
    }
  }
  return next
}

export function updateSavedHostAddrs(
  hostId: string,
  addrs: string[],
  hostName?: string,
): { hosts: SavedHostProfile[]; updated: SavedHostProfile | null } {
  const existing = loadSavedHosts()
  let updated: SavedHostProfile | null = null
  const next = existing.map((h) => {
    if (h.hostId !== hostId) return h
    updated = {
      ...h,
      addrs: addrs.length > 0 ? addrs : h.addrs,
      hostName: hostName && hostName.trim() ? hostName.trim() : h.hostName,
    }
    return updated
  })
  if (updated && typeof window !== 'undefined') {
    const raw = JSON.stringify(next)
    if (window.AxonkeyNative) {
      window.AxonkeyNative.saveHostCredentials(raw)
    } else {
      window.localStorage.setItem(FALLBACK_STORAGE_KEY, raw)
    }
  }
  return { hosts: next, updated }
}

export function removeHostProfile(hostId: string): SavedHostProfile[] {
  const next = loadSavedHosts().filter((h) => h.hostId !== hostId)
  if (typeof window !== 'undefined') {
    if (window.AxonkeyNative) {
      window.AxonkeyNative.deleteHostCredentials(hostId)
    } else {
      window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(next))
    }
  }
  return next
}

export function parsePairingQr(raw: string): PairingOfferQr {
  const trimmed = raw.trim()
  const jsonText = trimmed.startsWith('axonkey://pair?')
    ? decodeURIComponent(new URL(trimmed).searchParams.get('data') ?? '')
    : trimmed
  const parsed = JSON.parse(jsonText) as Partial<PairingOfferQr>
  if (
    parsed.v !== 1 ||
    typeof parsed.hostId !== 'string' ||
    !parsed.hostId ||
    typeof parsed.hostName !== 'string' ||
    !Array.isArray(parsed.addrs) ||
    parsed.addrs.length === 0 ||
    typeof parsed.caCertDerB64 !== 'string' ||
    typeof parsed.pairToken !== 'string' ||
    parsed.pairToken.length < 32
  ) {
    throw new Error('无效的 Axonkey 配对二维码格式')
  }
  return parsed as PairingOfferQr
}
