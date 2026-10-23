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

// 【变更】2026-10-22 (批次十五 1): after 5s still on the splash, reveal the
// slow-launch band — the copy explains the wait and 后台启动 hides the splash
// so the boot finishes in the tray (the main window shows itself when the
// backend is ready). The band is overflow-collapsed until .on, so the button
// is unreachable before the reveal.
window.setTimeout(() => {
  const block = document.getElementById('slowBlock')
  if (block) block.classList.add('on')
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
