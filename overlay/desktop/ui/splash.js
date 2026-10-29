;(function applyVersion() {
  const params = new URLSearchParams(window.location.search)
  const raw = (params.get('version') ?? '').trim()
  if (raw.length > 0) {
    // Strip product prefixes so the corner badge shows a compact "vX.Y.Z" only.
    const version = raw
      .replace(/^baf-dsh(?:\s+desktop)?\s*/i, '')
      .replace(/^v/i, '')
    const el = document.getElementById('version')
    if (el) el.textContent = `v${version}`
  }
})()

const statuses = [
  '正在启动服务…',
  '正在加载插件…',
  '正在初始化工作流…',
  '正在检查更新…',
  '正在准备界面…',
  '即将完成…',
]
let i = 0

/**
 * 【变更】2026-10-27: the slow-start sentence is NOT one of the rotating
 * statuses — it is the quiet annotation in the panel's top-left corner
 * (splash.css), and the row that owns both corners carries the reveal.
 */
const SLOW_HINT = '首次启动耗时较久，请耐心等待…'

const statusEl = document.getElementById('status')
const bgStart = document.getElementById('bgStart')
const topRow = document.getElementById('topRow')
const slowHintEl = document.getElementById('slowHint')

if (slowHintEl) slowHintEl.textContent = SLOW_HINT

function renderStatus() {
  if (statusEl) statusEl.textContent = statuses[i]
}

/**
 * 【变更】2026-10-27: the hint and the button reveal together — one class on
 * the row, so neither is ever shown alone, and the rotating line keeps
 * reporting boot statuses only.
 */
window.setTimeout(() => {
  topRow?.classList.add('on')
}, 5000)

bgStart?.addEventListener('click', () => {
  window.bafSplash?.backgroundStart()
})

setInterval(() => {
  i = (i + 1) % statuses.length
  renderStatus()
}, 2000)
