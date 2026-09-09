/**
 * Shipped BAF preset: discoverable as system trust, ordered after standard,
 * built-in only (not copyable into the user root), and not shadowable or
 * deletable as system.
 */

import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include, { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as yaml from 'js-yaml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AgentPresets, {
  COMPOSITION_FILE,
  METADATA_FILE,
  SHIPPED_PRESET_ROOT,
  type Config,
} from '@deepseek-ai/dsh-agent-presets'
import { presetDisplayText } from '../src/display.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

let home: string
let previousHome: string | undefined
const roots: string[] = []

beforeEach(async () => {
  previousHome = process.env.DSH_HOME
  home = await mkdtemp(join(tmpdir(), 'dsh-baf-roster-'))
  process.env.DSH_HOME = home
})

afterEach(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function roster(config: Partial<Config> = {}): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentPresets, {
    default: 'standard',
    roots: [],
    includeShippedRoot: true,
    includeUserRoot: true,
    ...config,
  })
  return ctx
}

describe('shipped BAF roster', () => {
  it('lists baf as system trust after standard, with standard still default', async () => {
    const ctx = await roster({ includeUserRoot: false })
    const listed = await ctx.agentPresets.list()

    expect(listed.map(preset => preset.id)).toEqual(['standard', 'baf', 'ptc', 'minimal', 'cordis'])
    expect(listed.find(preset => preset.id === 'baf')).toMatchObject({
      id: 'baf',
      trust: 'system',
      copyable: false,
      path: join(SHIPPED_PRESET_ROOT, 'baf', COMPOSITION_FILE),
    })
    expect(listed.find(preset => preset.id === 'standard')?.copyable).toBeUndefined()
    expect(listed.every(preset => preset.trust === 'system')).toBe(true)
    expect(ctx.agentPresets.defaultId).toBe('standard')
    expect(listed.map(preset => preset.broken)
      .filter(reason => reason !== undefined && !reason.includes('cannot be resolved'))).toEqual([])
  })

  it('keeps a parseable composition with BAF persona and Phase 3 domain services', async () => {
    const source = await readFile(join(SHIPPED_PRESET_ROOT, 'baf', 'agent.cordis.yml'), 'utf8')
    const entries: unknown = yaml.load(source, { schema: entryListSchema })
    expect(Array.isArray(entries)).toBe(true)
    expect(source).toContain('BAF 企业编码 Agent')
    expect(source).toContain('You are the BAF enterprise coding agent')
    expect(source).toContain("name: '@deepseek-ai/dsh-baf-core'")
    expect(source).toMatch(/^\s*- id: baf-core\s*$/m)
    expect(source).toContain("name: '@deepseek-ai/dsh-baf-workflow'")
    expect(source).toMatch(/^\s*- id: baf-workflow\s*$/m)
    expect(source).toContain('bafWorkflow: true')
    expect(source).toContain('Phase 5 起启用')
    expect(source).toMatch(/^\s*- id: baf-openspec\s*$/m)
  })

  it('resolves built-in display keys for baf', () => {
    expect(presetDisplayText({ id: 'baf', trust: 'system', name: 'BAF 模式' }, key => `t:${key}`))
      .toEqual({ name: 't:presetBafName', description: 't:presetBafDescription' })
  })

  it('refuses to copy official baf into the user root, and refuses to delete the system original', async () => {
    const userRoot = await mkdtemp(join(tmpdir(), 'dsh-baf-user-'))
    roots.push(userRoot)
    const ctx = await roster({
      roots: [{ path: userRoot, trust: 'user' }],
      includeUserRoot: false,
    })

    await expect(ctx.agentPresets.copy('baf', 'my-baf', '我的 BAF'))
      .rejects.toThrow(/built-in only|cannot be copied/)
    expect(existsSync(join(userRoot, 'my-baf'))).toBe(false)

    await expect(ctx.agentPresets.remove('baf')).rejects.toThrow(/ships with the deployment/)
  })

  it('does not let a user directory named baf shadow the shipped preset', async () => {
    const userRoot = await mkdtemp(join(tmpdir(), 'dsh-baf-shadow-'))
    roots.push(userRoot)
    await mkdir(join(userRoot, 'baf'), { recursive: true })
    await writeFile(join(userRoot, 'baf', COMPOSITION_FILE), '- id: shadow\n  name: ./missing.js\n')
    await writeFile(join(userRoot, 'baf', METADATA_FILE), 'name: 假冒 BAF\n')

    const ctx = await roster({
      roots: [{ path: userRoot, trust: 'user' }],
      includeUserRoot: false,
    })
    const baf = (await ctx.agentPresets.list()).find(preset => preset.id === 'baf')
    expect(baf?.trust).toBe('system')
    expect(baf?.path.startsWith(SHIPPED_PRESET_ROOT)).toBe(true)
    expect(baf?.name).not.toBe('假冒 BAF')
  })
})
