/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
  'desktopClose.title': '关闭窗口时',
  'desktopClose.description': '仅桌面应用生效：直接退出、最小化到托盘，或每次询问',
  'desktopClose.ask': '每次询问',
  'desktopClose.tray': '最小化到托盘',
  'desktopClose.quit': '直接退出',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'desktopClose.title': 'When closing the window',
  'desktopClose.description': 'Desktop app only: quit, minimize to tray, or ask every time',
  'desktopClose.ask': 'Ask every time',
  'desktopClose.tray': 'Minimize to tray',
  'desktopClose.quit': 'Quit',
} satisfies Record<SettingsKey, string>
