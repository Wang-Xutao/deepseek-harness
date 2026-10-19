# 方案乙实施手册：bafplugin 企业规范资产与硬门迁入

> **读者**：需要在 `deepseek-harness`（dsh / baf-dsh）中完整复现方案乙的工程师。
> **前置**：方案甲（A/B 配置分层）已落地，见 [`workflow-config-layering-audit.md`](./workflow-config-layering-audit.md)。
> **上游对照源**：`D:\Source\baf-codingplugin\bafplugin\plugins\{baf-standard,baf-quality,baf-workflow}`。
> **目标**：把 bafplugin 的 C 规范 / commitlint / Ceedling UT / 静态分析 / 宪法模板 / status-blockers 机读门，迁入 dsh 的 Cordis 包，并可随桌面 `pack-dsh` 分发。

---

## 0. 一句话结论

方案乙不是「改设置页文案」，而是：**把 bafplugin 的规范资产打进 `@deepseek-ai/dsh-baf-standard/assets/enterprise`，用 `applyEnterpriseStandards` 写入客户工作区，用 `collectStatusBlockers` 把机读门挂到 verify/doctor，并把 baseline.stack 钉扎到 Ceedling/cpplint/cppcheck。**

本仓库已提供：

| 能力 | 位置 |
| --- | --- |
| 企业资产包 | `packages/baf/baf-standard/assets/enterprise/` |
| 入仓 API | `applyEnterpriseStandards` / `planEnterpriseStandards`（`@deepseek-ai/dsh-baf-standard`） |
| 机读 blockers | `collectStatusBlockers`（`@deepseek-ai/dsh-baf-quality`） |
| 方案甲运行时合并 | `loadWorkspaceBaseline` → `applyUserPrefsToBaseline`（`baf-workflow/pipeline-factory`） |

---

## 1. 范围与非范围

### 1.1 必须完成（方案乙验收）

1. **C 规范**：`.clang-format`、高风险清单、第三方白名单、C 文件模板、Doxygen 示例。
2. **提交硬门**：`commitlint.config.cjs` + `.husky/commit-msg`。
3. **UT / 质量**：Ceedling `project.yml`、测试/源码镜像布局、`CPPLINT.cfg`、`cppcheck-suppressions.xml`。
4. **宪法**：`AGENTS.md` / `CLAUDE.md` / `.baf/standards/ci-index.md` / `openspec/project.md` / `docs/api/README.md`。
5. **机读门**：clang-format dry-run、覆盖率报告、静态分析报告、baseline 存在性 → `collectStatusBlockers`。
6. **分发**：`baf-standard` 的 `package.json#files` 含 `assets/**`；`pack-dsh` 后 packaged tree 能 `import` 到 apply API。
7. **测试**：apply 幂等/备份；blockers 缺 baseline / 覆盖率失败；scaffold 仍写出 `userOverridePolicy` + `user-prefs.yml`。

### 1.2 明确不做

- 不把 Comet CLI 钉死为运行时依赖（dsh 用本地 OpenSpec adapter；企业可后接）。
- 不在设置 UI 编辑规则正文（方案甲已锁 B 只读）。
- 不改多模型路由。
- 不在本期把 bafplugin 的全部 Claude slash CLI（`baf-standard-cli.cjs`）原样搬进 dsh；dsh 入口是 Cordis Remote / slash / `applyEnterpriseStandards`。

---

## 2. 上游资产清单（从哪里拷）

在开发机上，对照源默认路径：

```text
BAFPLUGIN=D:\Source\baf-codingplugin\bafplugin\plugins
```

| Pack id | 上游路径 | 迁入位置（本仓） |
| --- | --- | --- |
| `c` | `baf-standard/templates/c/*` | `packages/baf/baf-standard/assets/enterprise/c/` |
| `commitlint` | `baf-standard/templates/commitlint/*` | `.../commitlint/` |
| `constitution` | `baf-standard/templates/constitution/{AGENTS,CLAUDE,ci-index,openspec,docs}` | `.../constitution/` |
| `quality` | `baf-quality/templates/{ceedling,static-analysis}/*` | `.../quality/` |
| `scripts` | `baf-workflow/scripts/lib/{check-clang-format,check-commit-span,check-docs-api,status-blockers}.cjs` | `.../scripts/` |
| `skills` | `baf-standard/skills/sora-*` + `baf-quality/skills/sora-*` | `.../skills/` |

### 2.1 同步命令（可复现）

