import type {
  AirMouseHandedness,
  DiscoveredLanHost,
  GyroMode,
  PairingOfferQr,
  ScreenOrientationMode,
  VoiceTriggerMode,
  VolumeKeyMouseMode,
} from '../protocol/types'

export type { AirMouseHandedness, ScreenOrientationMode, VoiceTriggerMode, VolumeKeyMouseMode }

export interface AppVersionInfo {
  versionName: string
  versionCode: number
  packageName: string
}

export type GithubReleaseCheckResult =
  | {
      ok: true
      tagName: string
      version: string
      title: string
      notes: string
      publishedAt: string
      htmlUrl: string
      apkUrl: string
      apkName: string
      apkSizeBytes: number
      sha256: string
    }
  | {
      ok: false
      code: 'no_release' | 'network_error' | string
      error: string
    }

export interface ApkUpdateProgressEvent {
  phase:
    | 'downloading'
    | 'verifying'
    | 'ready'
    | 'installing'
    | 'permission_required'
    | 'error'
  percent: number
  downloaded: number
  total: number
  message?: string
}

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
  | 'detent'
  | 'confirm'
  | 'error'
  | 'heavy'
  | 'voiceStart'
  | 'voiceStop'
  | 'recenter'

export type ThemeMode = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'
export type PointerTabMode = 'trackpad' | 'airmouse'
export type AirMouseFeelMode = 'relative' | 'laser'

export interface LocalFeelPreferences {
  deviceName: string
  themeMode: ThemeMode
  gyroSensitivity: number
  preferredPointerTab: PointerTabMode
  airMouseFeel: AirMouseFeelMode
  airMouseHandedness: AirMouseHandedness
  volumeKeyMouseMode: VolumeKeyMouseMode
  screenOrientation: ScreenOrientationMode
  airMousePadTapClick: boolean
  threeFingerSystemGestures: boolean
  hapticsEnabled: boolean
  soundEnabled: boolean
  keepScreenOn: boolean
  voiceTriggerMode: VoiceTriggerMode
  preferredDockMode: 'voice' | 'text'
}

export interface AxonkeyAndroidBridge {
  haptic(kind: string): void
  playClickSound?(kind: string): void
  getDefaultDeviceName?(): string
  isSystemDarkMode?(): boolean
  setSystemBarTheme?(isDark: boolean): void
  setBackInterceptEnabled?(enabled: boolean): void
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
  recenterCursor?(): boolean
  startVoiceStream?(requestId: string): number
  stopVoiceStream?(streamId: number, requestId: string): void
  cancelVoiceStream?(streamId: number, reason: string): void
  discoverLanHosts?(timeoutMs: number): void

  // v4 ergonomics, orientation, hardware volume-key mouse, click stabilizer & in-app APK updater
  setVolumeKeyMouseConfig?(active: boolean, mode: string): void
  notifyPointerClickPulse?(): void
  setScreenOrientationMode?(mode: string): void
  getAppVersionInfo?(): string
  openExternalUrl?(url: string): boolean
  checkGithubRelease?(repoSlug: string): void
  downloadAndInstallApk?(url: string, expectedSha256: string, version: string): void
  installDownloadedApk?(): boolean
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
    __axonkeyNativeOnBack?: () => void
    __axonkeyNativeOnSystemDarkChanged?: (isDark: boolean) => void
    __axonkeyNativeOnVolumeKey?: (
      key: 'up' | 'down',
      phase: 'down' | 'up' | 'repeat',
    ) => void
    __axonkeyNativeOnUpdateRelease?: (jsonString: string) => void
    __axonkeyNativeOnUpdateProgress?: (jsonString: string) => void
  }
}

const FALLBACK_STORAGE_KEY = 'axonkey_mobile_saved_hosts_v1'
const LOCAL_FEEL_STORAGE_KEY = 'axonkey_mobile_local_feel_v2'

