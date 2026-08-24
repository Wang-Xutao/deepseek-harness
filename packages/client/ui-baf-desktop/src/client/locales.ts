/** Locale keys for baf desktop chrome. */

export type BafDesktopKey =
  | 'help.trigger'
  | 'help.title'
  | 'help.close'
  | 'help.openBrowser'
  | 'ide.openVscode'
  | 'ide.openCursor'
  | 'ide.noWorkspace'
  | 'ide.failed'

export const zh: Record<BafDesktopKey, string> = {
  'help.trigger': '帮助',
  'help.title': '帮助',
  'help.close': '关闭帮助',
  'help.openBrowser': '在浏览器中打开',
  'ide.openVscode': '在 VS Code 中打开工作区',
  'ide.openCursor': '在 Cursor 中打开工作区',
  'ide.noWorkspace': '当前没有工作区目录可打开。',
  'ide.failed': '无法打开 IDE',
}

export const en: Record<BafDesktopKey, string> = {
  'help.trigger': 'Help',
  'help.title': 'Help',
  'help.close': 'Close help',
  'help.openBrowser': 'Open in browser',
  'ide.openVscode': 'Open workspace in VS Code',
  'ide.openCursor': 'Open workspace in Cursor',
  'ide.noWorkspace': 'No workspace folder is available to open.',
  'ide.failed': 'Could not open the IDE',
}
