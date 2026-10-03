# Phase 9 — 桌面签名升级闭环（harness + plugin 双 scope）+ 简化两指令面 /baf-update · /baf-update-rollback

- 日期：2026-10-03
- 范围：Tier 2（`pnpm build:lib` 零错，未跑 NSIS）
- 前置：`overlay/docs/enterprise-workflow.md` §12.9 设计 + enterprise-inputs.md §7 冻结映射；实现中途客户指令「简化 update 的升级指令，一个 baf update…再加一个 rollback 的回滚版本指令即可」——status/check/apply 三动词合并为一个 `/baf-update`（有更新时弹窗选择升级/取消），rollback 独立成 `/baf-update-rollback`
- 验证：desktop tsc 0 错 + 14 文件 91 测试绿（新增 versions-migrate / manifest-sign / apply-scoped / extract 4 个文件 + update.spec dispatch 4 例）+ baf-integration 43 文件 502 测试绿（新增 update-surface.spec 11 例）+ ui-baf-workflow 17 绿 + `pnpm build:lib` 简化后重跑 exit 0 + pack-plugin 冒烟（`baf-plugin-0.0.2.zip`，9 文件逐个 hash）
- 状态：已实现（9.1–9.7 全落地；baseline scope 按冻结决策暂缓，plans 输出 `none`）

## 9.1 InstalledVersions schema 2 迁移 — `overlay/desktop/src/versions.ts`

【变更】新 `InstalledVersions` schema 2（`schema:2` + 按 scope 的安装映射，harness = dsh 运行时 + bafDsh 桌面、plugin = baf zip），映射逐字段对齐 enterprise-inputs.md §7。严格解析器：任何字段缺失/类型错即拒绝（不落入 legacy 迁移或重播种——半可信的 schema 2 文件不得被当真）；显式 `migrateLegacyVersions` 把旧三字段平铺形态升为 schema 2。新测试 `tests/versions-migrate.spec.ts`。

## 9.2 manifest schema 2 + 签名策略 — `manifest.ts` / `public-key.ts` / `github.ts` / `scripts/generate-manifest.mjs`

【变更】manifest 信封升 schema 2 并带 keyId + 分离签名；`verifyManifestSignature`（Ed25519）验签后才进入 plan；公钥按 keyId 白名单，未知 keyId 一律拒绝并落 `blocked` 状态（fail-closed，不降级为「无签名可用」）。当前 key `baf-test-2026q4`（测试 key，生产 key 是遗留项 1）。generate-manifest 同步产 schema 2 信封。新测试 `tests/manifest-sign.spec.ts`。

## 9.3 分 scope plan — `update/plan.ts`

【变更】plan 按 scope（harness/plugin/baseline）逐个给出 `{action, currentVersion, targetVersion, required, restartRequired, reason}`，action ∈ none/download/apply/restart/installer；baseline 冻结为静态 fixture、恒 `none`。检查结论写回 `update-state.json`（lastCheckAt/lastCheckStatus/tag/keyId/blocked/summaryZh/plans），child 侧直接读同一文件渲染。

## 9.4 分 scope apply/rollback 事务 — `update/apply.ts` / `update/service.ts`

【变更】每个 scope 独立事务：备份 → 解压 → 校验 → 提交，任一步失败只回滚本 scope（兄弟 scope 不受牵连）；`rollbackScope` 只对热 scope（plugin=zip 覆盖、runtime=运行时目录）可回滚，harness 升级走安装器交接（写 `updates/installer-handoff.json`，桌面重启后由安装器收尾——child 侧渲染「安装器交接」段）。新测试 `tests/apply-scoped.spec.ts`。

## 9.5 child↔main 命令通道（无 IPC）— `update-surface.ts` / `main.ts`

【变更】env `BAF_DSH_UPDATE_STATE` 指向 `update-state.json`（桌面 UpdateService 写、child 读）。child 侧命令 = 向同目录写 `update-request.json`（`{id, command: check/apply/rollback, scope?, requestor:'baf-command'}`），500ms 轮询 `update-response.json` 匹配 id（默认 120s 超时）；main.ts `watchUpdateRequests()`（watchFile 500ms + handling 标志防重入；消费即 rmSync request；响应 tmp+rename 原子落盘）。完全绕开 IPC——CLI 子进程与桌面宿主同生命周期即可对话。`update.spec.ts` 新 `dispatchUpdateRequest` 4 例：check 失败 / apply 失败空 scopes / rollback 无备份 / 未知命令 + 垃圾 body 不崩。

## 9.6 简化两指令面（客户 2026-10-03 指令）— 新模块 `packages/baf/baf-workflow/src/update-surface.ts` + `commands.ts` / `cmdline.ts`