export function getDefaultPhoneName(): string {
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.getDefaultDeviceName === 'function'
  ) {
    try {
      const hw = window.AxonkeyNative.getDefaultDeviceName()?.trim()
      if (hw) return hw.slice(0, 48)
    } catch {
      // Fallback below
    }
  }
  return 'Axonkey 手机遥控'
}

export const DEFAULT_LOCAL_FEEL: LocalFeelPreferences = {
  deviceName: getDefaultPhoneName(),
  themeMode: 'system',
  gyroSensitivity: 1.2,
  preferredPointerTab: 'trackpad',
  airMouseFeel: 'relative',
  airMouseHandedness: 'right',
  volumeKeyMouseMode: 'off',
  screenOrientation: 'portrait',
  airMousePadTapClick: true,
  threeFingerSystemGestures: true,
  hapticsEnabled: true,
  soundEnabled: false,
  keepScreenOn: true,
  voiceTriggerMode: 'hold',
  preferredDockMode: 'voice',
}

let hapticsEnabledRuntime = true
let soundEnabledRuntime = false
let voiceRecordingRuntime = false
let webAudioCtx: AudioContext | null = null

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabledRuntime = enabled
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabledRuntime = enabled
}

export function setVoiceRecordingActive(active: boolean): void {
  voiceRecordingRuntime = active
}

interface LegacyStoredFeel extends Partial<LocalFeelPreferences> {
  preferredPointerSubMode?: 'trackpad' | 'relative' | 'absolute'
}

export function loadLocalFeelPreferences(): LocalFeelPreferences {
  const defaultName = getDefaultPhoneName()
  if (typeof window === 'undefined') return { ...DEFAULT_LOCAL_FEEL, deviceName: defaultName }
  try {
    const raw = window.localStorage.getItem(LOCAL_FEEL_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LOCAL_FEEL, deviceName: defaultName }
    const parsed = JSON.parse(raw) as LegacyStoredFeel
    const rawName = typeof parsed.deviceName === 'string' ? parsed.deviceName.trim() : ''

    const legacySubMode = parsed.preferredPointerSubMode
    const preferredPointerTab: PointerTabMode =
      parsed.preferredPointerTab === 'trackpad' || parsed.preferredPointerTab === 'airmouse'
        ? parsed.preferredPointerTab
        : legacySubMode === 'relative' || legacySubMode === 'absolute'
          ? 'airmouse'
          : DEFAULT_LOCAL_FEEL.preferredPointerTab

    const airMouseFeel: AirMouseFeelMode =
      parsed.airMouseFeel === 'relative' || parsed.airMouseFeel === 'laser'
        ? parsed.airMouseFeel
        : legacySubMode === 'absolute'
          ? 'laser'
          : DEFAULT_LOCAL_FEEL.airMouseFeel

    const prefs: LocalFeelPreferences = {
      deviceName: rawName.length > 0 ? rawName.slice(0, 48) : defaultName,
      themeMode:
        parsed.themeMode === 'light' || parsed.themeMode === 'dark' || parsed.themeMode === 'system'
          ? parsed.themeMode
          : DEFAULT_LOCAL_FEEL.themeMode,
      gyroSensitivity:
        typeof parsed.gyroSensitivity === 'number' && Number.isFinite(parsed.gyroSensitivity)
          ? Math.min(5.0, Math.max(0.2, parsed.gyroSensitivity))
          : DEFAULT_LOCAL_FEEL.gyroSensitivity,
      preferredPointerTab,
      airMouseFeel,
      airMouseHandedness:
        parsed.airMouseHandedness === 'left' || parsed.airMouseHandedness === 'right'
          ? parsed.airMouseHandedness
          : DEFAULT_LOCAL_FEEL.airMouseHandedness,
      volumeKeyMouseMode:
        parsed.volumeKeyMouseMode === 'off' ||
        parsed.volumeKeyMouseMode === 'lr' ||
        parsed.volumeKeyMouseMode === 'rl' ||
        parsed.volumeKeyMouseMode === 'scroll'
          ? parsed.volumeKeyMouseMode
          : DEFAULT_LOCAL_FEEL.volumeKeyMouseMode,
      screenOrientation:
        parsed.screenOrientation === 'portrait' ||
        parsed.screenOrientation === 'landscape' ||
        parsed.screenOrientation === 'system'
          ? parsed.screenOrientation
          : DEFAULT_LOCAL_FEEL.screenOrientation,
      airMousePadTapClick:
        typeof parsed.airMousePadTapClick === 'boolean'
          ? parsed.airMousePadTapClick
          : DEFAULT_LOCAL_FEEL.airMousePadTapClick,
      threeFingerSystemGestures:
        typeof parsed.threeFingerSystemGestures === 'boolean'
          ? parsed.threeFingerSystemGestures
          : DEFAULT_LOCAL_FEEL.threeFingerSystemGestures,
      hapticsEnabled:
        typeof parsed.hapticsEnabled === 'boolean'
          ? parsed.hapticsEnabled
          : DEFAULT_LOCAL_FEEL.hapticsEnabled,
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_LOCAL_FEEL.soundEnabled,
      keepScreenOn:
        typeof parsed.keepScreenOn === 'boolean'
          ? parsed.keepScreenOn
          : DEFAULT_LOCAL_FEEL.keepScreenOn,
      voiceTriggerMode:
        parsed.voiceTriggerMode === 'hold' ||
        parsed.voiceTriggerMode === 'toggle' ||
        parsed.voiceTriggerMode === 'hybrid'
          ? parsed.voiceTriggerMode
          : DEFAULT_LOCAL_FEEL.voiceTriggerMode,
      preferredDockMode:
        parsed.preferredDockMode === 'text' || parsed.preferredDockMode === 'voice'
          ? parsed.preferredDockMode
          : DEFAULT_LOCAL_FEEL.preferredDockMode,
    }
    hapticsEnabledRuntime = prefs.hapticsEnabled
    soundEnabledRuntime = prefs.soundEnabled
    return prefs
  } catch {
    return { ...DEFAULT_LOCAL_FEEL }
  }
}

