/**
 * Rebuild the baf-dsh brand assets as TRANSPARENT artwork.
 *
 * The brand mark (whale + dashed ring) and the plain whale used to ship as
 * flat-blue silhouettes painted on an opaque WHITE square. On a taskbar, in
 * the tray, on the exe and on the website that white square reads as an
 * unwanted white card around the logo, so every icon was rebuilt here from
 * the transparent sources in `desktop/branding/`:
 *
 *   desktop/branding/mark.png      blue mark (whale + dashed ring)
 *   desktop/branding/deepseek.png  blue whale
 *
 * Outputs (all with a transparent background):
 *   desktop/branding/icon.ico  exe / taskbar / tray / installer icon
 *   assets/app-icon.png         mark, 256px raster
 *   assets/app.ico              mark, multi-size
 *   assets/logo.ico             mark, multi-size
 *   assets/installer-icon.png   whale, 256px raster
 *   assets/installer.ico        whale, multi-size
 *
 * A source that still carries a white plate is repaired in place first: the
 * artwork is a flat blue composited over white, so unpremultiplying against
 * white recovers the exact coverage as the alpha channel.
 *
 * Run: node scripts/make-transparent-brand-icons.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodeIco, encodeIco, fitSquare, readPng, writePng } from './lib/image-codec.mjs'

const root = resolve(import.meta.dirname, '..')

/** The flat brand blue of the artwork (the only ink colour in the plate). */
const INK = { r: 77, g: 107, b: 254 }

/** Windows reads 16/32/48/64/96/128/256 — the sizes the shell shows. */
const SIZES = [16, 32, 48, 64, 96, 128, 256]

/**
 * Recover the artwork's coverage from a pixel painted over white.
 * @param {{r:number,g:number,b:number}} px - source pixel.
 * @returns {{r:number,g:number,b:number,a:number}} unpremultiplied pixel.
 */
function unpremultiplyWhite(px) {
  let coverage = 0
  // Only channels that sit far from white may drive the estimate: the ink's
  // blue channel is 254, so its span of 1 would turn every off-white plate
  // pixel into an opaque one.
  for (const ch of ['r', 'g']) {
    const span = 255 - INK[ch]
    const alpha = (255 - px[ch]) / span
    if (alpha > coverage) coverage = alpha
  }
  if (coverage <= 0.01) return { r: 0, g: 0, b: 0, a: 0 }
  const clamped = Math.min(1, coverage)
  const rest = (1 - clamped) * 255
  const channel = value => {
    const out = (value - rest) / clamped
    return Math.max(0, Math.min(255, Math.round(out)))
  }
  return { r: channel(px.r), g: channel(px.g), b: channel(px.b), a: Math.round(clamped * 255) }
}

/**
 * Remove an opaque white plate from one RGBA buffer.
 * @param {Buffer} rgba - pixels to rewrite in place.
 * @returns {number} the number of pixels that became transparent.
 */
function stripPlate(rgba) {
  let cleared = 0
  for (let i = 0; i < rgba.length; i += 4) {
    // A pixel that already carries an alpha channel has been processed
    // before, so the script stays idempotent.
    if (rgba[i + 3] !== 255) continue
    const out = unpremultiplyWhite({ r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] })
    if (out.a === 0) cleared++
    rgba[i] = out.r
    rgba[i + 1] = out.g
    rgba[i + 2] = out.b
    rgba[i + 3] = out.a
  }
  return cleared
}

/**
 * Load a source PNG and guarantee it has no white plate left.
 * @param {string} file - absolute path.
 * @returns {{width:number,height:number,rgba:Buffer}} the image.
 */
function loadSource(file) {
  const image = readPng(file)
  const cleared = stripPlate(image.rgba)
  console.log(`  source ${file.replace(`${root}\\`, '').replaceAll('\\', '/')}: ${cleared} plate pixels cleared`)
  return image
}

const check = process.argv.includes('--check')
const mark = loadSource(resolve(root, 'desktop', 'branding', 'mark.png'))
const whale = loadSource(resolve(root, 'desktop', 'branding', 'deepseek.png'))

/**
 * Build the multi-size ICO entries for one artwork.
 * @param {{width:number,height:number,rgba:Buffer}} image - the artwork.
 * @returns {{width:number,height:number,rgba:Buffer}[]} one entry per size.
 */
function icoEntries(image) {
  return SIZES.map(size => fitSquare(image, size, 1))
}

const outputs = [
  { file: resolve(root, 'desktop', 'branding', 'icon.ico'), kind: 'ico', artwork: mark },
  { file: resolve(root, 'assets', 'logo.ico'), kind: 'ico', artwork: mark },
  { file: resolve(root, 'assets', 'app.ico'), kind: 'ico', artwork: mark },
  { file: resolve(root, 'assets', 'app-icon.png'), kind: 'png', artwork: mark, size: 256 },
  { file: resolve(root, 'assets', 'installer.ico'), kind: 'ico', artwork: whale },
  { file: resolve(root, 'assets', 'installer-icon.png'), kind: 'png', artwork: whale, size: 256 },
]

for (const output of outputs) {
  const relative = output.file.replace(`${root}\\`, '').replaceAll('\\', '/')
  if (output.kind === 'ico') {
    const entries = icoEntries(output.artwork)
    console.log(`${relative}: ${SIZES.join('/')} transparent entries`)
    if (!check) writeFileSync(output.file, encodeIco(entries))
  } else {
    const image = fitSquare(output.artwork, output.size, 1)
    console.log(`${relative}: ${output.size}x${output.size} transparent raster`)
    if (!check) writePng(output.file, image)
  }
}

// The packer reads the committed icon; verify it still decodes.
const entries = decodeIco(readFileSync(resolve(root, 'desktop', 'branding', 'icon.ico')))
console.log(`verified desktop/branding/icon.ico: ${entries.map(e => e.width).join('/')}`)
