import { describe, expect, it } from 'vitest'
import { collectNodeCandidates, findSupportedNode, type NodeProbe } from '../src/find-node.ts'

describe('findSupportedNode', () => {
  it('skips an old PATH node and uses Program Files 22.19', () => {
    const env: NodeJS.ProcessEnv = {
      PATH: 'C:\\old-node',
      ProgramFiles: 'C:\\Program Files',
    }
    const versions: Record<string, string> = {
      'C:\\old-node\\node.exe': 'v18.20.0',
      'C:\\Program Files\\nodejs\\node.exe': 'v22.19.0',
    }
    const probe: NodeProbe = {
      exists: (path) => path in versions,
      version: (path) => versions[path],
    }
    expect(findSupportedNode(env, 'win32', probe)).toBe('C:\\Program Files\\nodejs\\node.exe')
  })

  it('honors DSH_NODE_BINARY when it is in range', () => {
    const env: NodeJS.ProcessEnv = { DSH_NODE_BINARY: 'D:\\custom\\node.exe', PATH: '' }
    const probe: NodeProbe = {
      exists: (path) => path === 'D:\\custom\\node.exe',
      version: () => 'v24.1.0',
    }
    expect(findSupportedNode(env, 'win32', probe)).toBe('D:\\custom\\node.exe')
  })

  it('returns undefined when every candidate is missing or out of range', () => {
    const env: NodeJS.ProcessEnv = { PATH: 'C:\\old-node' }
    const probe: NodeProbe = {
      exists: (path) => path.endsWith('node.exe'),
      version: () => 'v20.11.0',
    }
    expect(findSupportedNode(env, 'win32', probe)).toBeUndefined()
  })
})

describe('collectNodeCandidates', () => {
  it('puts DSH_NODE_BINARY first', () => {
    const list = collectNodeCandidates(
      { DSH_NODE_BINARY: 'Z:\\node.exe', PATH: 'C:\\p', ProgramFiles: 'C:\\Program Files' },
      'win32',
    )
    expect(list[0]).toBe('Z:\\node.exe')
    expect(list).toContain('C:\\p\\node.exe')
    expect(list).toContain('C:\\Program Files\\nodejs\\node.exe')
  })
})
