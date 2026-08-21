/** Locale keys for the version and update settings section. */

export type UpdatesSettingsKey =
  | 'nav'
  | 'title'
  | 'intro'
  | 'desktopOnly'
  | 'labelBaf'
  | 'labelDsh'
  | 'labelPlugin'
  | 'check'
  | 'update'
  | 'checking'
  | 'updating'
  | 'upToDate'
  | 'available'
  | 'error'
  | 'progress'

export const en: Record<UpdatesSettingsKey, string> = {
  nav: 'Version & updates',
  title: 'Version & updates',
  intro: 'Show installed versions and update baf-dsh from the GitHub release channel.',
  desktopOnly: 'Version checks and updates are available only in the baf-dsh desktop app.',
  labelBaf: 'baf-dsh',
  labelDsh: 'DeepSeek Harness (open source)',
  labelPlugin: 'BAF plugin pack',
  check: 'Check for updates',
  update: 'Update',
  checking: 'Checking…',
  updating: 'Updating…',
  upToDate: 'You are up to date.',
  available: 'Update available',
  error: 'Could not check for updates',
  progress: 'Progress',
}

export const zh: Record<UpdatesSettingsKey, string> = {
  nav: '版本与更新',
  title: '版本与更新',
  intro: '查看已安装版本，并从 GitHub Release 通道更新 baf-dsh。',
  desktopOnly: '检查更新与升级仅在 baf-dsh 桌面应用中可用。',
  labelBaf: 'baf-dsh',
  labelDsh: '开源 DeepSeek Harness',
  labelPlugin: 'BAF 插件包',
  check: '检查更新',
  update: '更新',
  checking: '正在检查…',
  updating: '正在更新…',
  upToDate: '已是最新版本。',
  available: '发现可用更新',
  error: '检查更新失败',
  progress: '进度',
}
