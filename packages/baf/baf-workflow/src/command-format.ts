/**
 * Standardized slash-command report text for GenericCommandCard.
 * First line is the collapsed summary; the rest is the expandable body.
 * @module @deepseek-ai/dsh-baf-workflow/command-format
 */

/** One section inside a command report. */
export interface CommandReportSection {
  readonly title: string
  readonly lines: readonly string[]
}

/**
 * Build a multi-line command result that prints clearly in the command card.
 * @param ok - success vs error tone in the headline.
 * @param headline - short first-line summary (collapsed row).
 * @param sections - titled blocks for the expandable body.
 * @returns report text.
 */
export function formatCommandReport(
  ok: boolean,
  headline: string,
  sections: readonly CommandReportSection[],
): string {
  const mark = ok ? '✓' : '✗'
  const parts: string[] = [
    `${mark} ${headline}`,
    '────────────────────────────────',
    '类型：系统斜杠指令，无需大模型',
  ]
  for (const section of sections) {
    parts.push('')
    parts.push(`【${section.title}】`)
    for (const line of section.lines) {
      parts.push(line === '' ? '' : `  ${line}`)
    }
  }
  return parts.join('\n')
}

/**
 * Human label for workflow mode ids.
 * @param mode - mode string from projection / template.
 * @returns Chinese label.
 */
export function modeZh(mode: string): string {
  switch (mode) {
    case 'template': return '模板（空闲参考图）'
    case 'full-go-path': return '完整流程'
    case 'bug-fix-path': return '缺陷修复路径'
    case 'clarify-required': return '需先澄清'
    default: return mode
  }
}

/**
 * Slash → description map (mirrors the descriptors in `commands.ts`).
 *
 * Lives here — beside the card formatter, with no imports — so the §22.19
 * single-mint entry (`begin-intake.ts`) can build byte-identical cards
 * without importing `command-drives.ts` (which imports it back).
 */
export const SLASH_DESC: Record<string, string> = {
  '/baf-go': '自动驱动到下一个客户确认点 · ★★★',
  '/baf-workflow-open': '启动变更：intake 分类 · ★★★',
  // 【变更】2026-09-23 (demo1 issue #1): was「分类确认 / 拒绝 · ★★」— the static
  // capability enumeration read as an OUTCOME on the collapsed card row
  // (「分类确认被拒绝?」); the title below already carries the real outcome
  // (已确认并进入 open / 已拒绝 <id>), so the descriptor drops the「/ 拒绝」.
  '/baf-workflow-classify': '分类确认 · ★★',
  '/baf-workflow-clarify': '澄清阶段（N2） · ★★',
  '/baf-workflow-design': '设计阶段（N3） · ★★',
  '/baf-workflow-plan': '计划阶段（N4） · ★★',
  '/baf-workflow-implement': '实现阶段（N5 进入/完成） · ★★★',
  '/baf-workflow-verify': '验证阶段（N6） · ★★★',
  '/baf-workflow-archive': '归档变更（N7/T14，需 confirm） · ★★★',
  '/baf-workflow-abandon': '放弃变更（T16，需 confirm） · ★',
  '/baf-workflow-resume': 'drift 复位（T13，需选目标节点） · ★★★',
  '/baf-check-quality': '基线 C 栈质量检查 · ★★',
  '/baf-check-guard': '安全门禁（verify + secret-scan） · ★★',
  '/baf-scaffold': '初始化工作区（scaffold） · ★★（与 §22 scaffold 门同源）',
}

/**
 * Build a slash-command card title from its description + optional runtime info.
 * @param slash - slash command name (must have a {@link SLASH_DESC} row).
 * @param runtime - optional runtime qualifier (change id, outcome, …).
 * @returns rendered card title.
 */
export function cardTitle(slash: string, runtime?: string): string {
  const desc = SLASH_DESC[slash] ?? slash
  return runtime === undefined
    ? `${desc} · 点本行展开/折叠详情`
    : `${desc} · ${runtime} · 点本行展开/折叠详情`
}
