/**
 * Deterministic Markdown arrangement for a conversation draft.
 *
 * The formatter only ADDS structure: it never rewrites, reorders, or drops a
 * word of the author's text. Every rule turns a run of characters the author
 * already wrote into a Markdown block — paragraphs, bullet lists, fenced code —
 * so the model reads the same request with a clearer shape. Nothing here calls
 * a model, a network, or a clock: the same draft always yields the same text.
 *
 * 【变更】2026-10-25 (批次二十二): new file. The rules are deliberately local and
 * deterministic — the user's constraint was "never rewrite the author's intent,
 * never add content on the side", and a model call can do neither.
 */

/** Longest prose run that stays one output paragraph. */
const MAX_PARAGRAPH_CHARS = 200

/** Sentences one output paragraph carries before the next one starts. */
const SENTENCES_PER_PARAGRAPH = 2

/** Longest line that may become one bullet item. */
const MAX_ITEM_CHARS = 80

/** Sentence terminators that end one prose sentence. */
const SENTENCE_BREAK = /[。！？!?；;]+[”"']?|\.(?=\s|$)/g

/** A line that opens a fenced code block. */
const FENCE_OPEN = /^(?:```|~~~)/

/** A line that opens an ATX heading. */
const HEADING_OPEN = /^#{1,6}\s/

/** A line that opens a list item. */
const LIST_OPEN = /^(?:[-*+]|\d+[.)])\s+/

/** A line that opens a block quote. */
const QUOTE_OPEN = /^>/

/** A line that is a thematic break. */
const RULE_LINE = /^(?:-{3,}|\*{3,}|_{3,})$/

/** A table delimiter row: a pipe, dashes, and colons only. */
const TABLE_DELIMITER = /^\s*\|[\s:|-]*-{1,}[\s:|-]*\|?\s*$/

/** CJK punctuation or ideographs; a line carrying them is prose, never code. */
const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/

/** An English error line, stack frame, or traceback header. */
const CODE_STATEMENT = /^(?:at\s+\S+\s*\(|Traceback\b|[A-Za-z_][\w.]*(?:Error|Exception|Warning)\b)/

/** Chinese lead words that introduce a '、'-separated enumeration. */
const ZH_ENUMERATION_LEAD = /^(?:具体包括|具体有|重点包括|涉及以下|有如下|主要包括|包括|例如|比如|如下|以下|具体如下|分别是|列举|涉及|主要有)/

/** English lead words that introduce a ','-separated enumeration. */
const EN_ENUMERATION_LEAD = /^(?:including|for example|such as|the following|namely)\b/i

/** The kind of Markdown structure one line opens. */
type LineKind = 'heading' | 'list' | 'quote' | 'rule' | 'table' | 'text'

/** One Markdown block of the formatted draft. */
type DraftBlock =
  | { readonly kind: 'fence'; readonly text: string }
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | { readonly kind: 'verbatim'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly lines: readonly string[] }

/** One enumeration the formatter may turn into bullets. */
interface Enumeration {
  /** The lead word plus its colon, kept verbatim. */
  readonly lead: string
  /** The enumerated items, in the author's order. */
  readonly items: readonly string[]
}

/**
 * Arrange a conversation draft into Markdown structure without changing its words.
 * @param raw - the draft text the author typed.
 * @returns the author's words arranged as Markdown blocks.
 */
export function formatDraft(raw: string): string {
  const blocks = splitBlocks(normalize(raw))
  const out: string[] = []
  let previousHeading = 0
  for (const block of blocks) {
    if (block.kind !== 'heading') {
      out.push(...renderBlock(block))
      continue
    }
    // The first heading keeps its level; later ones may not skip one.
    const level = previousHeading === 0 ? block.level : Math.min(block.level, previousHeading + 1)
    previousHeading = level
    out.push(`${'#'.repeat(level)} ${block.text}`)
  }
  return out.join('\n\n')
}

/**
 * Normalize line endings, drop trailing spaces, and collapse blank runs.
 * @param raw - the draft text the author typed.
 * @returns the same lines without trailing spaces or repeated blank lines.
 */
function normalize(raw: string): string {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines: string[] = []
  let blank = false
  for (const line of text.split('\n')) {
    const trimmed = line.replace(/[ \t]+$/, '')
    if (trimmed === '') {
      blank = true
      continue
    }
    // One blank line separates two blocks; a run of them is one separator, and
    // a blank at either end of the draft is dropped.
    if (blank && lines.length > 0) lines.push('')
    blank = false
    lines.push(trimmed)
  }
  return lines.join('\n')
}

/**
 * Cut the normalized draft into its Markdown blocks.
 * @param text - the normalized draft.
 * @returns the blocks in document order.
 */
function splitBlocks(text: string): DraftBlock[] {
  const blocks: DraftBlock[] = []
  let paragraph: string[] = []
  let verbatim: string[] | null = null
  let verbatimKind: LineKind = 'text'
  let fence: string[] | null = null
  let fenceMarker = ''

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', lines: paragraph })
    paragraph = []
  }
  const flushVerbatim = (): void => {
    if (verbatim === null) return
    blocks.push({ kind: 'verbatim', text: verbatim.join('\n') })
    verbatim = null
  }

  for (const line of text.split('\n')) {
    if (fence !== null) {
      fence.push(line)
      if (line.trim().startsWith(fenceMarker)) {
        blocks.push({ kind: 'fence', text: fence.join('\n') })
        fence = null
      }
      continue
    }
    if (line.trim() === '') {
      flushParagraph()
      flushVerbatim()
      continue
    }
    if (FENCE_OPEN.test(line)) {
      flushParagraph()
      flushVerbatim()
      fenceMarker = line.trim().slice(0, 3)
      fence = [line]
      continue
    }
    const kind = lineKind(line)
    if (kind === 'heading') {
      flushParagraph()
      flushVerbatim()
      blocks.push({
        kind: 'heading',
        level: headingLevel(line),
        text: line.replace(/^#{1,6}\s+/, '').trim(),
      })
      continue
    }
    if (kind === 'text') {
      if (verbatim !== null) {
        // A table row and an indented continuation stay with their block; any
        // other prose line ends it.
        const continues = (verbatimKind === 'table' && line.includes('|'))
          || ((verbatimKind === 'list' || verbatimKind === 'quote') && /^\s/.test(line))
        if (continues) {
          verbatim.push(line)
          continue
        }
        flushVerbatim()
      }
      // A delimiter row promotes the paragraph's last line to a table header.
      const header = paragraph.pop()
      if (header !== undefined && TABLE_DELIMITER.test(line) && header.includes('|')) {
        flushParagraph()
        verbatimKind = 'table'
        verbatim = [header, line]
        continue
      }
      if (header !== undefined) paragraph.push(header)
      paragraph.push(line)
      continue
    }
    if (verbatim === null || verbatimKind !== kind) {
      flushParagraph()
      flushVerbatim()
      verbatimKind = kind
      verbatim = []
    }
    verbatim.push(line)
  }
  flushParagraph()
  flushVerbatim()
  if (fence !== null) blocks.push({ kind: 'fence', text: fence.join('\n') })
  return blocks
}

/**
 * Classify the Markdown structure one line opens.
 * @param line - the line to classify.
 * @returns the structure the line opens, or 'text' for prose.
 */
function lineKind(line: string): LineKind {
  if (HEADING_OPEN.test(line)) return 'heading'
  if (LIST_OPEN.test(line)) return 'list'
  if (QUOTE_OPEN.test(line)) return 'quote'
  if (RULE_LINE.test(line)) return 'rule'
  return 'text'
}

/**
 * Count the hashes of one heading line.
 * @param line - the heading line.
 * @returns the heading level.
 */
function headingLevel(line: string): number {
  let level = 0
  while (line.startsWith('#'.repeat(level + 1))) level += 1
  return level
}

/**
 * Render one block into its output paragraphs.
 * @param block - the block to render.
 * @returns the rendered paragraphs.
 */
function renderBlock(block: DraftBlock): string[] {
  if (block.kind === 'paragraph') return formatParagraph(block.lines)
  return [block.text]
}

/**
 * Split one prose block into code lines and prose lines, then render both.
 * @param lines - the block's lines.
 * @returns the rendered paragraphs.
 */
function formatParagraph(lines: readonly string[]): string[] {
  const out: string[] = []
  let prose: string[] = []
  let code: string[] = []
  const flushProse = (): void => {
    if (prose.length === 0) return
    out.push(...proseToBlocks(prose))
    prose = []
  }
  const flushCode = (): void => {
    if (code.length === 0) return
    out.push(['```', ...code, '```'].join('\n'))
    code = []
  }
  for (const line of lines) {
    if (isCodeLine(line)) {
      flushProse()
      code.push(line)
      continue
    }
    flushCode()
    prose.push(line)
  }
  flushCode()
  flushProse()
  return out
}

/**
 * Decide whether one line reads as code rather than prose.
 * @param line - the line to judge.
 * @returns whether the line belongs in a code fence.
 */
function isCodeLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.includes('```')) return false
  if (CJK.test(trimmed)) return false
  if (CODE_STATEMENT.test(trimmed)) return true
  if (/[;{}]|=>|\(\)/.test(trimmed)) return true
  return /^[A-Za-z]:[\\/]/.test(trimmed)
}

/**
 * Arrange the prose lines of one block into paragraphs and bullet lists.
 * @param lines - the prose lines.
 * @returns the rendered paragraphs.
 */
function proseToBlocks(lines: readonly string[]): string[] {
  if (lines.length >= 2 && lines.every(isShortItem)) {
    return [lines.map(line => `- ${line.trim()}`).join('\n')]
  }
  const text = lines.join('\n')
  const sentences = splitSentences(text)
  if (sentences.length < 3 && text.length <= MAX_PARAGRAPH_CHARS) return renderChunk(text)
  const out: string[] = []
  for (const chunk of chunkSentences(sentences)) out.push(...renderChunk(chunk))
  return out
}

/**
 * Decide whether one line reads as a standalone point the author typed.
 * @param line - the line to judge.
 * @returns whether the line may become a bullet item.
 */
function isShortItem(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.length > MAX_ITEM_CHARS) return false
  return /[。！？!?；;.]$/.test(trimmed)
}

