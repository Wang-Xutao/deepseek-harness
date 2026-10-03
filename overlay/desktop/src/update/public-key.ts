/**
 * Ed25519 signing-key registry + signature enforcement policy (§11.3).
 *
 * The registry maps `keyId` → public PEM. The shipped entry is a TEST key
 * (`testOnly: true`) — production builds refuse it (测试 key 不进生产); the
 * production key is issued by the enterprise (enterprise-inputs.md 登记).
 *
 * Policy (§11.3 生产强制签名 / 开发跳过须显式 env):
 * - packaged (production): verification REQUIRED; missing signature, unknown
 *   keyId, test-only key, or mismatched bytes are all refused;
 * - unpackaged (dev): verification required unless `BAF_UPDATE_ALLOW_UNSIGNED`
 *   is explicitly `1`.
 * The packaged flag defaults to fail-closed; main.ts sets the real value
 * from `app.isPackaged` at startup.
 */

/** One registered update-signing public key. */
export interface UpdateSigningKey {
  readonly keyId: string
  readonly publicKeyPem: string
  /** Test keys never satisfy production verification (不进生产). */
  readonly testOnly: boolean
}

/** Test keypair generated 2026-10-03 (private half: overlay/scripts/.baf-update-test-private.pem, untracked). */
export const BAF_TEST_SIGNING_KEY: UpdateSigningKey = {
  keyId: 'baf-test-2026q4',
  publicKeyPem: [
    '-----BEGIN PUBLIC KEY-----',
    'MCowBQYDK2VwAyEANDF3WVjMzZ53lx/BoMIn8bmcGHEZ6oHoc4Co+jM/uqM=',
    '-----END PUBLIC KEY-----',
    '',
  ].join('\n'),
  testOnly: true,
}

const registry: UpdateSigningKey[] = [BAF_TEST_SIGNING_KEY]

/** Runtime packaged flag — fail-closed until main.ts reports the real value. */
let packaged = true

/**
 * Report whether this build is packaged (production). Called once from
 * main.ts with `app.isPackaged`.
 * @param value - true when running from a packaged build.
 */
export function setSignaturePackaged(value: boolean): void {
  packaged = value
}

/**
 * @param keyId - key id from the manifest signature descriptor.
 * @returns the registered key, or undefined for an unknown id.
 */
export function findSigningKey(keyId: string): UpdateSigningKey | undefined {
  return registry.find(k => k.keyId === keyId)
}

/** Registers an extra verification key (test-harness injection point). */
export function registerSigningKey(key: UpdateSigningKey): void {
  if (!registry.some(k => k.keyId === key.keyId)) registry.push(key)
}

/** Removes every key with the given id (test teardown). */
export function unregisterSigningKey(keyId: string): void {
  for (let i = registry.length - 1; i >= 0; i -= 1) {
    if (registry[i].keyId === keyId) registry.splice(i, 1)
  }
}

export interface SignaturePolicy {
  /** Verification must pass before the manifest is trusted. */
  readonly required: boolean
  /** Test-only keys are acceptable (never true in packaged builds). */
  readonly allowTestKeys: boolean
}

/**
 * The active signature policy. Dev builds may skip verification only via an
 * explicit `BAF_UPDATE_ALLOW_UNSIGNED=1` — silent skipping is not a mode.
 * @returns the enforcement policy.
 */
export function signaturePolicy(): SignaturePolicy {
  const allowUnsigned = process.env.BAF_UPDATE_ALLOW_UNSIGNED === '1' && !packaged
  return {
    required: !allowUnsigned,
    allowTestKeys: !packaged,
  }
}