export function querySystemDarkMode(): boolean {
  if (typeof window === 'undefined') return true
  if (typeof window.AxonkeyNative?.isSystemDarkMode === 'function') {
    try {
      return Boolean(window.AxonkeyNative.isSystemDarkMode())
    } catch {
      // Fall through to matchMedia
    }
  }
  if (typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      return true
    }
  }
  return true
}

export function resolveEffectiveTheme(
  mode: ThemeMode,
  systemIsDark = querySystemDarkMode(),
): EffectiveTheme {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  return systemIsDark ? 'dark' : 'light'
}

export function applyEffectiveThemeToDocument(theme: EffectiveTheme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#141518' : '#f2f2f6')
    }
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.setSystemBarTheme === 'function'
  ) {
    try {
      window.AxonkeyNative.setSystemBarTheme(theme === 'dark')
    } catch {
      // Ignore bridge errors in restricted test mocks
    }
  }
}

export function setNativeBackIntercept(enabled: boolean): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.setBackInterceptEnabled === 'function'
  ) {
    try {
      window.AxonkeyNative.setBackInterceptEnabled(enabled)
    } catch {
      // Ignore bridge errors in restricted test mocks
    }
  }
}

export function saveLocalFeelPreferences(prefs: LocalFeelPreferences): void {
  hapticsEnabledRuntime = prefs.hapticsEnabled
  soundEnabledRuntime = prefs.soundEnabled
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

function playWebClickFallback(kind: HapticKind): void {
  if (typeof window === 'undefined') return
  const AudioCtx =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return
  try {
    if (!webAudioCtx) {
      webAudioCtx = new AudioCtx()
    }
    if (webAudioCtx.state === 'suspended') {
      void webAudioCtx.resume()
    }
    const sr = webAudioCtx.sampleRate || 48000
    const dur =
      kind === 'detent' ? 0.01 : kind === 'confirm' || kind === 'recenter' ? 0.026 : kind === 'heavy' ? 0.022 : 0.015
    const n = Math.max(32, Math.round(sr * dur))
    const buf = webAudioCtx.createBuffer(1, n, sr)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < n; i += 1) {
      const t = i / sr
      let v = 0
      if (kind === 'detent') {
        v =
          (Math.min(i, 8) / 8) *
          Math.exp(-t / 0.0012) *
          (0.55 * Math.sin(2 * Math.PI * 2850 * t) + 0.45 * Math.sin(2 * Math.PI * 5200 * t)) *
          0.76
      } else if (kind === 'confirm' || kind === 'recenter') {
        const w1 = Math.exp(-t / 0.0016) * Math.sin(2 * Math.PI * 2400 * t) * 0.68
        const t2 = t - 0.0058
        const w2 =
          t2 >= 0
            ? Math.exp(-t2 / 0.0022) *
              (0.6 * Math.sin(2 * Math.PI * 3100 * t2) + 0.4 * Math.sin(2 * Math.PI * 4800 * t2)) *
              0.86
            : 0
        v = w1 + w2
      } else if (kind === 'heavy') {
        v =
          (Math.min(i, 12) / 12) *
          (Math.exp(-t / 0.0028) * Math.sin(2 * Math.PI * 1350 * t) * 0.75 +
            Math.exp(-t / 0.0009) * Math.sin(2 * Math.PI * 3900 * t) * 0.4)
      } else {
        v =
          (Math.min(i, 10) / 10) *
          (0.62 * Math.exp(-t / 0.0018) * Math.sin(2 * Math.PI * 2350 * t) +
            0.38 * Math.exp(-t / 0.0007) * Math.sin(2 * Math.PI * 4650 * t)) *
          0.88
      }
      ch[i] = Math.max(-1, Math.min(1, v * 0.65))
    }
    const src = webAudioCtx.createBufferSource()
    src.buffer = buf
    src.connect(webAudioCtx.destination)
    src.start()
  } catch {
    // Ignore WebAudio restrictions in headless / test environments
  }
}

