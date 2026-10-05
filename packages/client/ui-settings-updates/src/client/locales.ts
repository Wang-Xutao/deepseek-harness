/** Locale keys for the version and update settings section. */

export type UpdatesSettingsKey =
  | 'nav'
  | 'title'
  | 'intro'
  | 'desktopOnly'
  | 'labelBaf'
  | 'labelDsh'
  | 'packagesHeading'
  | 'packagesHint'
  | 'descBafCore'
  | 'labelBafWorkflow'
  | 'descBafWorkflow'
  | 'labelBafOpenspec'
  | 'descBafOpenspec'
  | 'labelBafStandard'
  | 'descBafStandard'
  | 'labelBafQuality'
  | 'descBafQuality'
  | 'labelBafGuard'
  | 'descBafGuard'
  | 'labelBafScaffold'
  | 'descBafScaffold'
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
  | 'currentVersion'
  | 'latestVersion'
  | 'hotUpgradeHint'

export const en: Record<UpdatesSettingsKey, string> = {
  nav: 'Version & updates',
  title: 'Version & updates',
  intro: 'View installed product version details, and check or sync updates.',
  desktopOnly: 'Version checks and updates are available only in the baf-dsh desktop app.',
  labelBaf: 'BAF DSH DESKTOP',
  labelDsh: 'DeepSeek Harness',
  packagesHeading: 'BAF packages',
  packagesHint: 'These packages ship with the app and update together with it — nothing to install or manage on your own.',
  labelBafCore: '@deepseek-ai/dsh-baf-core',
  descBafCore: 'The workflow kernel: stages, gates, and task structures every BAF feature builds on, plus the enterprise baseline loader.',
  labelBafWorkflow: '@deepseek-ai/dsh-baf-workflow',
  descBafWorkflow: 'The workflow engine: routes session work orders through the stages, and drives multi-model routing.',
  labelBafOpenspec: '@deepseek-ai/dsh-baf-openspec',
  descBafOpenspec: 'Change specs: writes each change as an OpenSpec proposal file — draft, validate, then archive when done.',
  labelBafStandard: '@deepseek-ai/dsh-baf-standard',
  descBafStandard: 'Engineering standards: serves the coding and process rules your enterprise baseline defines.',
  labelBafQuality: '@deepseek-ai/dsh-baf-quality',
  descBafQuality: 'Quality checks: runs the baseline\'s build, test, coverage, and analyzer gates for every delivery.',
  labelBafGuard: '@deepseek-ai/dsh-baf-guard',
  descBafGuard: 'Guardrails: hard gates over file and shell tools, plus secret scanning, so the workflow stays inside the rules.',
  labelBafScaffold: '@deepseek-ai/dsh-baf-scaffold',
  descBafScaffold: 'Scaffolding: generates the workspace skeleton in one shot, with confirmation prompts and timestamped backups.',
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
  currentVersion: 'Current version',
  latestVersion: 'Latest available version',
  hotUpgradeHint: 'BAF packages also hot-upgrade: run /baf-update in a session to check and update them without restarting the app; /baf-update-rollback rolls a hot scope back to its last applied bits.',
}

export const zh: Record<UpdatesSettingsKey, string> = {
  nav: '版本与更新',
  title: '版本与更新',
  intro: '查看已安装产品的版本明细，并支持检查和同步更新',
  desktopOnly: '检查更新与升级仅在 baf-dsh 桌面应用中可用。',
  labelBaf: 'BAF DSH DESKTOP',
  labelDsh: 'DeepSeek Harness',
  packagesHeading: 'BAF 插件包',
  packagesHint: '以下插件包随应用一起安装、一起更新，无需单独安装或管理。',
  labelBafCore: '@deepseek-ai/dsh-baf-core',
  descBafCore: '工作流内核：定义阶段、门禁、任务等所有 BAF 功能共用的核心结构，并加载企业基线。',
  labelBafWorkflow: '@deepseek-ai/dsh-baf-workflow',
  descBafWorkflow: '工作流引擎：把会话里的工单沿各阶段流转派发，并驱动多模型路由。',
  labelBafOpenspec: '@deepseek-ai/dsh-baf-openspec',
  descBafOpenspec: '变更规格：把每次变更写成 OpenSpec 提案文件——先起草、再校验、完成归档。',
  labelBafStandard: '@deepseek-ai/dsh-baf-standard',
  descBafStandard: '工程规范：提供企业基线里定义的编码与流程规范要点。',
  labelBafQuality: '@deepseek-ai/dsh-baf-quality',
  descBafQuality: '质量检查：按基线执行构建、测试、覆盖率与静态分析等交付门禁。',
  labelBafGuard: '@deepseek-ai/dsh-baf-guard',
  descBafGuard: '安全守护：对文件与命令工具做硬门禁并扫描密钥，让工作流不越界。',
  labelBafScaffold: '@deepseek-ai/dsh-baf-scaffold',
  descBafScaffold: '工程脚手架：一键生成工作区骨架，带人工确认与时间戳备份。',
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
  currentVersion: '当前版本',
  latestVersion: '最新可升级版本',
  hotUpgradeHint: 'BAF 插件包还支持热升级：在会话里执行 /baf-update，无需重启应用即可检查并更新插件包；/baf-update-rollback 可把热升级回滚到上一版。',
}
