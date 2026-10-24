/** Locale keys for baf desktop chrome. */

export type BafDesktopKey =
  | 'help.trigger'
  | 'help.title'
  | 'help.close'
  | 'help.openBrowser'
  | 'draft.format'
  | 'draft.format.hint'
  | 'draft.revert'
  | 'draft.revert.hint'
  | 'draft.revert.dirty'
  | 'draft.blocked'
  | 'draft.unchanged'

export const zh: Record<BafDesktopKey, string> = {
  'help.trigger': '帮助',
  'help.title': '帮助',
  'help.close': '关闭帮助',
  'help.openBrowser': '在浏览器中打开',
  'draft.format': '美化',
  'draft.format.hint': '格式化输入',
  'draft.revert': '回退',
  'draft.revert.hint': '还原美化前的原文',
  'draft.revert.dirty': '还原美化前的原文（会丢弃美化之后的修改）',
  'draft.blocked': '草稿里有 @ 文件引用，整理结构会丢失引用，请先移除引用',
  'draft.unchanged': '这段文字的结构已经清晰，无需调整',
}

export const en: Record<BafDesktopKey, string> = {
  'help.trigger': 'Help',
  'help.title': 'Help',
  'help.close': 'Close help',
  'help.openBrowser': 'Open in browser',
  'draft.format': 'Tidy up',
  'draft.format.hint': 'Format the input',
  'draft.revert': 'Revert',
  'draft.revert.hint': 'Restore the draft from before the tidy-up',
  'draft.revert.dirty': 'Restore the draft from before the tidy-up (discards the edits made after it)',
  'draft.blocked': 'The draft holds @ file references; arranging it would drop them, so remove them first',
  'draft.unchanged': 'This draft is already clearly structured',
}