export function triggerClickSound(kind: HapticKind = 'tap'): void {
  if (!soundEnabledRuntime || voiceRecordingRuntime || typeof window === 'undefined') return
  if (kind === 'voiceStart' || kind === 'voiceStop' || kind === 'error') return
  if (typeof window.AxonkeyNative?.playClickSound === 'function') {
    try {
      window.AxonkeyNative.playClickSound(kind)
    } catch {
      // Ignore partial native mock errors
    }
    return
  }
  if (!window.AxonkeyNative) {
    playWebClickFallback(kind)
  }
}

/**
 * Pure tactile vibration for UI chrome, navigation, sheets, and layout editing (silent — no click sound).
 */
export function triggerHaptic(kind: HapticKind = 'tap'): void {
  if (typeof window === 'undefined') return
  if (!hapticsEnabledRuntime) return
  if (window.AxonkeyNative) {
    window.AxonkeyNative.haptic(kind)
    return
  }
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    const pattern =
      kind === 'detent'
        ? 5
        : kind === 'tap' || kind === 'voiceStop'
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

/**
 * Combined acoustic + haptic feedback strictly for active Controller Surfaces
 * (Bento keycaps, Clickpad ring, Gesture wheel, Touchpad, Air-Mouse triggers & Rotary scroll).
 */
export function triggerControlFeedback(kind: HapticKind = 'tap'): void {
  triggerClickSound(kind)
  triggerHaptic(kind)
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

/**
 * Calibrates gyroscope posture AND immediately sends AKP1 (0.5, 0.5) so the desktop cursor
 * snaps dead-center on the primary monitor across both Touchpad and Air-Mouse modes.
 */
export function recenterNativeCursor(): boolean {
  if (typeof window !== 'undefined' && typeof window.AxonkeyNative?.recenterCursor === 'function') {
    return window.AxonkeyNative.recenterCursor()
  }
  recenterNativeGyro()
  return false
}

export function setNativeVolumeKeyMouseConfig(
  active: boolean,
  mode: VolumeKeyMouseMode,
): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.setVolumeKeyMouseConfig === 'function'
  ) {
    try {
      window.AxonkeyNative.setVolumeKeyMouseConfig(active, mode)
    } catch {
      // Ignore bridge errors in partial mocks
    }
  }
}