/**
 * Split prose into sentences without losing a character.
 * @param text - the prose to split.
 * @returns the sentences, whose concatenation is the prose.
 */
function splitSentences(text: string): string[] {
  const out: string[] = []
  let last = 0
  for (const match of text.matchAll(SENTENCE_BREAK)) {
    const end = match.index + match[0].length
    const piece = text.slice(last, end)
    if (piece !== '') out.push(piece)
    last = end
  }
  const tail = text.slice(last)
  if (tail !== '') out.push(tail)
  return out
}

/**
 * Group sentences into output paragraphs.
 * @param sentences - the sentences of one prose block.
 * @returns the paragraph groups.
 */
function chunkSentences(sentences: readonly string[]): string[] {
  const chunks: string[] = []
  let current = ''
  let count = 0
  for (const sentence of sentences) {
    const tooLong = current.length + sentence.length > MAX_PARAGRAPH_CHARS
    if (current !== '' && (count >= SENTENCES_PER_PARAGRAPH || tooLong)) {
      chunks.push(current)
      current = sentence
      count = 1
      continue
    }
    current += sentence
    count += 1
  }
  if (current !== '') chunks.push(current)
  return chunks
}

/**
 * Render one paragraph group, lifting any enumeration it names into bullets.
 * @param chunk - the sentences of one paragraph group.
 * @returns the rendered paragraphs.
 */
