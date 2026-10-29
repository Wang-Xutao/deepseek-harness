/**
 * Slice one rule domain from the rules document by `## <anchor>` heading.
 * @param content - rules document text.
 * @param anchor - area id.
 * @returns trimmed section, or undefined when missing.
 */
export function sliceAreaContent(content: string, anchor: string): string | undefined {
  const lines = content.split('\n')
  const start = lines.findIndex(line => line.startsWith(`## ${anchor} `) || line.trim() === `## ${anchor}`)
  if (start === -1) return undefined
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith('## ') === true) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}
