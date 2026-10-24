/**
 * 【变更】2026-10-24 (批次十八 2.3): the shared display helpers for a change
 * row — the 工作流 page's 变更总览 ledger and the session's 变更总览 modal
 * read the same rollup, so they format it the same way.
 * 【变更】2026-10-24 (批次十九 2.3): the shared TIMESTAMP formatter — the
 * 测试流图 surface and the standalone 变更看板 board both print report
 * timestamps, so they print them the same way (`YYYY-MM-DD HH:mm:ss`, local).
 */
import type { WorkflowTabKey } from './locales.ts'

/**
 * A change's mode, as the wire carries it (`full-go-path`), mapped to the
 * locale key that names it (`mode.fullGoPath`).
 */
const MODE_LOCALE_KEYS: Record<string, WorkflowTabKey> = {
  'template': 'mode.template',
  'full-go-path': 'mode.fullGoPath',
  'bug-fix-path': 'mode.bugFixPath',
  'clarify-required': 'mode.clarify',
}

/**
 * The mode's display label.
 * @param mode - wire mode value.
 * @param t - locale binder.
 * @returns the localized label (the raw mode when unknown).
 */
export function modeLabel(mode: string, t: (key: WorkflowTabKey) => string): string {
  const key = MODE_LOCALE_KEYS[mode]
  return key === undefined ? mode : t(key)
}

/**
 * A report timestamp rendered as `YYYY-MM-DD HH:mm:ss` in the LOCAL timezone —
 * the wire carries an ISO-ish string (`2026-10-21T10:00:00Z`) the customer
 * cannot read at a glance. The wire value is only "ISO-ish", so an unparsable
 * string falls back to ITSELF (never a fabricated date) and a missing one to
 * the em dash.
 * @param raw - the wire timestamp, or undefined.
 * @returns the local-time text, the raw string when it cannot be parsed, or
 *   `—` when there is no timestamp at all.
 */
export function formatTimestamp(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') return '—'
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  const pad = (value: number): string => String(value).padStart(2, '0')
  const day = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
  const clock = `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
  return `${day} ${clock}`
}

/**
 * Format a duration: `—` for an unknown value, `0s` for a real zero, then
 * ms / s / m+s.
 * @param ms - duration in ms, or undefined.
 * @returns the display text.
 */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms < 0) return '—'
  if (ms === 0) return '0s'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m${seconds}s`
}

/**
 * K is the default token unit everywhere — a value under a thousand reads 0K
 * (not a bare number that reads like a different unit), millions keep the M
 * tier.
 * @param value - non-negative token count.
 * @returns compact display string (0K / 12.3K / 1.2M).
 */
export function formatTokenCount(value: number): string {
  const scaled = (candidate: number): string =>
    candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10)
  if (value < 1_000) return '0K'
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`
  return `${scaled(value / 1_000_000)}M`
}

/**
 * A change row's token total: `—` when no model work was attributed.
 * @param input - input tokens, or undefined.
 * @param output - output tokens, or undefined.
 * @returns the display text.
 */
export function formatTokens(input?: number, output?: number): string {
  if (input === undefined && output === undefined) return '—'
  return formatTokenCount((input ?? 0) + (output ?? 0))
}
