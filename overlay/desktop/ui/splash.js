const statuses = ['正在启动服务…', '正在检查更新…', '正在准备界面…', '即将完成…']
let i = 0
setInterval(() => {
  i = (i + 1) % statuses.length
  const el = document.getElementById('status')
  if (el) el.textContent = statuses[i]
}, 2400)