在仓库根执行（PowerShell）：

```powershell
$src = "D:\Source\baf-codingplugin\bafplugin\plugins"
$dst = "packages\baf\baf-standard\assets\enterprise"
New-Item -ItemType Directory -Force -Path `
  "$dst\c","$dst\commitlint","$dst\constitution","$dst\quality\ceedling",`
  "$dst\quality\static-analysis","$dst\scripts","$dst\skills" | Out-Null

Copy-Item "$src\baf-standard\templates\c\.clang-format","$src\baf-standard\templates\c\high-risk-review-checklist.md",`
  "$src\baf-standard\templates\c\third-party-whitelist.json","$src\baf-standard\templates\c\module-README.template.md",`
  "$src\baf-standard\templates\c\template.c","$src\baf-standard\templates\c\template.h",`
  "$src\baf-standard\templates\c\Doxyfile.example","$src\baf-standard\templates\c\api-mainpage.dox.example" `
  -Destination "$dst\c\" -Force

Copy-Item "$src\baf-standard\templates\commitlint\*" "$dst\commitlint\" -Recurse -Force
Copy-Item "$src\baf-standard\templates\constitution\AGENTS.md","$src\baf-standard\templates\constitution\CLAUDE.md",`
  "$src\baf-standard\templates\constitution\ci-index.md","$src\baf-standard\templates\constitution\README.md" `
  -Destination "$dst\constitution\" -Force
New-Item -ItemType Directory -Force -Path "$dst\constitution\openspec","$dst\constitution\docs\api" | Out-Null
Copy-Item "$src\baf-standard\templates\constitution\openspec\project.md" "$dst\constitution\openspec\" -Force
Copy-Item "$src\baf-standard\templates\constitution\docs\api\README.md" "$dst\constitution\docs\api\" -Force
Copy-Item "$src\baf-quality\templates\ceedling\*" "$dst\quality\ceedling\" -Recurse -Force
Copy-Item "$src\baf-quality\templates\static-analysis\*" "$dst\quality\static-analysis\" -Recurse -Force
Copy-Item "$src\baf-workflow\scripts\lib\check-clang-format.cjs","$src\baf-workflow\scripts\lib\check-commit-span.cjs",`
  "$src\baf-workflow\scripts\lib\check-docs-api.cjs","$src\baf-workflow\scripts\lib\status-blockers.cjs" `
  -Destination "$dst\scripts\" -Force
```

