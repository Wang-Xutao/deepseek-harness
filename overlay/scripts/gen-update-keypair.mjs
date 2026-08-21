#!/usr/bin/env node
/**
 * Generate an ed25519 keypair for manifest signing.
 * Writes public PEM to stdout and optionally --out-private <path>.
 */
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const pub = publicKey.export({ type: 'spki', format: 'pem' })
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' })

const outIdx = process.argv.indexOf('--out-private')
if (outIdx !== -1 && process.argv[outIdx + 1]) {
  writeFileSync(process.argv[outIdx + 1], priv)
  console.error(`wrote private key to ${process.argv[outIdx + 1]} (do not commit)`)
}

console.log(String(pub))
console.error('Paste the public PEM into overlay/desktop/src/update/public-key.ts')
