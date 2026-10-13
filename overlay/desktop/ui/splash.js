;(function applyVersion() {
  const params = new URLSearchParams(window.location.search)
  const raw = (params.get('version') ?? '').trim()
  if (raw.length === 0) return
  // Strip product prefixes so the footer shows a compact "vX.Y.Z" only.
  const version = raw
    .replace(/^baf-dsh(?:\s+desktop)?\s*/i, '')
    .replace(/^v/i, '')
  const el = document.getElementById('version')
  if (el) el.textContent = `v${version}`
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
