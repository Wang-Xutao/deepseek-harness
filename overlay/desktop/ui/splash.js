;(function applyVersion() {
  const params = new URLSearchParams(window.location.search)
  const raw = (params.get('version') ?? '').trim()
  if (raw.length > 0) {
    // Strip product prefixes so the footer shows a compact "vX.Y.Z" only.
    const version = raw
      .replace(/^baf-dsh(?:\s+desktop)?\s*/i, '')
      .replace(/^v/i, '')
    const el = document.getElementById('version')
    if (el) el.textContent = `v${version}`
  }
  // 【变更】2026-10-22 (批次十四 1): first launch (main passed first=1 — no
  // Node binary cached yet) — reveal the top-right 首次启动 hint after a 3s
  // grace so a launch that finishes quickly never flashes it.
  if (params.get('first') === '1') {
    window.setTimeout(() => {
      const hint = document.getElementById('firstHint')
      if (hint) hint.hidden = false
    }, 3000)
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
setInterval(() => {
  i = (i + 1) % statuses.length
  const el = document.getElementById('status')
  if (el) el.textContent = statuses[i]
}, 2000)
