import { describe, expect, it } from 'vitest'
import { userFacingLaunchError } from '../src/user-errors.ts'

describe('userFacingLaunchError', () => {
  it('maps missing package to reinstall guidance', () => {
    expect(userFacingLaunchError('Error [ERR_MODULE_NOT_FOUND]: Cannot find package')).toContain('重新安装')
  })

  it('maps a ready timeout to retry guidance', () => {
    expect(userFacingLaunchError('启动超时（240s）\nno url yet')).toContain('启动等待超时')
  })

  // The timeout error carries the child's output tail, which may itself mention
  // an exit code; without the timeout check winning, the user would be told the
  // app "failed to start" and never learn it was merely slow.
  it('reports a timeout even when the captured output contains an exit code', () => {
    const message = userFacingLaunchError('启动超时（240s）\n[child] exited code=0 after 30s')
    expect(message).toContain('启动等待超时')
  })

  it('maps port conflict', () => {
    expect(userFacingLaunchError('Error: listen EADDRINUSE')).toContain('端口')
  })

  it('maps early process exit without exposing exit codes', () => {
    const message = userFacingLaunchError('进程在就绪前退出，code=1\nError [ERR_MODULE_NOT_FOUND]')
    expect(message).toContain('重新安装')
    expect(message).not.toMatch(/code=/i)
    expect(message).not.toMatch(/ERR_MODULE/i)
  })

  it('hides technical wording in the default message', () => {
    const message = userFacingLaunchError('weird stack at Object.<anonymous>')
    expect(message).not.toMatch(/stack/i)
    expect(message).toContain('未能正常启动')
  })
})
