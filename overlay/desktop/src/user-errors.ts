/**
 * Map launch/runtime failures to short Chinese messages for end users.
 * Technical details stay out of the dialog.
 */
export function userFacingLaunchError(raw: string): string {
  const text = raw.toLowerCase()

  if (
    text.includes('err_module_not_found')
    || text.includes('cannot find package')
    || text.includes('cannot find module')
    || text.includes('plugin tree failed')
    || text.includes('aggregateerror')
  ) {
    return '应用程序文件不完整。请卸载后重新安装 baf-dsh，再试一次。'
  }

  if (text.includes('就绪前退出') || text.includes('before ready') || /code=\s*-?\d+/.test(text)) {
    return '应用未能完成启动。请关闭后重试；若仍然失败，请卸载并重新安装 baf-dsh。'
  }

  if (text.includes('eaddrinuse') || text.includes('address already in use')) {
    return '启动所需端口已被占用。请关闭可能冲突的程序后重试。'
  }

  if (text.includes('enoent') && text.includes('node')) {
    return '未找到可用的 Node.js。请重新运行安装包，或安装 Node.js 22.19 及以上版本后重试。'
  }

  if (text.includes('未找到符合要求的 node') || text.includes('unsupported node')) {
    return '本机 Node.js 版本过低。请安装 Node.js 22.19 及以上版本，或重新运行安装包。'
  }

  if (text.includes('未找到 dsh') || text.includes('frontend dist not built')) {
    return '应用程序组件缺失。请卸载后重新安装 baf-dsh。'
  }

  if (text.includes('超时') || text.includes('timeout') || text.includes('未打印就绪')) {
    return '启动时间过长，已取消。请稍后重试；若反复出现，请重新安装。'
  }

  if (text.includes('eacces') || text.includes('permission')) {
    return '没有足够的权限启动应用。请尝试以管理员身份运行，或检查文件夹权限。'
  }

  return '应用未能正常启动。请关闭后重试；若仍然失败，请卸载并重新安装 baf-dsh。'
}
