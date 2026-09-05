# BAF 兼容矩阵模板（Phase 0）

> 用途：登记 dsh / BAF-plugin / baseline 的兼容组合与 rollback 下限。真值由企业冻结后填入；当前为模板 + fixture 行。
> 实现消费者：UpdateService plan/apply、`baf doctor`、release 门禁（Phase 9–10）。

## 字段说明

| 列 | 含义 |
| --- | --- |
| `dsh` | 打包进桌面的 dsh / harness 版本（semver 或发行标签） |
| `bafPlugin` | BAF domain 插件包版本（`plugin.baf`） |
| `bafPreset` | 官方 preset schema / 内容版本 |
| `baselineId` | baseline 标识 |
| `baselineVersion` | baseline 版本 |
| `minDsh` / `maxDsh` | 该行组合允许的 dsh 范围 |
| `rollbackMinimum` | 允许回滚到的最低组合（低于此拒绝降级） |
| `status` | `supported` / `deprecated` / `blocked` / `draft` |

## 矩阵

| dsh | bafPlugin | bafPreset | baselineId | baselineVersion | minDsh | maxDsh | rollbackMinimum | status | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<enterprise-tbd>` | `<enterprise-tbd>` | 1 | baf-baseline-c-2026.1 | 0.0.0-fixture | 0.1.0 | 0.x | unavailable | draft | Phase 0 fixture；不可用于企业发行 |
| unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | blocked | 企业正式组合待填 |

## 规则（冻结）

1. `plugin` / `baseline` 不得要求尚未安装的 harness（`dsh`）版本。
2. 多 scope 更新后若组合不在 `supported` 行，标记 `blocked` 并恢复上一兼容组合。
3. manifest `compatibility` 与本表冲突时以**更严**一侧为准，并写审计。
4. session 执行期间不热切换已锁定的 baseline；新 baseline 只影响后续 session。
5. 公开演示通道与企业发行通道分列；演示行不得标为 `supported` 企业发行。