function renderChunk(chunk: string): string[] {
  const out: string[] = []
  let plain = ''
  for (const sentence of splitSentences(chunk)) {
    const enumeration = matchEnumeration(sentence)
    if (enumeration === null) {
      plain += sentence
      continue
    }
    if (plain !== '') {
      out.push(plain)
      plain = ''
    }
    out.push([enumeration.lead, ...enumeration.items.map(item => `- ${item}`)].join('\n'))
  }
  if (plain !== '') out.push(plain)
  return out
}

/**
 * Read the enumeration one sentence names, if it names one.
 * @param sentence - the sentence to read.
 * @returns the enumeration, or null when the sentence names none.
 */
function matchEnumeration(sentence: string): Enumeration | null {
  if (sentence.includes('\n')) return null
  const zh = ZH_ENUMERATION_LEAD.exec(sentence)
  const en = zh === null ? EN_ENUMERATION_LEAD.exec(sentence) : null
  const match = zh ?? en
  if (match === null) return null
  const separator = zh === null ? ',' : '、'
  const head = sentence.slice(0, match[0].length).trimEnd()
  const rest = sentence.slice(match[0].length).replace(/^[：:]\s*/, '')
  const items = rest.split(separator).map(item => item.trim()).filter(item => item !== '')
  if (items.length < 2) return null
  const lead = `${head}${zh === null ? ':' : '：'}`
  return { lead, items }
}
