/**
 * §12 9.7 extractZip hardening — the update zips come from the network, so
 * the extractor must refuse path-escape entries before extracting anything.
 *
 * The malicious fixtures are built by a minimal stored-zip writer in-test
 * (central directory + local headers, method 0): crafting `../evil.txt` via
 * bsdtar itself is impossible — it refuses to archive `..` names, which is
 * exactly the production packer's guarantee the validator defends against
 * losing.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractZip, isSafeZipEntryName } from '../src/update/extract.ts'

// vitest spawned from Git Bash resolves bare `tar`/`tar.exe` to MSYS GNU tar,
// which treats `C:\...` as an rsh remote. Resolve System32 bsdtar explicitly
// via PATH (same fix as apply-scoped.spec.ts).
const sys32Dir = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
process.env.Path = `${sys32Dir};${process.env.Path ?? ''}`

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

/** Minimal stored (method 0) zip builder — enough for validation-path tests. */
function buildZip(entries: ReadonlyArray<{ name: string, data: string }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const dataBuf = Buffer.from(entry.data, 'utf8')
    const crc = crc32(dataBuf)
    const lfh = Buffer.alloc(30)
    lfh.writeUInt32LE(0x04034b50, 0)
    lfh.writeUInt16LE(20, 4)
    lfh.writeUInt16LE(0, 6)
    lfh.writeUInt16LE(0, 8)
    lfh.writeUInt16LE(0, 10)
    lfh.writeUInt16LE(0x21, 12)
    lfh.writeUInt32LE(crc, 14)
    lfh.writeUInt32LE(dataBuf.length, 18)
    lfh.writeUInt32LE(dataBuf.length, 22)
    lfh.writeUInt16LE(nameBuf.length, 26)
    lfh.writeUInt16LE(0, 28)
    locals.push(lfh, nameBuf, dataBuf)
    const cdh = Buffer.alloc(46)
    cdh.writeUInt32LE(0x02014b50, 0)
    cdh.writeUInt16LE(20, 4)
    cdh.writeUInt16LE(20, 6)
    cdh.writeUInt16LE(0, 8)
    cdh.writeUInt16LE(0, 10)
    cdh.writeUInt16LE(0, 12)
    cdh.writeUInt16LE(0x21, 14)
    cdh.writeUInt32LE(crc, 16)
    cdh.writeUInt32LE(dataBuf.length, 20)
    cdh.writeUInt32LE(dataBuf.length, 24)
    cdh.writeUInt16LE(nameBuf.length, 28)
    cdh.writeUInt16LE(0, 30)
    cdh.writeUInt16LE(0, 32)
    cdh.writeUInt16LE(0, 34)
    cdh.writeUInt16LE(0, 36)
    cdh.writeUInt32LE(0, 38)
    cdh.writeUInt32LE(offset, 42)
    centrals.push(cdh, nameBuf)
    offset += 30 + nameBuf.length + dataBuf.length
  }
  const central = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, central, eocd])
}

function scratchDir(): { root: string, cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'baf-extract-'))
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

describe('isSafeZipEntryName (9.7 条目名校验)', () => {
  it('accepts plain relative paths', () => {
    expect(isSafeZipEntryName('plugin-manifest.json')).toBe(true)
    expect(isSafeZipEntryName('skills/baf/go.md')).toBe(true)
    expect(isSafeZipEntryName('a/b/c.txt')).toBe(true)
  })

  it('rejects traversal, absolute, drive, UNC, backslash and ADS names', () => {
    expect(isSafeZipEntryName('../evil.txt')).toBe(false)
    expect(isSafeZipEntryName('a/../../evil.txt')).toBe(false)
    expect(isSafeZipEntryName('C:/Windows/evil.dll')).toBe(false)
    expect(isSafeZipEntryName('/etc/passwd')).toBe(false)
    expect(isSafeZipEntryName('//server/share/x')).toBe(false)
    expect(isSafeZipEntryName('a\\b.txt')).toBe(false)
    expect(isSafeZipEntryName('file:stream')).toBe(false)
    expect(isSafeZipEntryName('')).toBe(false)
  })
})

describe('extractZip (9.7 拒绝逃逸条目)', () => {
  it('extracts a well-formed stored zip', async () => {
    const { root, cleanup } = scratchDir()
    try {
      const zipPath = join(root, 'good.zip')
      writeFileSync(zipPath, buildZip([
        { name: 'plugin-manifest.json', data: '{"version":"0.0.24"}' },
        { name: 'skills/readme.md', data: 'hello' },
      ]))
      const dest = join(root, 'dest')
      await extractZip(zipPath, dest)
      expect(readFileSync(join(dest, 'plugin-manifest.json'), 'utf8')).toContain('0.0.24')
      expect(readFileSync(join(dest, 'skills', 'readme.md'), 'utf8')).toBe('hello')
    } finally {
      cleanup()
    }
  }, 30_000)

  it('refuses a zip with a ../ entry before extracting anything', async () => {
    const { root, cleanup } = scratchDir()
    try {
      const zipPath = join(root, 'evil.zip')
      writeFileSync(zipPath, buildZip([
        { name: 'ok.txt', data: 'fine' },
        { name: '../evil.txt', data: 'escaped' },
      ]))
      const dest = join(root, 'inner', 'dest')
      await expect(extractZip(zipPath, dest)).rejects.toThrow('不安全路径')
      expect(existsSync(join(root, 'inner', 'evil.txt'))).toBe(false)
      expect(existsSync(join(root, 'evil.txt'))).toBe(false)
    } finally {
      cleanup()
    }
  }, 30_000)

  it('refuses absolute and drive-letter entries', async () => {
    const { root, cleanup } = scratchDir()
    try {
      for (const name of ['/abs.txt', 'C:/abs.txt']) {
        const zipPath = join(root, 'evil-abs.zip')
        writeFileSync(zipPath, buildZip([{ name, data: 'x' }]))
        await expect(extractZip(zipPath, join(root, 'dest'))).rejects.toThrow('不安全路径')
      }
    } finally {
      cleanup()
    }
  }, 30_000)
})
