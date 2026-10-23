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
})()

// 【变更】2026-10-23 (批次十七 1): after 5s still on the splash, the slow-start
// hint JOINS the rotating status line (the 正在检查更新… list — one splice, so
// it takes its turn like every other step and the layout never shifts), and
// the 后台启动 button reveals alone at the panel's bottom-left corner.
window.setTimeout(() => {
  statuses.splice(i + 1, 0, '首次启动耗时较久，请耐心等待')
  document.getElementById('bgStart')?.classList.add('on')
}, 5000)

document.getElementById('bgStart')?.addEventListener('click', () => {
  window.bafSplash?.backgroundStart()
})

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
