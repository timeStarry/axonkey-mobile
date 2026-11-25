import type {
  HostCapabilities,
  VersionCompatibilityNotice,
} from './types'
import { compareSemver, getNativeAppVersionInfo } from '../transport/nativeBridge'

export const MOBILE_PROTOCOL_API = 2
export const MIN_REQUIRED_HOST_API = 1
export const MIN_RECOMMENDED_HOST_VERSION = '1.9.0'
const DISMISSED_COMPAT_STORAGE_KEY = 'axonkey.mobile.dismissedCompatNotices.v1'

export interface OutgoingVersionHandshake {
  clientVersion: string
  protocolApi: number
  minRequiredHostApi: number
  minRecommendedHostVersion: string
}

export function buildClientVersionHandshake(
  overrideVersion?: string,
): OutgoingVersionHandshake {
  const clientVersion =
    overrideVersion?.trim() || getNativeAppVersionInfo().versionName || '0.2.0'
  return {
    clientVersion,
    protocolApi: MOBILE_PROTOCOL_API,
    minRequiredHostApi: MIN_REQUIRED_HOST_API,
    minRecommendedHostVersion: MIN_RECOMMENDED_HOST_VERSION,
  }
}

export function evaluateHostCapabilitiesCompatibility(params: {
  mobileVersion?: string
  mobileProtocolApi?: number
  minRequiredHostApi?: number
  minRecommendedHostVersion?: string
  hostName: string
  capabilities: HostCapabilities
}): VersionCompatibilityNotice | null {
  const mobileVersion = (
    params.mobileVersion?.trim() ||
    getNativeAppVersionInfo().versionName ||
    '0.2.0'
  ).replace(/^v/i, '')
  const mobileProtocolApi = params.mobileProtocolApi ?? MOBILE_PROTOCOL_API
  const minRequiredHostApi = params.minRequiredHostApi ?? MIN_REQUIRED_HOST_API
  const minRecommendedHostVersion = (
    params.minRecommendedHostVersion ?? MIN_RECOMMENDED_HOST_VERSION
  ).replace(/^v/i, '')
  const cleanHost = params.hostName.trim() || '电脑端'
  const caps = params.capabilities

  // 1. Hard incompatibility: Desktop requires a newer Mobile protocol API
  if (
    typeof caps.minRequiredClientApi === 'number' &&
    caps.minRequiredClientApi > mobileProtocolApi
  ) {
    const expected = caps.minRecommendedClientVersion
      ? `v${caps.minRecommendedClientVersion.replace(/^v/i, '')}+`
      : `协议 v${caps.minRequiredClientApi}`
    return {
      key: `hard:mobile:${mobileVersion}->${expected}`,
      severity: 'hard',
      target: 'mobile',
      currentVersion: mobileVersion,
      expectedVersion: expected,
      title: '需要更新手机端客户端',
      message: `电脑「${cleanHost}」要求更高版本的手机端协议（${expected}），当前手机端（v${mobileVersion}）无法建立控制连接。请先更新 Axonkey Mobile 后重试。`,
    }
  }

  // 2. Hard incompatibility: Desktop protocol API is older than Mobile's required floor
  const effectiveHostApi =
    typeof caps.protocolApi === 'number'
      ? caps.protocolApi
      : caps.binaryPointerV1 || caps.binaryAudioV1
        ? 2
        : 1
  if (effectiveHostApi < minRequiredHostApi) {
    const curHostVer = caps.hostVersion?.trim().replace(/^v/i, '') || null
    const expected = `v${minRecommendedHostVersion}+`
    return {
      key: `hard:desktop:${curHostVer ?? 'legacy'}->${expected}`,
      severity: 'hard',
      target: 'desktop',
      currentVersion: curHostVer,
      expectedVersion: expected,
      title: '需要更新电脑端 Axonkey',
      message: `电脑「${cleanHost}」当前版本${curHostVer ? `（v${curHostVer}）` : ''}过旧，不支持此手机端所需的通信协议，无法建立连接。请先升级电脑端 Axonkey 后重试。`,
    }
  }

  // 3. Soft drift: Mobile version is below Desktop's recommended client version
  if (caps.minRecommendedClientVersion?.trim()) {
    const recMobile = caps.minRecommendedClientVersion.trim().replace(/^v/i, '')
    if (compareSemver(mobileVersion, recMobile) < 0) {
      return {
        key: `soft:mobile:${mobileVersion}->${recMobile}`,
        severity: 'soft',
        target: 'mobile',
        currentVersion: mobileVersion,
        expectedVersion: `v${recMobile}+`,
        title: '建议更新手机端客户端',
        message: `当前手机端版本（v${mobileVersion}）低于电脑「${cleanHost}」推荐版本（v${recMobile}+）。基础遥控与语音仍可使用，但部分新组件、手势或同步体验可能受影响。`,
      }
    }
  }

  // 4. Soft drift: Desktop version is below Mobile's recommended host version (or legacy v1 host)
  const rawHostVersion = caps.hostVersion?.trim().replace(/^v/i, '') || ''
  if (rawHostVersion) {
    if (compareSemver(rawHostVersion, minRecommendedHostVersion) < 0) {
      return {
        key: `soft:desktop:${rawHostVersion}->${minRecommendedHostVersion}`,
        severity: 'soft',
        target: 'desktop',
        currentVersion: rawHostVersion,
        expectedVersion: `v${minRecommendedHostVersion}+`,
        title: '建议更新电脑端 Axonkey',
        message: `电脑「${cleanHost}」当前版本（v${rawHostVersion}）低于手机端推荐版本（v${minRecommendedHostVersion}+）。基础操控仍可使用，但部分新功能或低延迟同步体验可能受影响。`,
      }
    }
  } else if (!caps.binaryPointerV1 && !caps.binaryAudioV1) {
    return {
      key: `soft:desktop:legacy->${minRecommendedHostVersion}`,
      severity: 'soft',
      target: 'desktop',
      currentVersion: null,
      expectedVersion: `v${minRecommendedHostVersion}+`,
      title: '建议更新电脑端 Axonkey',
      message: `电脑「${cleanHost}」客户端版本较旧（低于 v${minRecommendedHostVersion}）。基础操控仍可使用，但二进制低延迟鼠标与新版语音同步体验可能受影响。`,
    }
  }

  return null
}

