/** Locale keys for the version and update settings section. */

export type UpdatesSettingsKey =
  | 'nav'
  | 'title'
  | 'intro'
  | 'desktopOnly'
  | 'labelBaf'
  | 'labelDsh'
  | 'packagesHeading'
  | 'labelBafCore'
  | 'labelBafWorkflow'
  | 'check'
  | 'update'
  | 'checking'
  | 'updating'
  | 'upToDate'
  | 'available'
  | 'error'
  | 'progress'
  | 'updateTarget'
  | 'updateNotes'

export const en: Record<UpdatesSettingsKey, string> = {
  nav: 'Version & updates',
  title: 'Version & updates',
  intro: 'View installed product version details, and check or sync updates.',
  desktopOnly: 'Version checks and updates are available only in the baf-dsh desktop app.',
  labelBaf: 'BAF DSH DESKTOP',
  labelDsh: 'DeepSeek Harness',
  packagesHeading: 'BAF packages',
  labelBafCore: '@deepseek-ai/dsh-baf-core',
  labelBafWorkflow: '@deepseek-ai/dsh-baf-workflow',
  check: 'Check for updates',
  update: 'Update',
  checking: 'Checking…',
  updating: 'Updating…',
  upToDate: 'You are up to date.',
  available: 'Update available',
  error: 'Could not check for updates',
  progress: 'Progress',
  updateTarget: 'Target version',
  updateNotes: 'What is new',
}

export const zh: Record<UpdatesSettingsKey, string> = {
  nav: '版本与更新',
  title: '版本与更新',
  intro: '查看已安装产品的版本明细，并支持检查和同步更新',
  desktopOnly: '检查更新与升级仅在 baf-dsh 桌面应用中可用。',
  labelBaf: 'BAF DSH DESKTOP',
  labelDsh: 'DeepSeek Harness',
  packagesHeading: 'BAF 插件包',
  labelBafCore: '@deepseek-ai/dsh-baf-core',
  labelBafWorkflow: '@deepseek-ai/dsh-baf-workflow',
  check: '检查更新',
  update: '更新',
  checking: '正在检查…',
  updating: '正在更新…',
  upToDate: '已是最新版本。',
  available: '发现可用更新',
  error: '检查更新失败',
  progress: '进度',
  updateTarget: '目标版本',
  updateNotes: '更新内容',
}
