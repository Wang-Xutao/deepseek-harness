/** Locale keys for the featured plugins settings section. */

export type FeaturedSettingsKey =
  | 'nav'
  | 'title'
  | 'intro'
  | 'stateNotInstalled'
  | 'stateEnabled'
  | 'stateDisabled'
  | 'stateUnavailable'
  | 'updateAvailable'
  | 'versionInstalled'
  | 'versionLatest'
  | 'homepage'
  | 'install'
  | 'installing'
  | 'update'
  | 'updating'
  | 'enable'
  | 'disable'
  | 'remove'
  | 'removing'
  | 'autoUpdate'
  | 'autoUpdateHint'
  | 'bulkInstallAll'
  | 'bulkEnableAll'
  | 'bulkDisableAll'
  | 'checkUpdates'
  | 'checking'
  | 'loading'
  | 'loadFailed'
  | 'retry'
  | 'emptyList'
  | 'manifestProblem'
  | 'managerUnavailable'
  | 'unavailableHint'
  | 'confirmRiskTitle'
  | 'confirmRiskBody'
  | 'confirmBuildsTitle'
  | 'confirmBuildsBody'
  | 'confirmAccept'
  | 'confirmDecline'
  | 'applied'
  | 'restartRequired'
  | 'operationFailed'
  | 'progressInstalling'
  | 'progressApplying'
  | 'progressRegistry'

export const en: Record<FeaturedSettingsKey, string> = {
  nav: 'Featured plugins',
  title: 'Featured plugins',
  intro: 'Curated open-source plugins. Install, update, enable, or disable them here; installed plugins hot-update without a new app release.',
  stateNotInstalled: 'Not installed',
  stateEnabled: 'Enabled',
  stateDisabled: 'Disabled',
  stateUnavailable: 'Unavailable',
  updateAvailable: 'Update available',
  versionInstalled: 'Installed',
  versionLatest: 'Latest',
  homepage: 'Homepage',
  install: 'Install',
  installing: 'Installing…',
  update: 'Update',
  updating: 'Updating…',
  enable: 'Enable',
  disable: 'Disable',
  remove: 'Remove',
  removing: 'Removing…',
  autoUpdate: 'Auto-update',
  autoUpdateHint: 'Keep this plugin updated automatically',
  bulkInstallAll: 'Install all',
  bulkEnableAll: 'Enable all',
  bulkDisableAll: 'Disable all',
  checkUpdates: 'Check for updates',
  checking: 'Checking…',
  loading: 'Loading…',
  loadFailed: 'Could not load the featured plugin list',
  retry: 'Retry',
  emptyList: 'No featured plugins yet.',
  manifestProblem: 'The featured list could not be read',
  managerUnavailable: 'Plugin management is unavailable in this session.',
  unavailableHint: 'This plugin is temporarily unavailable. It will return in a later list update.',
  confirmRiskTitle: 'Compatibility confirmation',
  confirmRiskBody: 'This plugin requests dependency versions newer than this app ships. Installing it may not work as its author intended. Continue anyway?',
  confirmBuildsTitle: 'Approve build scripts',
  confirmBuildsBody: 'Installing this plugin runs build scripts from the following packages. Approve to continue.',
  confirmAccept: 'Continue',
  confirmDecline: 'Cancel',
  applied: 'Done.',
  restartRequired: 'Applied. Restart the app to finish.',
  operationFailed: 'Operation failed',
  progressInstalling: 'Installing',
  progressApplying: 'Applying changes',
  progressRegistry: 'registry',
}

export const zh: Record<FeaturedSettingsKey, string> = {
  nav: '精选插件',
  title: '精选插件',
  intro: '官方精选的开源插件，可在这里安装、更新、启用或禁用；已安装插件支持热更新，无需等待应用发版。',
  stateNotInstalled: '未安装',
  stateEnabled: '已启用',
  stateDisabled: '已禁用',
  stateUnavailable: '暂不可用',
  updateAvailable: '有可用更新',
  versionInstalled: '已装版本',
  versionLatest: '最新版本',
  homepage: '主页',
  install: '安装',
  installing: '正在安装…',
  update: '更新',
  updating: '正在更新…',
  enable: '启用',
  disable: '禁用',
  remove: '删除',
  removing: '正在删除…',
  autoUpdate: '自动更新',
  autoUpdateHint: '自动保持该插件为最新版本',
  bulkInstallAll: '一键安装',
  bulkEnableAll: '全部启用',
  bulkDisableAll: '全部禁用',
  checkUpdates: '检查更新',
  checking: '正在检查…',
  loading: '正在加载…',
  loadFailed: '精选插件列表加载失败',
  retry: '重试',
  emptyList: '暂无精选插件。',
  manifestProblem: '精选清单读取失败',
  managerUnavailable: '当前会话暂不支持插件管理。',
  unavailableHint: '该插件暂时不可用，将在后续清单更新中恢复。',
  confirmRiskTitle: '兼容性确认',
  confirmRiskBody: '该插件声明的依赖版本高于本应用内置版本，安装后可能无法按作者预期工作。仍要继续安装吗？',
  confirmBuildsTitle: '批准构建脚本',
  confirmBuildsBody: '安装该插件需要运行以下包的构建脚本，批准后将继续安装。',
  confirmAccept: '继续',
  confirmDecline: '取消',
  applied: '操作成功。',
  restartRequired: '已应用，重启应用后生效。',
  operationFailed: '操作失败',
  progressInstalling: '正在安装',
  progressApplying: '正在应用变更',
  progressRegistry: '源',
}
