/**
 * Convert the whale PNGs to multi-size Windows ICO files.
 *
 * The ICO entries are written by the shared codec in `lib/image-codec.mjs`
 * (32-bit BGRA DIB entries), because the brand mark is TRANSPARENT artwork:
 * a generic PNG→ICO converter flattens the alpha channel and leaves a black
 * or white plate behind the logo.
 *
 * The ICO must be a real PNG-backed icon set; `png-to-ico` is not used here.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { encodeIco, fitSquare, readPng, resizeRgba } from './lib/image-codec.mjs'

const assets = resolve(import.meta.dirname, '..', 'assets')
const pairs = [
  ['app-icon.png', 'app.ico'],
  ['installer-icon.png', 'installer.ico'],
]
/** Windows reads 16/32/48/64/96/128/256 — the sizes the shell shows. */
const SIZES = [16, 32, 48, 64, 96, 128, 256]

for (const [source, dest] of pairs) {
  const image = readPng(resolve(assets, source))
  const entries = SIZES.map(size => {
    const square = image.width === image.height && image.width === size
      ? image
      : fitSquare(image, size, 1)
    return square.width === size ? square : resizeRgba(square, size, size)
  })
  mkdirSync(assets, { recursive: true })
  writeFileSync(resolve(assets, dest), encodeIco(entries))
  console.log(`wrote ${dest} (${SIZES.join('/')})`)
}
