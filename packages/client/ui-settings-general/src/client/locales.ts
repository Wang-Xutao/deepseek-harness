/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
  'connection.error': '连接异常',
  'connection.retry': '立即重连',
  'connection.connecting': '自动重连中',
  'connection.connected': '连接成功',
  'connection.reconnect': '连接异常，点击立即重连',
  'connection.restart': '连接中断，正在自动重试，点击立即重连',
  'desktopClose.title': '关闭窗口时',
  'desktopClose.description': '直接退出、最小化到托盘，或每次询问',
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
  'connection.error': 'Disconnected',
  'connection.retry': 'Reconnect now',
  'connection.connecting': 'Reconnecting',
  'connection.connected': 'Connected',
  'connection.reconnect': 'Disconnected, reconnect now',
  'connection.restart': 'Reconnecting automatically, reconnect now',
  'desktopClose.title': 'When closing the window',
  'desktopClose.description': 'Quit, minimize to tray, or ask every time',
  'desktopClose.ask': 'Ask every time',
  'desktopClose.tray': 'Minimize to tray',
  'desktopClose.quit': 'Quit',
} satisfies Record<SettingsKey, string>
