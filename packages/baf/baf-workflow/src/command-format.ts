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
    '类型：系统斜杠指令（不是大模型回复）',
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
    case 'full-go': return '完整流程 full-go'
    case 'bug-fast-path': return '缺陷快路径 bug-fast-path'
    case 'clarify-required': return '需先澄清 clarify-required'
    default: return mode
  }
}
