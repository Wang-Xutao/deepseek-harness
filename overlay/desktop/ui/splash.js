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
 * 【变更】2026-10-23 (批次十八 1.1): the slow-start sentence carries the same
 * trailing ellipsis every other status line carries.
 */
const SLOW_HINT = '首次启动耗时较久，请耐心等待…'

const statusEl = document.getElementById('status')
const bgStart = document.getElementById('bgStart')

function renderStatus() {
  if (statusEl) statusEl.textContent = statuses[i]
}

/**
 * 【变更】2026-10-23 (批次十八 1.4): the 后台启动 button reveals in the SAME
 * frame as the sentence that explains it. The hint takes the next slot in the
 * rotating list and the line jumps to it right away, so the button never sits
 * alone ahead of its own hint (batch 十七 showed the button at 5 s while the
 * sentence waited up to a full rotation slot).
 */
window.setTimeout(() => {
  statuses.splice(i + 1, 0, SLOW_HINT)
  i = (i + 1) % statuses.length
  renderStatus()
  bgStart?.classList.add('on')
}, 5000)

bgStart?.addEventListener('click', () => {
  window.bafSplash?.backgroundStart()
})

setInterval(() => {
  i = (i + 1) % statuses.length
  renderStatus()
}, 2000)
