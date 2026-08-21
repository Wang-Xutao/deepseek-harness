/**
 * Ed25519 public key for channel manifest signatures (reserved).
 * Public repos currently skip signature checks; enable later for private channels.
 */
export const BAF_UPDATE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
-----END PUBLIC KEY-----
`

/** Signature verification is disabled until a private release channel is enabled. */
export function signatureVerificationEnabled(): boolean {
  return false
}
