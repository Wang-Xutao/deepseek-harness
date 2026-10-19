# BAF 工作流配置分层审计（方案甲）

> 对照 `overlay/docs/enterprise-workflow.md` 与 `bafplugin`；多模型路由本期不改。
> 冻结 A 集合（计划建议默认）：W1/W2/S2/N1/N2/N3；其余企业强制。

## 1. 设计文档落地 vs 遗漏/风险

| 项 | 状态 | 风险 |
| --- | --- | --- |
| Phase 0–10 / §22 主链（go / 门卡 / scaffold / guard） | 已落地 | 已知债：`packages/baf` 未达 per-file 100% coverage；上游 preset fixture 悬空 |
| OpenSpec 本地 adapter | 已落地 | 真实 OpenSpec CLI / Comet 未接（企业输入多为 unavailable） |
| Matt 默认规则 + `mattPocockRulesRef` | 已落地 | 与 bafplugin SORA 正文不同源；企业需替换 ref |
| 设置页门禁/规范 | **本批改为 A/B** | 旧技术大表已替换为通俗分类 |
| baseline 独立 hot-update | 暂缓 | 随 plugin zip 静态 fixture |
| 公开仓签名默认 | 不验签 | 企业发行须开启验签 |

## 2. 配置归属

### 项目级（可 git 共享）

| 路径 | 用途 |
| --- | --- |
| `.baf/baseline.yml` | 企业权威（B）+ `userOverridePolicy` |
| `.baf/user-prefs.yml` | 用户可调偏好（A），仅当 policy 允许 |
| `.baf/standards/*.md` | 规则正文（B 只读，禁止 UI 写） |
| `.baf/projection/` | 变更状态（运行时；是否 gitignore 由偏好/政策决定） |
| `openspec/changes/` | 变更产物 |

### 用户/设备级（本期不改）

| 路径 | 用途 |
| --- | --- |
| `~/.dsh/baf-route-config.json` | 多模型路由 |
| `~/.dsh/baf-route-presets.json` | 路由词库 |
| 设置「轨迹图/工作流图」开关 | 设备 localStorage |

### 产品代码级

| 位置 | 用途 |
| --- | --- |
| `GATE_REGISTRY` / `stages/gates.ts` | 确认门与阶段完成条件（B 只读展示） |

## 3. A/B 机制

- B：`baseline.userOverridePolicy.<id>`（缺省 = 产品默认全开可下放六项）。
- A：仅 `true` 的 id 出现在「用户可调偏好」；写入 `.baf/user-prefs.yml`。
- 运行时：`loadWorkspaceBaseline` 经 `applyUserPrefsToBaseline` 合并后再驱动流程。
- 规则正文：无写 API。

## 4. vs bafplugin 规范对照（方案乙）

实施手册见 [`plan-b-enterprise-standards-migration.md`](./plan-b-enterprise-standards-migration.md)。

| 主题 | bafplugin | dsh（方案乙后） |
| --- | --- | --- |
| C 编码 / clang-format / 文件头 | 完整 skill+模板+机读门 | `assets/enterprise/c` + `applyEnterpriseStandards(['c'])` |
| 提交 / commitlint / husky | 有硬门 | `assets/enterprise/commitlint` → 仓根 + `.husky` |
| Ceedling UT / cpplint / cppcheck | 固定工具链 CLI | `assets/enterprise/quality` + `ENTERPRISE_STACK_PIN` |
| Doxygen / 模块 README | 有 | Doxyfile.example + module-README.template |
| 宪法 AGENTS/CLAUDE | 有 | `assets/enterprise/constitution` |
| 机读门 status-blockers | `.cjs` | `collectStatusBlockers` + `.baf/scripts/*.cjs` |
| OpenSpec×Comet | 强依赖 CLI | 本地 adapter；企业输入后接 CLI（仍非乙硬依赖） |

## 5. 多模型路由（确认不做）

档位+关键词+verify 升档；非负载均衡；配置在 `~/.dsh`。设置「多模型路由」独立分区，本页不展示路由编辑。