export function normalizeServerErrorCompatibilityNotice(
  code: string | undefined,
  message: string | undefined,
  explicitNotice?: VersionCompatibilityNotice,
): VersionCompatibilityNotice | null {
  if (explicitNotice) {
    return explicitNotice
  }
  if (code === 'client_upgrade_required') {
    const mobileVer = getNativeAppVersionInfo().versionName
    return {
      key: `hard:mobile:${mobileVer}->latest`,
      severity: 'hard',
      target: 'mobile',
      currentVersion: mobileVer,
      expectedVersion: '最新版本',
      title: '需要更新手机端客户端',
      message:
        message?.trim() ||
        '当前手机端版本过旧，与电脑端通信协议不兼容，无法建立连接。请将手机端更新至最新版本。',
    }
  }
  if (code === 'host_upgrade_required') {
    return {
      key: `hard:desktop:legacy->${MIN_RECOMMENDED_HOST_VERSION}`,
      severity: 'hard',
      target: 'desktop',
      currentVersion: null,
      expectedVersion: `v${MIN_RECOMMENDED_HOST_VERSION}+`,
      title: '需要更新电脑端 Axonkey',
      message:
        message?.trim() ||
        '当前电脑端版本过旧，与手机端通信协议不兼容，无法建立连接。请先更新电脑端 Axonkey。',
    }
  }
  return null
}

export function isSoftCompatNoticeDismissed(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(DISMISSED_COMPAT_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.includes(key)
  } catch {
    return false
  }
}

export function dismissSoftCompatNotice(key: string): void {
  if (typeof window === 'undefined' || !key) return
  try {
    const raw = window.localStorage.getItem(DISMISSED_COMPAT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const list: string[] = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
    if (!list.includes(key)) {
      list.push(key)
    }
    window.localStorage.setItem(
      DISMISSED_COMPAT_STORAGE_KEY,
      JSON.stringify(list.slice(-32)),
    )
  } catch {
    // Ignore storage quota errors
  }
}
