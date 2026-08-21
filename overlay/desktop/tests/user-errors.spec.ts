import { describe, expect, it } from 'vitest'
import { userFacingLaunchError } from '../src/user-errors.ts'

describe('userFacingLaunchError', () => {
  it('maps missing package to reinstall guidance', () => {
    expect(userFacingLaunchError('Error [ERR_MODULE_NOT_FOUND]: Cannot find package')).toContain('重新安装')
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