export function notifyNativePointerClickPulse(): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.notifyPointerClickPulse === 'function'
  ) {
    try {
      window.AxonkeyNative.notifyPointerClickPulse()
    } catch {
      // Ignore bridge errors in partial mocks
    }
  }
}

export function setNativeScreenOrientationMode(mode: ScreenOrientationMode): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.setScreenOrientationMode === 'function'
  ) {
    try {
      window.AxonkeyNative.setScreenOrientationMode(mode)
    } catch {
      // Ignore bridge errors in partial mocks
    }
  }
}

export function getNativeAppVersionInfo(): AppVersionInfo {
  const fallback: AppVersionInfo = {
    versionName: '0.2.2',
    versionCode: 4,
    packageName: 'com.axonkey.mobile',
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.getAppVersionInfo === 'function'
  ) {
    try {
      const raw = window.AxonkeyNative.getAppVersionInfo()
      if (!raw) return fallback
      const parsed = JSON.parse(raw) as Partial<AppVersionInfo>
      return {
        versionName:
          typeof parsed.versionName === 'string' && parsed.versionName.trim()
            ? parsed.versionName.trim()
            : fallback.versionName,
        versionCode:
          typeof parsed.versionCode === 'number' && Number.isFinite(parsed.versionCode)
            ? parsed.versionCode
            : fallback.versionCode,
        packageName:
          typeof parsed.packageName === 'string' && parsed.packageName.trim()
            ? parsed.packageName.trim()
            : fallback.packageName,
      }
    } catch {
      return fallback
    }
  }
  return fallback
}

export function openNativeExternalUrl(url: string): boolean {
  if (!url || !url.startsWith('https://')) return false
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.openExternalUrl === 'function'
  ) {
    try {
      return Boolean(window.AxonkeyNative.openExternalUrl(url))
    } catch {
      return false
    }
  }
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer')
    return true
  }
  return false
}

export function checkNativeGithubRelease(repoSlug: string): boolean {
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.checkGithubRelease === 'function'
  ) {
    window.AxonkeyNative.checkGithubRelease(repoSlug)
    return true
  }
  return false
}

export function downloadAndInstallNativeApk(
  url: string,
  expectedSha256: string,
  version: string,
): boolean {
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.downloadAndInstallApk === 'function'
  ) {
    window.AxonkeyNative.downloadAndInstallApk(url, expectedSha256, version)
    return true
  }
  return false
}

export function installDownloadedNativeApk(): boolean {
  if (
    typeof window !== 'undefined' &&
    typeof window.AxonkeyNative?.installDownloadedApk === 'function'
  ) {
    try {
      return Boolean(window.AxonkeyNative.installDownloadedApk())
    } catch {
      return false
    }
  }
  return false
}

export function compareSemver(currentVer: string, latestVer: string): number {
  const parse = (v: string): { nums: number[]; pre: string | null } => {
    const cleaned = v.trim().replace(/^v/i, '').split('+')[0] ?? ''
    const dashIdx = cleaned.indexOf('-')
    const core = dashIdx >= 0 ? cleaned.slice(0, dashIdx) : cleaned
    const pre = dashIdx >= 0 ? cleaned.slice(dashIdx + 1).trim() || null : null
    const nums = core.split('.').map((part) => Number.parseInt(part, 10) || 0)
    return { nums, pre }
  }
  const a = parse(currentVer)
  const b = parse(latestVer)
  const len = Math.max(a.nums.length, b.nums.length, 3)
  for (let i = 0; i < len; i += 1) {
    const ai = a.nums[i] ?? 0
    const bi = b.nums[i] ?? 0
    if (ai < bi) return -1
    if (ai > bi) return 1
  }
  if (a.pre === null && b.pre === null) return 0
  if (a.pre !== null && b.pre === null) return -1
  if (a.pre === null && b.pre !== null) return 1
  return a.pre!.localeCompare(b.pre!)
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
