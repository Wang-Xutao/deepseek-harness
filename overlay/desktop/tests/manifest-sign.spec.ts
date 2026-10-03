/**
 * §11.2/§11.3 signature + signed-field policy tests (Phase 9.3).
 *
 * Generates a fresh ed25519 keypair in-test, registers the public half,
 * and pins the refusal matrix: missing signature, unknown keyId, test-only
 * key in production, tampered bytes, expired / not-yet-valid / replayed
 * (epoch-regressed) manifests — plus the explicit dev-only unsigned skip.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { fetchChannelManifest, verifyManifestSignature, type GithubUpdateConfig } from '../src/update/github.ts'
import { checkManifestPolicy, parseManifest, type UpdateManifest } from '../src/update/manifest.ts'
import {
  registerSigningKey,
  setSignaturePackaged,
  unregisterSigningKey,
  type UpdateSigningKey,
} from '../src/update/public-key.ts'

const CONFIG: GithubUpdateConfig = { owner: 'o', repo: 'r', channelTag: 'baf-channel-stable' }

/** A valid schema-2 manifest value with an overridable signature descriptor. */
function buildManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 2,
    channel: 'stable',
    issuedAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-12-01T00:00:00.000Z',
    releaseEpoch: 3,
    tag: 'baf-dsh-v0.0.24',
    bafDsh: '0.0.24',
    dsh: '0.1.9',
    bafPlugin: '0.0.10',
    bafPreset: '0.0.10',
    baseline: 'std-c',
    presetSchema: 1,
    minShell: '0.0.24',
    compatibility: { minDsh: '0.1.9', maxDsh: '*' },
    force: false,
    notesZh: 'test',
    artifacts: {
      plugin: { name: 'baf-plugin-0.0.10.zip', sha256: 'a'.repeat(64), size: 1 },
    },
    systemResources: ['presets/baf'],
    rollback: { supported: true, minimumVersion: '0.0.1' },
    signature: { algorithm: 'ed25519', keyId: 'spec-key', asset: 'manifest.sig' },
    ...overrides,
  }
}

/** GitHub release double serving manifest.json (+ optional manifest.sig). */
function serveRelease(manifestBytes: Buffer, signature?: Buffer) {
  const assets = [
    { id: 1, name: 'manifest.json', browser_download_url: 'u', url: 'asset://manifest.json', size: manifestBytes.byteLength },
    ...(signature === undefined ? [] : [{
      id: 2, name: 'manifest.sig', browser_download_url: 'u', url: 'asset://manifest.sig', size: signature.byteLength,
    }]),
  ]
  const body = (buf: Buffer) => ({ ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) })
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    if (url.endsWith('/releases/tags/baf-channel-stable')) {
      return { ok: true, status: 200, json: async () => ({ tag_name: 'baf-dsh-v0.0.24', assets }) } as unknown as Response
    }
    if (url === 'asset://manifest.json') return body(manifestBytes) as unknown as Response
    if (url === 'asset://manifest.sig') return body(signature!) as unknown as Response
    throw new Error(`unexpected fetch ${url}`)
  }
}

/** Fresh keypair + registered public key with the given id. */
function freshKey(keyId: string, testOnly: boolean): { key: UpdateSigningKey; pem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const key: UpdateSigningKey = {
    keyId,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    testOnly,
  }
  registerSigningKey(key)
  return { key, pem }
}

const realFetch = globalThis.fetch
const envAllowUnsigned = process.env.BAF_UPDATE_ALLOW_UNSIGNED
afterEach(() => {
  globalThis.fetch = realFetch
  setSignaturePackaged(true)
  if (envAllowUnsigned === undefined) delete process.env.BAF_UPDATE_ALLOW_UNSIGNED
  else process.env.BAF_UPDATE_ALLOW_UNSIGNED = envAllowUnsigned
  for (const id of ['spec-key', 'spec-test-key', 'spec-other']) unregisterSigningKey(id)
})

describe('verifyManifestSignature', () => {
  it('accepts a valid signature and refuses tampered bytes / wrong key', async () => {
    const { key, pem } = freshKey('spec-key', false)
    const bytes = Buffer.from(`${JSON.stringify(buildManifest(), null, 2)}\n`, 'utf8')
    const sig = Buffer.from(sign(null, bytes, pem).toString('base64'), 'utf8')
    expect(verifyManifestSignature(bytes, sig, key)).toBe(true)
    const tampered = Buffer.from(bytes.toString('utf8').replace('0.0.24', '9.9.9'))
    expect(verifyManifestSignature(tampered, sig, key)).toBe(false)
    const other = freshKey('spec-other', false)
    expect(verifyManifestSignature(bytes, sig, other.key)).toBe(false)
  })
})

