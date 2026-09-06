# BAF 企业输入登记表（Phase 0）

> 状态：Phase 0 冻结脚手架。具体值默认 `unavailable` / `<enterprise-tbd>`，由企业决定人冻结后填入；缺少真值不阻塞 Phase 0–4，Phase 5+ 用 fixture baseline。权威需求清单见 [enterprise-workflow.md](../enterprise-workflow.md) 第 15 章。
> 包落点冻结：`packages/baf/`（不进 `packages/experimental/`）。

## 1. 产品与工具链

| 字段 | 消费者 | 当前值 | 决定人 | 冻结版本 |
| --- | --- | --- | --- | --- |
| OpenSpec 精确版本 | baf-openspec | **latest**（安装/探测时解析当前最新稳定版；不在 workflow 硬编码次版本号） | 产品确认 2026-09-05 | |
| OpenSpec 安装方式（bundle / 企业镜像 / 本机 PATH） | baf-openspec / UpdateService | unavailable | | |
| OpenSpec CLI 可执行名或 launcher | baf-openspec / baseline `openspec.cli` | unavailable | | |
| OpenSpec 模板集引用 | baf-openspec | unavailable | | |
| Matt Pocock 规则企业正式来源 | baf-standard / baseline `standard.mattPocockRulesRef` | unavailable | | |
| C 编译器 | baf-quality / baseline `stack.compiler` | **gcc** | 产品确认 2026-09-05 | |
| C 构建系统 adapter id | baf-quality / baseline `stack.build` | unavailable | | |
| C 测试框架 adapter id | baf-quality / baseline `stack.test` | unavailable | | |
| 覆盖率工具与是否必需 | baf-quality / baseline `stack.coverage` | 必需；**阈值由工程配置提供**（baseline `minimum: project-config`） | 产品确认 2026-09-05 | |
| 覆盖率最低阈值 | baf-quality / baseline `stack.coverage.minimum` | **工程可配置**（不在企业基线写死数字） | 产品确认 2026-09-05 | |
| 静态分析器 adapter id 列表 | baf-quality / baseline `stack.analyzers` | unavailable | | |
| 其他质量阈值（复杂度等） | baf-quality / baseline | unavailable | | |

## 2. Guard 与 Git

| 字段 | 消费者 | 当前值 | 决定人 | 冻结版本 |
| --- | --- | --- | --- | --- |
| protected paths（workspace-relative） | baf-guard / baseline `guard.protectedPaths` | unavailable | | |
| secret scan 规则集 | baf-guard / baseline `guard.secretScan` | unavailable | | |
| 危险命令清单 | baf-guard | unavailable | | |
| Git policy（强制分支/提交约定等） | baf-guard | unavailable | | |
| projection 是否写入 `.gitignore` | enterprise Git policy / scaffold | unavailable | | |
| 需人工确认的操作 | baseline `guard.requireHumanConfirmation` | scaffold, archive, abandon（fixture 默认；企业可收紧） | | |

## 3. 工作流策略

| 字段 | 消费者 | 当前值 | 决定人 | 冻结版本 |
| --- | --- | --- | --- | --- |
| bug-fast-path 是否允许 | baf-workflow / baseline `workflow.bugFastPath.allowed` | unavailable | | |
| bug-fast-path 影响范围上限 `maxScope` | baf-workflow | unavailable | | |
| bug-fast-path 是否强制回归测试 | baf-workflow | unavailable | | |
| 默认工作流 | baseline `workflow.default` | go（fixture） | | |
| full-go 是否强制 OpenSpec | baseline `workflow.requireOpenSpec` | true（fixture） | | |

## 4. 模型路由（EnterpriseRoutePolicy）

