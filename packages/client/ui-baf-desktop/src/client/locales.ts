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
  // 【变更】2026-10-25 (批次二十四 3): the model path's own states.
  | 'draft.working'
  | 'draft.changed'
  // 【变更】2026-10-25 (批次二十五 2): the model path's OUTCOME states — the
  // user has to see which of the two answered.
  | 'draft.optimized'
  | 'draft.local'
  | 'draft.same'
  // 【变更】2026-10-25 (批次二十六 3): the desktop-notification copy. The bold
  // line says what happened; the body line says which Session it happened in.
  | 'notification.complete.title'
  | 'notification.complete.body'
  | 'notification.error.title'
  | 'notification.error.body'
  | 'notification.approval.title'
  | 'notification.approval.body'
  | 'notification.attention.title'
  | 'notification.attention.body'
  // 【变更】2026-10-25 (批次二十六 4): the in-app update prompt — the dialog
  // that replaced the operating system's message box. The bold line says
  // whether the update is optional or required; the actions are the user's.
  | 'update.prompt.title'
  | 'update.prompt.titleRequired'
  | 'update.prompt.close'
  | 'update.prompt.notes'
  | 'update.prompt.update'
  | 'update.prompt.later'
  | 'update.prompt.quit'
  | 'update.prompt.updating'
  | 'update.prompt.error'

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
  'draft.working': '正在用当前模型整理结构…',
  'draft.changed': '整理期间草稿被修改，已放弃本次整理',
  // 【变更】2026-10-25 (批次二十五 2): the model path's outcome states.
  'draft.optimized': '已用 {model} 优化输入内容',
  'draft.local': '模型未响应，已用本地规则整理结构',
  'draft.same': '模型读过这段文字，认为无需调整',
  // 【变更】2026-10-25 (批次二十六 3): the desktop-notification copy.
  'notification.complete.title': '任务完成',
  'notification.complete.body': '{session} 的任务已完成',
  'notification.error.title': '任务出错',
  'notification.error.body': '{session}：{detail}',
  'notification.approval.title': '需要权限审批',
  'notification.approval.body': '{session} 正在等待你的审批',
  'notification.attention.title': '需要你的处理',
  'notification.attention.body': '{session} 正在等待你的处理',
  // 【变更】2026-10-25 (批次二十六 4): the in-app update prompt.
  'update.prompt.title': '发现新版本',
  'update.prompt.titleRequired': '必须更新后才能继续使用',
  'update.prompt.close': '关闭更新提示',
  'update.prompt.notes': '本次更新',
  'update.prompt.update': '立即更新',
  'update.prompt.later': '稍后更新',
  'update.prompt.quit': '退出应用',
  'update.prompt.updating': '正在更新…',
  'update.prompt.error': '更新失败',
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
  'draft.working': 'Arranging the structure with the current model…',
  'draft.changed': 'The draft changed while it was being arranged, so the arrangement was dropped',
  // 【变更】2026-10-25 (批次二十五 2): the model path's outcome states.
  'draft.optimized': 'Optimized the input with {model}',
  'draft.local': 'The model did not answer; the local rules arranged the structure',
  'draft.same': 'The model read the draft and found nothing to change',
  // 【变更】2026-10-25 (批次二十六 3): the desktop-notification copy.
  'notification.complete.title': 'Task complete',
  'notification.complete.body': 'The task in {session} finished',
  'notification.error.title': 'Task failed',
  'notification.error.body': '{session}: {detail}',
  'notification.approval.title': 'Approval needed',
  'notification.approval.body': '{session} is waiting for your approval',
  'notification.attention.title': 'Your input is needed',
  'notification.attention.body': '{session} is waiting for you',
  // 【变更】2026-10-25 (批次二十六 4): the in-app update prompt.
  'update.prompt.title': 'New version available',
  'update.prompt.titleRequired': 'Update required to continue',
  'update.prompt.close': 'Close the update prompt',
  'update.prompt.notes': "What's new",
  'update.prompt.update': 'Update now',
  'update.prompt.later': 'Later',
  'update.prompt.quit': 'Quit',
  'update.prompt.updating': 'Updating…',
  'update.prompt.error': 'Update failed',
}
