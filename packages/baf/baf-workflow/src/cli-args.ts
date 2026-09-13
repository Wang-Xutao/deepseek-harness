/**
 * Key=value argument grammar shared by BAF slash commands and the CLI
 * (§12 Phase 8.1/8.2): one surface, one parser. Tokens are `key=value`,
 * `key="quoted value"`, or `key='single quoted'`; bare tokens without `=`
 * collect as positionals. Keys repeat; later values append.
 * @module @deepseek-ai/dsh-baf-workflow/cli-args
 */

/** Parsed arguments: repeatable keyed values plus bare positional tokens. */
export interface ParsedArgs {
  /** Every `key=value` occurrence in input order. */
  readonly entries: readonly { readonly key: string; readonly value: string }[]
  /** Bare tokens (no `=`), in order. */
  readonly positionals: readonly string[]
}

/**
 * Split one input line into quoted-aware argument tokens.
 * @param input - raw text after the command name.
 * @returns whitespace-separated tokens with quoting preserved semantics.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let hasToken = false
  for (const char of input.trim()) {
    if (quote !== undefined) {
      if (char === quote) quote = undefined
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      hasToken = true
      continue
    }
    if (char === ' ' || char === '\t') {
      if (hasToken) tokens.push(current)
      current = ''
      hasToken = false
      continue
    }
    current += char
    hasToken = true
  }
  if (hasToken) tokens.push(current)
  return tokens
}

/**
 * Parse key=value argument tokens.
 * @param input - raw text after the command name.
 * @returns parsed entries and positionals.
 */
export function parseArgs(input: string): ParsedArgs {
  const entries: { key: string; value: string }[] = []
  const positionals: string[] = []
  for (const token of tokenize(input)) {
    const eq = token.indexOf('=')
    if (eq <= 0) {
      positionals.push(token)
      continue
    }
    entries.push({ key: token.slice(0, eq), value: token.slice(eq + 1) })
  }
  return { entries, positionals }
}

/**
 * All values recorded for one key, in order.
 * @param args - parsed arguments.
 * @param key - key to read.
 * @returns values (empty when the key is absent).
 */
export function valuesOf(args: ParsedArgs, key: string): string[] {
  return args.entries.filter(entry => entry.key === key).map(entry => entry.value)
}

/**
 * The single value recorded for one key.
 * @param args - parsed arguments.
 * @param key - key to read.
 * @returns the value, or undefined when absent or repeated.
 */
export function valueOf(args: ParsedArgs, key: string): string | undefined {
  const values = valuesOf(args, key)
  return values.length === 1 ? values[0] : undefined
}
