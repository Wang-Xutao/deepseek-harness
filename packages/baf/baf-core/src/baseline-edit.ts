/**
 * Comment-preserving surgical edit of the baseline's `guard.protectedPaths`
 * list. 【变更】2026-10-18 (项目工程 1.3): the 设置→工作流→项目工程 tab edits
 * the git-managed AI 禁改路径 from the UI — the whole-file `js-yaml` dump would
 * flatten every customer comment, so this module rewrites ONLY the
 * `protectedPaths` value lines inside the `guard:` block and leaves the rest
 * of the document byte-identical. Pure text work — the caller re-loads the
 * result through {@link parseBaselineManifest} before it ever reaches disk.
 * @module @deepseek-ai/dsh-baf-core/baseline-edit
 */

import { BafError } from './errors.ts'
import { WORKFLOW_NODES, type WorkflowNode } from './workflow.ts'

/** Canonical form of one protected-path entry: forward slashes, no leading
 * `./`, no trailing `/`, `dir` and `dir/**` both legal (matchesPathEntry
 * semantics on the guard side). */
export function normalizeProtectedPathEntry(entry: string): string {
  return entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

/** Outcome of validating a UI-proposed protected-paths list. */
export type ProtectedPathsValidation =
  | { readonly ok: true; readonly paths: readonly string[] }
  | { readonly ok: false; readonly message: string }

/**
 * Validate a proposed list: non-empty strings, workspace-relative (no drive /
 * leading-slash absolute, no `..` segment), single `/**` suffix at most, and
 * deduplicated after normalization.
 * @param entries - raw UI strings.
 * @returns normalized list, or the first problem as a customer-readable line.
 */
export function validateProtectedPaths(entries: readonly string[]): ProtectedPathsValidation {
  const seen = new Set<string>()
  const paths: string[] = []
  for (const raw of entries) {
    if (typeof raw !== 'string' || raw.trim() === '') {
      return { ok: false, message: '路径不能为空' }
    }
    const entry = normalizeProtectedPathEntry(raw.trim())
    if (entry === '') return { ok: false, message: `路径不能为空：${raw}` }
    if (/^[a-zA-Z]:\//.test(entry) || entry.startsWith('/')) {
      return { ok: false, message: `请使用工作区相对路径（不要以盘符或 / 开头）：${raw}` }
    }
    if (entry.split('/').includes('..')) {
      return { ok: false, message: `路径不得包含 .. 上跳段：${raw}` }
    }
    if ((entry.match(/\/\*\*/g) ?? []).length > 1
      || (entry.includes('**') && !entry.endsWith('/**'))) {
      return { ok: false, message: `通配只支持结尾的 /**（整棵子树）：${raw}` }
    }
    if (entry === '.git' || entry === '.git/**' || entry === '.baf' || entry === '.baf/**') {
      return { ok: false, message: `${entry} 由产品内建保护，无需配置` }
    }
    if (!seen.has(entry)) {
      seen.add(entry)
      paths.push(entry)
    }
  }
  return { ok: true, paths }
}

/** One line split off its terminator (`\n` kept; `\r` stays glued to body). */
interface Line {
  readonly body: string
  readonly eol: string
}

function splitLines(text: string): Line[] {
  const out: Line[] = []
  for (const piece of text.split('\n')) {
    const crlf = piece.endsWith('\r')
    out.push({ body: crlf ? piece.slice(0, -1) : piece, eol: crlf ? '\r\n' : '\n' })
  }
  // split('') on trailing newline yields a final empty piece with no real
  // line behind it — drop it so joining back reproduces the original text.
  if (out.length > 0 && out.at(-1)?.body === '' && text !== '') out.pop()
  return out
}

function joinLines(lines: readonly Line[]): string {
  return lines.map(line => `${line.body}${line.eol}`).join('')
}

const TOP_GUARD = /^guard:\s*(#.*)?$/
const PROTECTED_KEY = /^(\s+)protectedPaths:\s*(.*)$/
const LIST_ENTRY = /^\s+-\s+/

/**
 * Rewrite `guard.protectedPaths` in a baseline document. The `guard:` block
 * must exist (the scaffold always writes one; schema requires it) — a missing
 * block is a `baseline_unavailable` BafError, not a silent append, so the
 * caller can tell the customer to repair the file instead of us guessing
 * where a new top-level key belongs.
 * @param text - the full baseline.yml text.
 * @param paths - validated, normalized entries (may be empty).
 * @returns the rewritten text; byte-identical outside the list section.
 * @throws {BafError} when no top-level `guard:` → `protectedPaths:` exists.
 */
export function rewriteBaselineProtectedPaths(text: string, paths: readonly string[]): string {
  const lines = splitLines(text)
  const guardIndex = lines.findIndex(line => TOP_GUARD.test(line.body))
  if (guardIndex === -1) {
    throw new BafError('baseline_unavailable', 'baseline has no top-level guard: block to edit')
  }
  let keyIndex = -1
  let keyIndent = ''
  for (let index = guardIndex + 1; index < lines.length; index += 1) {
    const body = lines[index]?.body
    if (body === undefined || body.trim() === '') continue
    if (!body.startsWith(' ')) break // left the guard block
    const match = PROTECTED_KEY.exec(body)
    if (match !== null) {
      keyIndex = index
      keyIndent = match[1] ?? ''
      break
    }
  }
  if (keyIndex === -1) {
    throw new BafError('baseline_unavailable', 'guard: block has no protectedPaths key to edit')
  }

  const keyLine = lines[keyIndex] as Line
  const entryIndent = `${keyIndent}  `
  const eol = keyLine.eol

  /** Is the line at `index` part of the old value (entry, or a comment/blank
   * sandwiched inside the list)? A blank/comment that only SEPARATES the list
   * from the next sibling key stays untouched — hence the lookahead. */
  const continuesList = (index: number): boolean => {
    const body = lines[index]?.body ?? ''
    if (body.trim() === '') {
      for (let ahead = index + 1; ahead < lines.length; ahead += 1) {
        const next = lines[ahead]?.body ?? ''
        if (next.trim() === '') continue
        return LIST_ENTRY.test(next)
      }
      return false
    }
    if (LIST_ENTRY.test(body)) return true
    return body.trim().startsWith('#') && body.length - body.trimStart().length > keyIndent.length
  }

  // Section to replace: the key line itself (dropping any inline value) plus
  // every following line that still belongs to the old block list.
  const sectionEnd = (() => {
    let index = keyIndex + 1
    while (index < lines.length && continuesList(index)) index += 1
    return index
  })()

  // One output shape: an empty list writes inline `[]`; otherwise a block
  // list under the key (entries one indent deeper, mirroring the scaffold).
  const replacement: Line[] = [
    { body: `${keyIndent}protectedPaths:${paths.length === 0 ? ' []' : ''}`, eol },
    ...paths.map(entry => ({ body: `${entryIndent}- ${entry}`, eol })),
  ]
  const assembled = [...lines.slice(0, keyIndex), ...replacement, ...lines.slice(sectionEnd)]
  return joinLines(assembled)
}

/* ────────────────────────────────────────────────────────────────────────
 * 【变更】2026-10-19 (六问题批 4.1b): per-node custom scripts (hooks.nodes.
 * <node>.enter/exit) — the same surgical-edit discipline protectedPaths got:
 * validate first, rewrite ONLY the `hooks:` top-level block, leave the rest
 * byte-identical. Unlike guard:, the scaffold never writes a `hooks:` block,
 * so the rewrite may APPEND one (a new top-level key at EOF is always safe)
 * and an empty draft REMOVES the block instead of leaving dead config.
 * ──────────────────────────────────────────────────────────────────────── */

/** The UI's draft shape for one node's hook lists. */
export interface NodeHookLists {
  readonly enter?: readonly string[]
  readonly exit?: readonly string[]
}

/** Canonical form of one hook entry: forward slashes, no `./`, no trailing `/`. */
function normalizeHookEntry(entry: string): string {
  return entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

/** Outcome of validating a UI-proposed hooks map. */
export type NodeHooksValidation =
  | { readonly ok: true; readonly hooks: Readonly<Record<WorkflowNode, NodeHookLists>> }
  | { readonly ok: false; readonly message: string }

/**
 * Validate a proposed hooks map: known workflow nodes only, non-empty
 * workspace-relative file paths (no drive / leading slash, no `..`, no
 * wildcards — a hook points at ONE file), deduplicated per list.
 * @param raw - the UI draft (node → enter/exit lists).
 * @returns the normalized map (empty lists dropped; an all-empty map is `{}`),
 * or the first problem as a customer-readable line.
 */
export function validateNodeHooks(
  raw: Readonly<Record<string, NodeHookLists>>,
): NodeHooksValidation {
  const hooks: Partial<Record<WorkflowNode, NodeHookLists>> = {}
  /** Normalize one list; `{ error }` short-circuits with a customer line. */
  const build = (
    node: string,
    label: string,
    entries: readonly string[] | undefined,
  ): { readonly entries?: readonly string[]; readonly error?: string } => {
    if (entries === undefined) return {}
    const seen = new Set<string>()
    const out: string[] = []
    for (const rawEntry of entries) {
      if (typeof rawEntry !== 'string' || rawEntry.trim() === '') {
        return { error: `路径不能为空（${node} ${label}）：${String(rawEntry)}` }
      }
      const entry = normalizeHookEntry(rawEntry.trim())
      if (/^[a-zA-Z]:\//.test(entry) || entry.startsWith('/')) {
        return { error: `请使用工作区相对路径（不要以盘符或 / 开头）：${rawEntry}` }
      }
      if (entry.split('/').includes('..')) {
        return { error: `路径不得包含 .. 上跳段：${rawEntry}` }
      }
      if (entry.includes('*')) {
        return { error: `脚本必须是具体文件，不支持通配：${rawEntry}` }
      }
      if (!seen.has(entry)) {
        seen.add(entry)
        out.push(entry)
      }
    }
    return { entries: out }
  }
  for (const [node, lists] of Object.entries(raw)) {
    if (!(WORKFLOW_NODES as readonly string[]).includes(node)) {
      return { ok: false, message: `未知的工作流节点：${node}` }
    }
    const enter = build(node, 'enter', lists.enter)
    if (enter.error !== undefined) return { ok: false, message: enter.error }
    const exit = build(node, 'exit', lists.exit)
    if (exit.error !== undefined) return { ok: false, message: exit.error }
    const cleaned: NodeHookLists = {
      ...(enter.entries !== undefined && enter.entries.length > 0 ? { enter: enter.entries } : {}),
      ...(exit.entries !== undefined && exit.entries.length > 0 ? { exit: exit.entries } : {}),
    }
    if (Object.keys(cleaned).length > 0) hooks[node as WorkflowNode] = cleaned
  }
  return { ok: true, hooks: hooks as Readonly<Record<WorkflowNode, NodeHookLists>> }
}

const TOP_HOOKS = /^hooks:\s*(#.*)?$/

/** Render the replacement block's lines (no trailing blank). */
function renderHooksBlock(
  hooks: Readonly<Record<WorkflowNode, NodeHookLists>>,
  eol: string,
): Line[] {
  const out: Line[] = [{ body: 'hooks:', eol }, { body: '  nodes:', eol }]
  for (const node of WORKFLOW_NODES) {
    const lists = hooks[node]
    if (lists === undefined) continue
    const hasEnter = lists.enter !== undefined && lists.enter.length > 0
    const hasExit = lists.exit !== undefined && lists.exit.length > 0
    out.push({ body: `    ${node}:${!hasEnter && !hasExit ? ' {}' : ''}`, eol })
    if (hasEnter) {
      out.push({ body: '      enter:', eol })
      for (const entry of lists.enter ?? []) out.push({ body: `        - ${entry}`, eol })
    }
    if (hasExit) {
      out.push({ body: '      exit:', eol })
      for (const entry of lists.exit ?? []) out.push({ body: `        - ${entry}`, eol })
    }
  }
  return out
}

/**
 * Rewrite the `hooks:` block in a baseline document. An existing block is
 * replaced in place (key line through the last line of its section); a new
 * non-empty map APPENDS a block at EOF; an empty map REMOVES the block. The
 * rest of the document stays byte-identical.
 * @param text - the full baseline.yml text.
 * @param hooks - validated, normalized map (empty = remove the block).
 * @returns the rewritten text.
 */
export function rewriteBaselineNodeHooks(
  text: string,
  hooks: Readonly<Record<WorkflowNode, NodeHookLists>>,
): string {
  const lines = splitLines(text)
  const hasBlock = hooks !== undefined && Object.keys(hooks).length > 0
  const hooksIndex = lines.findIndex(line => TOP_HOOKS.test(line.body))

  if (hooksIndex === -1) {
    if (!hasBlock) return text
    // Append at EOF: ensure the current last line ends with a newline first.
    if (lines.length > 0) {
      const last = lines[lines.length - 1] as Line
      if (last.eol === '' && last.body !== '') lines[lines.length - 1] = { ...last, eol: '\n' }
    }
    const eol = lines.find(line => line.eol !== '')?.eol ?? '\n'
    const block = renderHooksBlock(hooks, eol === '\r\n' ? '\r\n' : '\n')
    return joinLines([...lines, ...block])
  }

  // Section end: the next top-level key (or comment at column 0) after the
  // hooks: line — everything indented in between belongs to the block.
  let sectionEnd = hooksIndex + 1
  while (sectionEnd < lines.length) {
    const body = lines[sectionEnd]?.body ?? ''
    if (body.trim() !== '' && !body.startsWith(' ')) break
    sectionEnd += 1
  }
  if (!hasBlock) {
    // Remove the block plus ONE blank line that directly trails it (the
    // append added none, but a hand-edited file may have one).
    let end = sectionEnd
    if (end < lines.length && (lines[end]?.body ?? '') === '') end += 1
    return joinLines([...lines.slice(0, hooksIndex), ...lines.slice(end)])
  }
  const eol = (lines[hooksIndex] as Line).eol === '\r\n' ? '\r\n' : '\n'
  const block = renderHooksBlock(hooks, eol)
  return joinLines([...lines.slice(0, hooksIndex), ...block, ...lines.slice(sectionEnd)])
}
