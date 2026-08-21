import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const VERSION = '22.19.0'
const FILE = `node-v${VERSION}-x64.msi`
const URL = `https://nodejs.org/dist/v${VERSION}/${FILE}`
const destDir = resolve(dirname(fileURLToPath(import.meta.url)), '../.cache')
const dest = resolve(destDir, FILE)

if (existsSync(dest)) {
  console.log(`already have ${dest}`)
  process.exit(0)
}

mkdirSync(destDir, { recursive: true })
const response = await fetch(URL)
if (!response.ok || response.body === null) {
  throw new Error(`下载 Node MSI 失败：${String(response.status)} ${URL}`)
}

await pipeline(Readable.fromWeb(response.body), createWriteStream(dest))
console.log(`wrote ${dest}`)