【变更】三动词（status/check/apply）合并为一个 `/baf-update`：读当前状态（含安装器交接段）→ 发 fresh check（90s）→ 重读新 state → 有可用更新时弹**一次**选择卡（立即升级 / 暂不升级）→ 选升级则派 apply 并渲染分 scope 结果 + 当前版本；已是最新则纯报告。弹窗走 `ctx.userQuestions` + §22.19 `enqueueAsk` 单飞队列（key `update:desktop`，question id `baf-update`）——更新弹卡与工作流门卡互斥排队，永不互相覆盖；ask 抛错/被折叠都归为「暂不升级」。取消/无弹窗通道 → 报告卡（桌面提示再敲一次 `/baf-update`，CLI 提示 `baf update --apply`）。

`/baf-update-rollback [scope]`：非热 scope（baseline/其他）本地直接拒绝卡（不写 request）；plugin（默认）/runtime 透传桌面执行。CLI 镜像 `baf update [--apply]`（无 userQuestions 通道，`--apply` 即 autoApply 跳过弹窗直接升级）+ `baf update-rollback [scope]`；`SLASH_DESC`/`HELP_UPDATE`/help 卡「更新」区三处同步；surface-parity 钉 SLASH_NAMES ↔ CLI 名（baf- 前缀剥离）与 direct 集合，cmdline.spec 钉子字面量更新。新测试 `tests/update-surface.spec.ts` 11 例（fake desktop = 100ms interval 应答器，镜像 main 的「消费即删 request」契约；覆盖无宿主卡/已是最新不弹/升级往返/取消只报告/CLI 提示/autoApply/检查失败/超时/本地拒绝/scope 透传/交接渲染）。

## 9.7 zip 加固 + 打包 meta — `update/extract.ts` / `scripts/pack-plugin.mjs`

【变更】解压前逐条目校验 `isSafeZipEntryName`（拒绝空名、反斜杠、NUL、绝对路径、盘符 `[A-Za-z]:`、任何 `..` 段、段内冒号/ADS）；条目清单 `listZipEntries` 走 `tar.exe -tf`（win）/ `unzip -Z1`，列不出即拒绝解压（fail-closed）。解压后 `assertNoSymlinks` 清扫（先查 symlink 再查 isDirectory；发现即 rmSync 整目录 + 抛错）。新测试 `tests/extract.spec.ts` 5 例——含测试内 stored-zip 构造器（CRC32 表 + LFH 30B/CDH 46B/EOCD 22B，method 0），可直接投喂 `../evil.txt`、`/abs.txt`、`C:/abs.txt` 恶意包并断言解压目录外零落盘；vitest 从 Git Bash 跑时须把 `${SystemRoot}\System32` 前插 `Path`（否则 tar 解析成 MSYS GNU tar，`C:\` 被当 rsh 远端）。pack-plugin meta 升 `{schema:2, payload:'plugin', …, files:[{path,sha256,size}]}`（路径正斜杠排序），保留 generate-manifest 读的 legacy 顶层字段兼容。

## 文档同步 — `overlay/docs/enterprise-workflow.md`

【变更】评审结论行（Phase 9 已于 2026-10-03 落地 harness+plugin 两 scope）+ 新「Phase 9 — 已完成明细」表（9.1–9.7 + 桌面全套验证 9 行）+ 未完成表行改「已完成（遗留 3 项）」+ §12.9 新增「落地状态」块：3 条偏差（dsh 播种权威 = semver-max 而非 embed-always；download 并入 apply + 两指令简化、弹窗走 userQuestions 单飞队列；baseline 冻结输出 none）+ 5 条剩余项。

## 剩余问题（按优先级）

1. **生产签名 key**：现用测试 key `baf-test-2026q4`；发布前需产线 key + keyId 轮换预案（public-key.ts 白名单已按 keyId 组织，加 key 即插即用）。
2. **设置页三区 UI**：「版本与更新」按 harness/plugin/baseline 三区展示 + 手动检查按钮；renderer 侧 `update:lastScoped` IPC 通道已备，只差页面接线。
3. **pack-dsh roster 复检脚本化**：与 pack-plugin 同构的逐文件 hash 清单，随 Phase 10 打包收口一起做。
4. **apply 侧逐文件 hash 校验**：pack meta 已带 `files[].sha256`，apply 目前只验整包签名，未逐文件比对。
5. **splash 升级提示十条**：只落了 scope+required 两个分支的文案，其余沿用通用句式。

另：release bump 0.0.24 按惯例单独提交（chore(release)），不混入本功能提交。
