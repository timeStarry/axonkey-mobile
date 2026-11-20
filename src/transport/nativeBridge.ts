import type { PairingOfferQr } from '../protocol/types'

export interface SavedHostProfile {
  hostId: string
  hostName: string
  addrs: string[]
  caCertDerB64: string
  peerId: string
  peerToken: string
  lastConnectedAt: number
}

interface AxonkeyAndroidBridge {
  haptic(kind: 'tap' | 'confirm' | 'error' | 'heavy'): void
  setKeepScreenOn(enabled: boolean): void
  openQrScanner(): void
  connectWss(url: string, hostId: string, caCertDerB64: string, subprotocol: string): void
  sendWssText(payload: string): boolean
  closeWss(reason: string): void
  saveHostCredentials(json: string): void
  loadHostCredentials(): string
  deleteHostCredentials(hostId: string): void
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
  }
}

const FALLBACK_STORAGE_KEY = 'axonkey_mobile_saved_hosts_v1'

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && typeof window.AxonkeyNative !== 'undefined'
}

export function triggerHaptic(kind: 'tap' | 'confirm' | 'error' | 'heavy' = 'tap'): void {
  if (typeof window === 'undefined') return
  if (window.AxonkeyNative) {
    window.AxonkeyNative.haptic(kind)
    return
  }
  if ('vibrate' in navigator) {
    const pattern =
      kind === 'tap' ? 10 : kind === 'confirm' ? [12, 35, 14] : kind === 'heavy' ? 22 : [25, 40, 25]
    navigator.vibrate(pattern)
  }
}

export function setKeepScreenOn(enabled: boolean): void {
  if (typeof window !== 'undefined' && window.AxonkeyNative) {
    window.AxonkeyNative.setKeepScreenOn(enabled)
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