describe('fetchChannelManifest enforcement (production)', () => {
  it('refuses a missing signature', async () => {
    setSignaturePackaged(true)
    const bytes = Buffer.from(JSON.stringify(buildManifest()), 'utf8')
    globalThis.fetch = serveRelease(bytes) as typeof fetch
    await expect(fetchChannelManifest(CONFIG)).rejects.toThrow('manifest.sig')
  })

  it('refuses an unregistered keyId and a test-only key', async () => {
    setSignaturePackaged(true)
    const bytes = Buffer.from(JSON.stringify(buildManifest()), 'utf8')
    // keyId spec-key is NOT registered in this test → 未注册
    const stray = freshKey('spec-other', false)
    const sig = Buffer.from(sign(null, bytes, stray.pem))
    globalThis.fetch = serveRelease(bytes, sig) as typeof fetch
    await expect(fetchChannelManifest(CONFIG)).rejects.toThrow('未注册')

    // Registered but testOnly under packaged build → refused (the descriptor
    // names the test key, so keyId resolution succeeds and testOnly bites).
    const { pem } = freshKey('spec-test-key', true)
    const testBytes = Buffer.from(JSON.stringify(buildManifest({
      signature: { algorithm: 'ed25519', keyId: 'spec-test-key', asset: 'manifest.sig' },
    })), 'utf8')
    const testSig = Buffer.from(sign(null, testBytes, pem))
    globalThis.fetch = serveRelease(testBytes, testSig) as typeof fetch
    await expect(fetchChannelManifest(CONFIG)).rejects.toThrow('测试签名 key')
  })

  it('accepts a properly signed manifest from a registered production key', async () => {
    setSignaturePackaged(true)
    const { pem } = freshKey('spec-key', false)
    const bytes = Buffer.from(`${JSON.stringify(buildManifest(), null, 2)}\n`, 'utf8')
    const sig = Buffer.from(sign(null, bytes, pem).toString('base64'), 'utf8')
    globalThis.fetch = serveRelease(bytes, sig) as typeof fetch
    const manifest = await fetchChannelManifest(CONFIG)
    expect(manifest.bafDsh).toBe('0.0.24')
    expect(manifest.releaseEpoch).toBe(3)
  })

  it('dev builds skip verification only with the explicit env', async () => {
    setSignaturePackaged(false)
    const bytes = Buffer.from(JSON.stringify(buildManifest()), 'utf8')
    // No signature asset, no env → still enforced.
    globalThis.fetch = serveRelease(bytes) as typeof fetch
    await expect(fetchChannelManifest(CONFIG)).rejects.toThrow('manifest.sig')
    // Explicit opt-out → unsigned manifest passes.
    process.env.BAF_UPDATE_ALLOW_UNSIGNED = '1'
    const manifest = await fetchChannelManifest(CONFIG)
    expect(manifest.tag).toBe('baf-dsh-v0.0.24')
  })
})

describe('checkManifestPolicy — signed validity window + epoch', () => {
  const manifest = (): UpdateManifest => {
    const parsed = parseManifest(buildManifest())
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed.value
  }
  const NOW = new Date('2026-10-01T00:00:00.000Z')

  it('accepts an in-window manifest', () => {
    expect(checkManifestPolicy(manifest(), { now: NOW, skewMs: 0 })).toEqual({ ok: true })
  })

  it('refuses not-yet-valid and expired, with bounded skew tolerance', () => {
    const m = manifest()
    expect(checkManifestPolicy(m, { now: new Date('2026-08-01T00:00:00.000Z'), skewMs: 0 }).ok).toBe(false)
    const justBeforeIssue = new Date(new Date(m.issuedAt).getTime() - 60_000)
    expect(checkManifestPolicy(m, { now: justBeforeIssue, skewMs: 300_000 }).ok).toBe(true)
    expect(checkManifestPolicy(m, { now: new Date('2027-01-01T00:00:00.000Z'), skewMs: 0 }))
      .toMatchObject({ ok: false, reason: 'expired' })
    // Admin-signed offline exception waives expiry but nothing else.
    expect(checkManifestPolicy(m, { now: new Date('2027-01-01T00:00:00.000Z'), skewMs: 0, offlineException: true }).ok).toBe(true)
  })

  it('refuses replayed (epoch-regressed) manifests and an unusable clock', () => {
    const m = manifest()
    expect(checkManifestPolicy(m, { now: NOW, skewMs: 0, lastReleaseEpoch: 4 }))
      .toMatchObject({ ok: false, reason: 'epoch_regression' })
    // Same epoch re-check is fine (idempotent re-check of the same release).
    expect(checkManifestPolicy(m, { now: NOW, skewMs: 0, lastReleaseEpoch: 3 }).ok).toBe(true)
    expect(checkManifestPolicy(m, { now: new Date(Number.NaN), skewMs: 0 }))
      .toMatchObject({ ok: false, reason: 'clock_unavailable' })
  })
})

describe('manifest content hash sanity', () => {
  it('parseManifest rejects a schema-2 body with a bad artifact hash', () => {
    const parsed = parseManifest(buildManifest({
      artifacts: { plugin: { name: 'x.zip', sha256: 'zz', size: 1 } },
    }))
    expect(parsed.ok).toBe(false)
    void createHash
  })
})