Skills：把各 `SKILL.md`（及 `references/`）拷到 `$dst\skills\<name>\`（见 §0 表）。

**验收**：`packages/baf/baf-standard/assets/enterprise` 下至少有 `c/.clang-format`、`commitlint/commitlint.config.cjs`、`quality/ceedling/project.yml`、`scripts/status-blockers.cjs`。

---

## 3. 工作区落点映射（必须一致）

实现函数：`mapAssetToWorkspace`（`packages/baf/baf-standard/src/apply-enterprise-standards.ts`）。

| 资产相对路径 | 写入客户仓 |
| --- | --- |
| `c/.clang-format` | `.clang-format` |
| `c/high-risk-review-checklist.md` | `.baf/standards/high-risk-review-checklist.md` |
| `c/third-party-whitelist.json` | `.baf/standards/third-party-whitelist.json` |
| `c/module-README.template.md` | `.baf/standards/module-README.template.md` |
| `c/Doxyfile.example` | `.baf/standards/Doxyfile.example` |
| `c/template.c` / `template.h` | `.baf/standards/templates/` |
| `commitlint/commitlint.config.cjs` | `commitlint.config.cjs` |
| `commitlint/commit-msg` | `.husky/commit-msg` |
| `constitution/AGENTS.md` | `AGENTS.md` |
| `constitution/CLAUDE.md` | `CLAUDE.md` |
| `constitution/ci-index.md` | `.baf/standards/ci-index.md` |
| `constitution/openspec/project.md` | `openspec/project.md` |
| `constitution/docs/api/README.md` | `docs/api/README.md` |
| `quality/ceedling/project.yml` | `project.yml` |
| `quality/ceedling/test/**` | `test/**` |
| `quality/static-analysis/CPPLINT.cfg` | `CPPLINT.cfg` |
| `quality/static-analysis/cppcheck-suppressions.xml` | `cppcheck-suppressions.xml` |
| `scripts/*` | `.baf/scripts/*` |
| `skills/**` | `.agents/skills/**` |

语义：**同内容跳过；不同内容先 `.baf-backup-<ISO>` 再覆盖**（与 `baf-scaffold` 一致）。

---

## 4. API 与调用顺序

### 4.1 推荐客户仓初始化顺序

```text
1. /baf-scaffold          → .baf/baseline.yml + default-rules.md + user-prefs.yml
2. /baf-standard-init     → 写入企业资产 + 默认钉扎 baseline.stack（Ceedling/cpplint/cppcheck）
   （等价 API：applyEnterpriseStandards({ pinStack: true })）
3. 安装本机工具：clang-format、ceedling、cpplint、cppcheck、@commitlint/cli
4. /baf-workflow-verify   → StackAdapter + status-blockers（error 级阻断）
```

### 4.2 代码调用示例

```ts
import { applyEnterpriseStandards, ENTERPRISE_STACK_PIN } from '@deepseek-ai/dsh-baf-standard'
import { collectStatusBlockers } from '@deepseek-ai/dsh-baf-quality'

const changes = applyEnterpriseStandards({
  workspaceRoot: 'D:/path/to/customer-repo',
  packs: ['c', 'commitlint', 'constitution', 'quality', 'scripts'],
})

const blockers = collectStatusBlockers({
  workspaceRoot: 'D:/path/to/customer-repo',
  baseRef: 'origin/main', // 有值才跑 clang-format dry-run
})
if (!blockers.ok) {
  // 把 blockers.blockers 写进 verify 卡 / doctor 报告
}
```

### 4.3 baseline.stack 钉扎建议

应用 quality 包后，把 `.baf/baseline.yml` 的 `stack` 改为（或合并）：

```yaml
stack:
  language: c
  compiler: gcc
  build: ceedling files:build
  test: ceedling test:all
  coverage:
    required: true
    minimum: 80
  analyzers:
    - cpplint
    - cppcheck
```

常量：`ENTERPRISE_STACK_PIN`（同文件导出）。占位符 `<enterprise-tbd>` **禁止**静默替换成 Ceedling——只有企业/本 API 显式钉扎后才写入。

---

## 5. 机读门（status-blockers）契约

实现：`packages/baf/baf-quality/src/status-blockers.ts`。

| id | severity | 触发 |
| --- | --- | --- |
| `baseline.missing` | error | 无 `.baf/baseline.yml` |
| `clang-format.config_missing` | warning | 无 `.clang-format` |
| `clang-format.tool_missing` | warning | PATH 无 `clang-format` |
| `clang-format.drift` | error | 有 `baseRef` 且 dry-run 失败 |
| `commitlint.config_missing` | warning | 无 `commitlint.config.cjs` |
| `ut.coverage_failed` | error | `.baf/reports/ut-coverage.json` 且 `passed===false` |
| `static_analysis.failed` | error | `.baf/reports/static-analysis.json` 未通过 |
| `constitution.ci_index_missing` | info | 无 `.baf/standards/ci-index.md` |

`ok ===` 无任何 `severity: 'error'`。

### 5.1 接到 verify 的推荐挂点

1. `baf-workflow` verify 驱动在跑 `StackAdapter` **之后**调用 `collectStatusBlockers`。
2. 把 `error` 级 blockers 追加到 verify 失败理由（与 `verifyGate` 并列）。
3. doctor / session-gate 体检卡可只展示 warning/info，不阻断会话（与现有「体检缺件不阻断」一致）。

原始 `.cjs` 脚本仍落在 `.baf/scripts/`，供企业 CI 直接 `node .baf/scripts/status-blockers.cjs`；dsh 运行时优先走 TS API。

---

## 6. 与方案甲的衔接

| 甲 | 乙如何使用 |
| --- | --- |
| `.baf/baseline.yml` + `userOverridePolicy` | 乙不改 A 集合；质量钉扎属于 B（企业强制） |
| `.baf/user-prefs.yml` | 覆盖率 `minimum` 仅当 `coverageMinimum: true` 时可被用户覆盖 |
| 规则正文只读 | 乙写入的 checklist / constitution **不是** Matt 规则正文；Matt 仍由 `mattPocockRulesRef` 指向 |
| `loadWorkspaceBaseline` 合并 prefs | verify 看到的 coverage 底线已是 effective baseline |

---

## 7. 包与打包

### 7.1 `baf-standard/package.json`

- `files` 必须含 `assets/**`。
- `exports["./assets/*"]` 指向 `./assets/*`。
- `enterpriseAssetsRoot()` 用 `import.meta.url` 解析，兼容 `src/` 与 `lib/types/`。

### 7.2 pack-dsh

1. 根目录构建相关包：`pnpm --filter @deepseek-ai/dsh-baf-standard run bundle`（及 quality/core）。
2. `overlay` 下 `npm run pack-dsh`（或完整 `npm run dist:dir`）。
3. 验收：

```powershell
$nm = "overlay\desktop\resources\dsh\node_modules\@deepseek-ai\dsh-baf-standard"
Test-Path "$nm\assets\enterprise\c\.clang-format"
Select-String -Path "$nm\lib\index.js" -Pattern "applyEnterpriseStandards" | Select-Object -First 1
```

---

## 8. 测试清单（必须绿）

```powershell
pnpm exec vitest run `
  packages/baf/baf-core/tests/user-prefs.spec.ts `
  packages/baf/baf-scaffold/tests/scaffold.spec.ts `
  packages/baf/baf-standard/tests/apply-enterprise-standards.spec.ts `
  packages/baf/baf-quality/tests/status-blockers.spec.ts
```

最低断言：

1. `applyUserPrefsToBaseline`：policy=false 时忽略 prefs。
2. `planScaffold` 含 `userOverridePolicy` 与 `.baf/user-prefs.yml`。
3. `applyEnterpriseStandards(['c'])` 写出 `.clang-format`；二次调用进 `skipped`。
4. `collectStatusBlockers`：无 baseline → `ok=false`；`ut-coverage.json` failed → error。

---

## 9. 设置页 / 产品文案（可选但建议）

企业规范 Tab（`StandardsEnterpriseOverview`）可增加只读事实行：

- 「已应用企业资产包：c / commitlint / …」（扫工作区文件存在性）
- 「机读门：N error / M warning」（调 Remote 包装 `collectStatusBlockers`）

**禁止**在 UI 写规则正文；应用动作可通过 slash（例如未来 `/baf-standard-init`）或管理员文档指引调用 API。

---

## 10. 端到端验收剧本

1. 空目录 → `/baf-scaffold` → 有 baseline + user-prefs。
2. Node REPL / 单测 / 临时脚本调用 `applyEnterpriseStandards` 全 pack。
3. 确认 `.clang-format`、`commitlint.config.cjs`、`project.yml`、`AGENTS.md`、`.baf/scripts/status-blockers.cjs` 存在。
4. 钉扎 `stack` 后跑 `ceedling test:all`（本机需工具链）。
5. 写入失败的 `ut-coverage.json` → `collectStatusBlockers().ok === false`。
6. `overlay` `npm run dist:dir` → unpackaged `baf-dsh.exe` 的 dsh tree 含 assets。
7. 设置→工作流→企业规范：仍只读展示；无基线时不阻断结构卡（现有 8 域常显行为保留）。

---

## 11. 常见失败与处理

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `enterprise assets not found` | 未带 `assets/**` 进包或路径解析错 | 查 `package.json#files`；核 `enterpriseAssetsRoot` 候选 |
| clang-format 永不跑 | 未传 `baseRef` | 仅 warning；要硬门须传 base |
| Ceedling 链接 `__gcov_*` | 旧 project.yml flags | 使用本仓 quality 模板（bafplugin 0.5.3+ 布局） |
| 与 Matt 规则冲突 | 两套正文并存 | 企业以 `mattPocockRulesRef` 换自有文档；C 硬门仍靠 clang-format/commitlint |
| Windows `stash@{0}` 恢复失败 | PowerShell 吃 `{}` | 对 stash 引用加单引号 |

---

## 12. 完成定义（Definition of Done）

- [x] §2 资产已在 `assets/enterprise` 且可同步复现
- [x] `applyEnterpriseStandards` / `collectStatusBlockers` 已导出并有单测
- [x] scaffold 仍带方案甲 `userOverridePolicy` + `user-prefs.yml`
- [x] §8 测试命令全绿（含 pinStack / detectApplied）
- [x] `/baf-standard-init` + CLI `baf standard-init` 入仓入口
- [x] verify 接入 `status-blockers`（error 级阻断）
- [x] 设置→企业规范只读展示已应用 packs + blockers
- [ ] pack-dsh / dist:dir 产物含 assets（发版时按 §7.2 验收）
- [x] 本文档路径已写入 [`overlay/docs/README.md`](../README.md) 索引

除打包冒烟外全部勾选后，方案乙在本仓视为**功能完整落地**；发版前补跑 §7.2。
