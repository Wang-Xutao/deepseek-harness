/**
 * Build NSIS-compatible BMP assets from branding/deepseek.png.
 * MUI welcome/finish sidebar: 164×314, 24-bit BMP (PNG often renders as blank).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { writeFileSync } from 'node:fs'

const overlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const branding = join(overlayRoot, 'desktop', 'branding')
const srcPng = join(branding, 'deepseek.png')
const sidebarBmp = join(branding, 'installerSidebar.bmp')
const headerBmp = join(branding, 'installerHeader.bmp')

if (!existsSync(srcPng)) {
  console.error(`缺少 ${srcPng}`)
  process.exit(1)
}

const ps1 = join(tmpdir(), `baf-dsh-branding-${process.pid}.ps1`)
writeFileSync(
  ps1,
  `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-Bmp([string]$Src, [string]$Dest, [int]$W, [int]$H, [bool]$Sidebar) {
  $srcImg = [System.Drawing.Image]::FromFile($Src)
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::FromArgb(255, 245, 247, 252))
  if ($Sidebar) {
    $max = [Math]::Min($W - 32, $H - 80)
    $dw = $max
    $dh = [int]($srcImg.Height * $dw / $srcImg.Width)
    if ($dh -gt ($H - 80)) {
      $dh = $H - 80
      $dw = [int]($srcImg.Width * $dh / $srcImg.Height)
    }
    $x = [int](($W - $dw) / 2)
    $y = [int](($H - $dh) / 2) - 10
    $g.DrawImage($srcImg, $x, $y, $dw, $dh)
  } else {
    $dh = $H - 16
    $dw = [int]($srcImg.Width * $dh / $srcImg.Height)
    if ($dw -gt ($W - 24)) {
      $dw = $W - 24
      $dh = [int]($srcImg.Height * $dw / $srcImg.Width)
    }
    $x = 12
    $y = [int](($H - $dh) / 2)
    $g.DrawImage($srcImg, $x, $y, $dw, $dh)
  }
  $g.Dispose()
  $srcImg.Dispose()
  # 24-bit BMP for NSIS MUI
  $bmp.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
}

New-Bmp '${srcPng.replace(/\\/g, '\\\\')}' '${sidebarBmp.replace(/\\/g, '\\\\')}' 164 314 $true
New-Bmp '${srcPng.replace(/\\/g, '\\\\')}' '${headerBmp.replace(/\\/g, '\\\\')}' 150 57 $false
Write-Output 'ok'
`,
  'utf8',
)

const result = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
  { encoding: 'utf8' },
)
if (result.status !== 0) {
  console.error(result.stdout)
  console.error(result.stderr)
  process.exit(result.status ?? 1)
}
console.log(`wrote ${sidebarBmp}`)
console.log(`wrote ${headerBmp}`)
