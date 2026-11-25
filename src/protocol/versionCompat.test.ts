import { describe, expect, it } from 'vitest'
import {
  evaluateHostCapabilitiesCompatibility,
  normalizeServerErrorCompatibilityNotice,
} from './versionCompat'
import type { HostCapabilities } from './types'

const BASE_CAPS: HostCapabilities = {
  relativePointer: true,
  absolutePointer: true,
  binaryPointerV1: true,
  binaryAudioV1: true,
  textCommit: true,
  audioPcm16: true,
  udpDiscoveryPort: 49671,
  platform: 'windows',
  hostVersion: '1.9.19',
  protocolApi: 2,
  minRequiredClientApi: 1,
  minRecommendedClientVersion: '0.2.0',
}

describe('versionCompat bidirectional evaluation', () => {
  it('returns null (100% silent) when both mobile and desktop are within expected range', () => {
    const res = evaluateHostCapabilitiesCompatibility({
      mobileVersion: '0.2.0',
      hostName: 'Studio PC',
      capabilities: BASE_CAPS,
    })
    expect(res).toBeNull()
  })

  it('distinguishes soft experience-degradation notices for mobile vs desktop', () => {
    const softMobile = evaluateHostCapabilitiesCompatibility({
      mobileVersion: '0.1.0',
      hostName: 'Studio PC',
      capabilities: { ...BASE_CAPS, minRecommendedClientVersion: '0.2.0' },
    })
    expect(softMobile?.severity).toBe('soft')
    expect(softMobile?.target).toBe('mobile')

    const softDesktop = evaluateHostCapabilitiesCompatibility({
      mobileVersion: '0.2.0',
      minRecommendedHostVersion: '1.12.0',
      hostName: 'Studio PC',
      capabilities: { ...BASE_CAPS, hostVersion: '1.9.19' },
    })
    expect(softDesktop?.severity).toBe('soft')
    expect(softDesktop?.target).toBe('desktop')
  })

  it('distinguishes hard mandatory-upgrade blocks for mobile vs desktop', () => {
    const hardMobile = evaluateHostCapabilitiesCompatibility({
      mobileVersion: '0.2.0',
      mobileProtocolApi: 2,
      hostName: 'Studio PC',
      capabilities: {
        ...BASE_CAPS,
        protocolApi: 3,
        minRequiredClientApi: 3,
        minRecommendedClientVersion: '1.0.0',
      },
    })
    expect(hardMobile?.severity).toBe('hard')
    expect(hardMobile?.target).toBe('mobile')

    const hardDesktop = evaluateHostCapabilitiesCompatibility({
      mobileVersion: '1.0.0',
      mobileProtocolApi: 3,
      minRequiredHostApi: 3,
      minRecommendedHostVersion: '2.0.0',
      hostName: 'Old PC',
      capabilities: { ...BASE_CAPS, hostVersion: '1.9.19', protocolApi: 2 },
    })
    expect(hardDesktop?.severity).toBe('hard')
    expect(hardDesktop?.target).toBe('desktop')

    const fromErr = normalizeServerErrorCompatibilityNotice(
      'client_upgrade_required',
      '请先升级手机端',
    )
    expect(fromErr?.severity).toBe('hard')
    expect(fromErr?.target).toBe('mobile')
  })
})