| 字段 | 消费者 | 当前值 | 决定人 | 冻结版本 |
| --- | --- | --- | --- | --- |
| allowed provider/model 清单 | baf-workflow route | unavailable（企业另发；fixture 见测试） | 企业 | Phase 3 合同已冻结 |
| 能力标签（reasoning / coding / structured-output 等） | route resolver | 同 schema enum | 企业 | Phase 3 |
| fallback group 定义 | route resolver / baseline `routeProfile.fallbackPolicy` | unavailable（企业另发） | 企业 | Phase 3 |
| route policy 版本号 | RouteStatusView / 审计 | 字段 `version`（独立于 baseline） | 企业 | Phase 3 |
| session override 是否允许（仅 allowed 内） | route resolver | 字段 `allowSessionOverride` | 企业 | Phase 3 |
| 发行配置注入入口（settings / deployment） | Phase 3 接线 | **独立 policy 文件路径**（部署配置注入；session 创建冻结；非 baseline 内嵌） | 已冻结 | Phase 3 |

## 5. Baseline 与兼容

| 字段 | 消费者 | 当前值 | 决定人 | 冻结版本 |
| --- | --- | --- | --- | --- |
| baselineId 命名规范 | UpdateService / baseline loader | `baf-baseline-c-<yyyy>.<n>`（fixture：`baf-baseline-c-2026.1`） | | |
| bafCompatibility.min / max | baseline loader | fixture：`min: 0.1.0`，`max: 0.x` | | |
| baseline 发布与兼容策略 | UpdateService / [compatibility-matrix.md](compatibility-matrix.md) | unavailable | | |
| rollback minimum version | UpdateService / manifest | unavailable | | |

## 6. 更新、签名与权限

| 字段 | 消费者 | 当前值 | 决定人 | 冻结版本 |
| --- | --- | --- | --- | --- |
| channel 策略（stable / beta / offline 可见性） | UpdateService | unavailable（fixture 假定 stable） | | |
| `signatureVerificationEnabled`（企业通道） | update/public-key | unavailable；公开演示仓现状为 `false`，企业发行必须 `true` | | |
| Ed25519 key id | update/public-key / manifest | unavailable（开发用：本地跑 `node overlay/scripts/gen-update-keypair.mjs`，**勿提交私钥**） | | |
| Ed25519 公钥 PEM | update/public-key.ts | unavailable（正式公钥由企业出；测试公钥粘贴到本地未提交副本） | | |
| 密钥轮换 / 吊销策略 | UpdateService | unavailable | | |
| rollback 保留窗口 | UpdateService | unavailable | | |
| 管理员审批范围（apply / rollback / channel 切换） | UpdateService | unavailable | | |
| 普通用户是否可见完整 composition / 创造模式 / 调试信息 | ui-agent-preset | unavailable | | |

## 7. InstalledVersions schema 2 字段映射（冻结）

旧 `AppVersions`（schema 缺省）→ `InstalledVersions`（schema: 2）：

| 旧字段 | 新路径 | 迁移规则 |
| --- | --- | --- |
| `bafDsh` | `harness.desktop` | 原样复制 |
| `dsh` | `harness.dsh` | 运行时仍以 packaged/source seed 为准，不信任陈旧缓存 |
| （无） | `harness.runtime` | 迁移时置 `unknown`，直至 seed/探测写入 |
| `bafPlugin` | `plugin.baf` | 原样复制；**不得**猜成 baseline/tool 版本 |
| （无） | `plugin.presetSchema` | 迁移时置 `0` 或 seed；合法值由发行配置提供 |
| （无） | `baseline.id` / `baseline.version` / `baseline.openspec` / `baseline.matt` / `baseline.stack` | 迁移时全部置 `unknown` |

权威类型见 [enterprise-workflow.md](../enterprise-workflow.md) §11.6；实现在 Phase 9。

## 8. Projection 与 change id（冻结）

| 项 | 冻结值 |
| --- | --- |
| 事件日志 | `<workspace>/.baf/projection/<changeId>.jsonl`（append-only） |
| 派生索引 | `<workspace>/.baf/projection/index.json`（非权威；与事件同临界区更新） |
| change id | `change-<yyyymmdd>-<slug>-<4 位随机>`；slug ∈ `[a-z0-9-]`，长度 ≤ 32 |
| 是否 gitignore | 见上表「projection 是否写入 `.gitignore`」（企业待定） |
