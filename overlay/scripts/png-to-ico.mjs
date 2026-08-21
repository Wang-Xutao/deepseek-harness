/**
 * Convert the two whale PNGs to multi-size Windows ICO files.
 * png-to-ico requires a real PNG; a JPEG saved as .png will fail.
 */
import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'

const assets = resolve(dirname(fileURLToPath(import.meta.url)), '../assets')
const pairs = [
  ['app-icon.png', 'app.ico'],
  ['installer-icon.png', 'installer.ico'],
]

for (const [source, dest] of pairs) {
  const buffer = await pngToIco(resolve(assets, source))
  await writeFile(resolve(assets, dest), buffer)
  console.log(`wrote ${dest}`)
}
