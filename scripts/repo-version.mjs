#!/usr/bin/env node

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_JSON_PATH = resolve(ROOT_DIR, 'package.json')
const GRADLE_KTS_PATH = resolve(ROOT_DIR, 'android/app/build.gradle.kts')
const NATIVE_BRIDGE_PATH = resolve(ROOT_DIR, 'src/transport/nativeBridge.ts')

const TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/

function parseReleaseTag(rawTag) {
  const tag = rawTag.startsWith('v') ? rawTag : `v${rawTag}`
  const match = TAG_PATTERN.exec(tag)
  if (!match) {
    throw new Error(
      `Invalid release version/tag "${rawTag}". Expected vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-(alpha|beta|rc).N`,
    )
  }
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  const prerelease = Boolean(match[4])
  return {
    tag,
    version: tag.slice(1),
    major,
    minor,
    patch,
    prerelease,
  }
}

function readRepoVersions() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'))
  const gradleRaw = readFileSync(GRADLE_KTS_PATH, 'utf8')
  const bridgeRaw = readFileSync(NATIVE_BRIDGE_PATH, 'utf8')

  const gradleNameMatch = /versionName\s*=\s*"([^"]+)"/.exec(gradleRaw)
  const gradleCodeMatch = /versionCode\s*=\s*(\d+)/.exec(gradleRaw)
  if (!gradleNameMatch || !gradleCodeMatch) {
    throw new Error('Could not parse versionName / versionCode in android/app/build.gradle.kts')
  }

  const bridgeNameMatch = /versionName:\s*'([^']+)'/.exec(bridgeRaw)
  const bridgeCodeMatch = /versionCode:\s*(\d+)/.exec(bridgeRaw)
  if (!bridgeNameMatch || !bridgeCodeMatch) {
    throw new Error('Could not parse fallback versionName / versionCode in src/transport/nativeBridge.ts')
  }

  return {
    pkgVersion: String(pkg.version ?? '').trim(),
    gradleVersionName: gradleNameMatch[1].trim(),
    gradleVersionCode: Number(gradleCodeMatch[1]),
    bridgeVersionName: bridgeNameMatch[1].trim(),
    bridgeVersionCode: Number(bridgeCodeMatch[1]),
  }
}

function checkVersions(expectedTag, githubOutputPath) {
  const state = readRepoVersions()
  const parsed = parseReleaseTag(expectedTag ?? `v${state.pkgVersion}`)

  if (state.pkgVersion !== parsed.version) {
    throw new Error(
      `Version mismatch: package.json has "${state.pkgVersion}", expected "${parsed.version}" (${parsed.tag})`,
    )
  }
  if (state.gradleVersionName !== parsed.version) {
    throw new Error(
      `Version mismatch: android/app/build.gradle.kts versionName is "${state.gradleVersionName}", expected "${parsed.version}"`,
    )
  }
  if (!Number.isInteger(state.gradleVersionCode) || state.gradleVersionCode < 1) {
    throw new Error(
      `Invalid versionCode in android/app/build.gradle.kts: "${state.gradleVersionCode}"`,
    )
  }
  if (state.bridgeVersionName !== parsed.version) {
    throw new Error(
      `Version mismatch: src/transport/nativeBridge.ts fallback versionName is "${state.bridgeVersionName}", expected "${parsed.version}"`,
    )
  }
  if (state.bridgeVersionCode !== state.gradleVersionCode) {
    throw new Error(
      `versionCode mismatch: build.gradle.kts has ${state.gradleVersionCode}, nativeBridge.ts has ${state.bridgeVersionCode}`,
    )
  }

  if (githubOutputPath) {
    appendFileSync(
      githubOutputPath,
      `tag=${parsed.tag}\nversion=${parsed.version}\nversion_code=${state.gradleVersionCode}\nprerelease=${parsed.prerelease}\n`,
      'utf8',
    )
  }

  console.log(
    `Verified repository version ${parsed.tag} (versionCode=${state.gradleVersionCode}, prerelease=${parsed.prerelease})`,
  )
}

function setVersions(rawTag, explicitCode) {
  const parsed = parseReleaseTag(rawTag)
  const current = readRepoVersions()
  const nextCode =
    explicitCode !== undefined
      ? Number(explicitCode)
      : current.pkgVersion === parsed.version
        ? current.gradleVersionCode
        : current.gradleVersionCode + 1

  if (!Number.isInteger(nextCode) || nextCode < 1) {
    throw new Error(`Invalid next versionCode: ${nextCode}`)
  }

  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'))
  pkg.version = parsed.version
  writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')

  const gradleRaw = readFileSync(GRADLE_KTS_PATH, 'utf8')
    .replace(/versionCode\s*=\s*\d+/, `versionCode = ${nextCode}`)
    .replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${parsed.version}"`)
  writeFileSync(GRADLE_KTS_PATH, gradleRaw, 'utf8')

  const bridgeRaw = readFileSync(NATIVE_BRIDGE_PATH, 'utf8')
    .replace(/versionName:\s*'[^']+'/, `versionName: '${parsed.version}'`)
    .replace(/versionCode:\s*\d+/, `versionCode: ${nextCode}`)
  writeFileSync(NATIVE_BRIDGE_PATH, bridgeRaw, 'utf8')

  console.log(`Updated repository version to ${parsed.tag} (versionCode=${nextCode})`)
}

function optionValue(args, flag) {
  const idx = args.indexOf(flag)
  if (idx === -1) return undefined
  if (!args[idx + 1]) throw new Error(`${flag} requires a value`)
  return args[idx + 1]
}

function main() {
  const [command, ...args] = process.argv.slice(2)

  if (command === 'get') {
    const { pkgVersion } = readRepoVersions()
    const parsed = parseReleaseTag(`v${pkgVersion}`)
    console.log(args.includes('--numeric') ? parsed.version : parsed.tag)
    return
  }

  if (command === 'check') {
    const ghOut = optionValue(args, '--github-output')
    const positional = args.filter(
      (arg, i) => arg !== '--github-output' && args[i - 1] !== '--github-output',
    )
    if (positional.length > 1) {
      throw new Error('Usage: repo-version.mjs check [vX.Y.Z] [--github-output PATH]')
    }
    checkVersions(positional[0], ghOut)
    return
  }

  if (command === 'set') {
    const codeOpt = optionValue(args, '--version-code')
    const positional = args.filter(
      (arg, i) => arg !== '--version-code' && args[i - 1] !== '--version-code',
    )
    if (positional.length !== 1) {
      throw new Error('Usage: repo-version.mjs set <vX.Y.Z> [--version-code N]')
    }
    setVersions(positional[0], codeOpt)
    return
  }

  throw new Error('Usage: repo-version.mjs <get|check|set>')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
