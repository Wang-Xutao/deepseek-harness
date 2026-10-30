/**
 * 版本更新探针的 fetch 注入桩（只经 NODE_OPTIONS=--require 注入，不改产品代码）。
 *
 * 更新通道的地址写死在产品里（GitLab host + 项目坐标），所以探针没法用配置
 * 指到本地假通道；这个桩在进程启动时把指向该 GitLab host 的请求改写到本地
 * 假 GitLab API，其余请求一律放行。
 *
 * 它同时被 Electron 主进程和它派生的 dsh 子进程加载（NODE_OPTIONS 会继承），
 * 所以桩必须对非 Electron 进程完全无害。
 */
const base = process.env.BAF_MOCK_GH_BASE
// 【变更】2026-10-30 (升级途径迁移): the channel moved from GitHub to
// GitLab — the stub rewrites the GitLab host's API calls.
const prefix = 'https://gitlab.sinc.lan'

if (typeof base === 'string' && base.length > 0) {
  const realFetch = globalThis.fetch
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string'
      ? input
      : (input !== null && typeof input === 'object' && typeof input.url === 'string' ? input.url : String(input))
    if (url.startsWith(prefix)) return realFetch(base + url.slice(prefix.length), init)
    return realFetch(input, init)
  }
}
