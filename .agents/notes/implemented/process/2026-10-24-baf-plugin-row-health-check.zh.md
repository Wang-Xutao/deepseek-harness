# Agent Note: preset 行体检让 baf 组合始终可解析

Status: implemented

[English](2026-10-24-baf-plugin-row-health-check.md) | 中文

## 问题

上游 v0.2.1-rc.1 撤掉了独立的 `@deepseek-ai/dsh-tool-subagent-control/list-agents` 插件导出，`list_agents` 改由主插件 `@deepseek-ai/dsh-tool-subagent-control` 注册。baf 自己的组合里仍写着那行已失效的行：

- `packages/bundle/web-app/presets/baf.patch.yml`
- `packages/preset/agent-presets/presets/{baf,standard,ptc,cordis}/agent.cordis.yml`

在桌面端这个失败的表征很间接：会话建不起来（`agent-preset/invalid: tool-subagent-list-agents … never started`），应用停在空态，而设置面板一开分区就自己关掉——于是多模型路由分区始终打不开。整棵树里没有一处指名那个失效导出就是原因，因为那一行语法上完全合法。

## 决定

- 按上游迁移说明（`docs/upgrade-guide/v0.2.1-rc.1/subagent-control-tools/guide.md`）删掉五个 baf 组合文件里的 `tool-subagent-list-agents` 行：每个工具作用域一条 `@deepseek-ai/dsh-tool-subagent-control`，且不再有针对已废行的 patch。
- 新增 `overlay/scripts/check-baf-plugin-rows.mjs`。它把 baf 各 preset 与 patch 文件里的插件行全部读出来，按 Node 的规则解析——作用域包名在作用域斜杠处切开，子导出按包的 `exports` 映射解析——再断言包确实存在、子导出确实有运行时目标。指向已被上游删除的包、或已被上游废掉的子导出的行，都会让检查失败。
- 检查覆盖四个 bundle patch 文件（`baf` / `standard` / `ptc` / `cordis`）与五个 agent preset 组合（`baf` / `standard` / `ptc` / `cordis` / `minimal`）。

## 备选方案

### 为什么不只在运行时暴露这个失败？

运行时的症状离原因很远：会话起不来、设置面板自己关掉、路由分区打不开。行级检查才能指名出问题的那一行。

### 为什么不写成包内的单元测试？

这些行在若干包共用的 YAML 里，失败模式跨包：行本身语法没问题，只有对着树解析时才算失效。一个对着整个工作区解析每一行的脚本才配得上这个问题。

### 为什么只查 `baf` 这一个 profile？

树里每个 preset 都有同样的风险。`ptc` 组合里一个被废掉的导出同样会让那个组合失效，所以检查扫全部。

## 后果

- 失效行已删除，baf 组合对着当前上游树可以解析，会话重新起得来。
- 新检查不需要构建步骤：它读工作区源码与各包的 `exports` 映射。
- 检查会分别报告「包缺失」与「子导出缺失」，因此输出里能区分「包被删」与「导出被废」。
- 检查是 `overlay/scripts/` 下的工作区脚本（与其它 overlay 校验脚本一起提交）；它不需要构建步骤，在打包与合并验证时运行。

## 测试

- `node overlay/scripts/check-baf-plugin-rows.mjs` 报告九个受覆盖组合文件里的每个插件行都能解析。
- 打包后的桌面应用重新起得了会话，多模型路由区也能打开，五个页签与 Commander / Reviewer / Worker 三档都在（`overlay/scripts/probe-merge-exe.mjs`）。

## 相关

- [合并上游 master 与 stepRouteResolver 接缝](../architecture/2026-10-24-upstream-master-merge-route-resolver-seam.zh.md)
- `docs/upgrade-guide/v0.2.1-rc.1/subagent-control-tools/guide.md` — 这次修复所依据的上游迁移说明。
