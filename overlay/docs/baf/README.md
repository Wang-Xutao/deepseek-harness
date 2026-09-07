# BAF Phase 0 冻结合同摘要

> 本目录是 Phase 0 产出物索引；设计正文仍在 [enterprise-workflow.md](../enterprise-workflow.md)。

| 文件 | 内容 |
| --- | --- |
| [enterprise-inputs.md](enterprise-inputs.md) | 企业待定值登记 + InstalledVersions 映射 + projection/change id 冻结 |
| [error-codes.md](error-codes.md) | 稳定错误码与载荷 |
| [compatibility-matrix.md](compatibility-matrix.md) | dsh / plugin / baseline 兼容矩阵模板 |
| [checklist-phase0-4.md](checklist-phase0-4.md) | Phase 0–4 人工验收清单（开发用，不进用户帮助 site） |

Schema 与 fixture（仓库路径）：

- `packages/baf/baf-core/schema/baseline.schema.yaml`
- `packages/baf/baf-core/schema/route-profile.schema.json`
- `overlay/plugin/standards/baf-baseline-c/baseline.yml`
- `packages/baf/baf-core/tests/fixtures/baseline/baseline.yml`（与上者同源副本）

包落点冻结：`packages/baf/`。
