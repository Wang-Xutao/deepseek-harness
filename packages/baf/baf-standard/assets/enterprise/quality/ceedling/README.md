# C 单元测试工程说明（baf-quality）

由 `/baf-quality:init` 写入。构建产物在 `build/`（已写入 `.gitignore`）。

## 布局

```text
project.yml
source/<rel>/<module>.c|.h          # 业务源码（init 不预建空目录）
test/<rel>/test_<module>.c          # 与 source 路径镜像；由 gen-ut 创建
.baf/quality/config.json
build/
```

## 常用命令

| 场景 | 命令 |
|---|---|
| 日常 TDD | `baf-quality test` / `baf-quality test i2c` |
| 总检查（UT + 覆盖率） | `baf-quality check` |
| 强制全量重建后再检查 | `baf-quality check --clean` |
| 打开覆盖率 HTML | `baf-quality check --open` |
| 生成或重构测 | `/baf-quality:gen-ut hal/i2c` |

工具链：`gcc` · `ruby` · `ceedling` · `gcovr`（由 `/baf:init` 安装）。

覆盖率插桩仅在 `ceedling gcov:*` / `baf-quality check`（`:flags.:gcov` + `--coverage`）；日常 `baf-quality test` 不插桩。
Windows/MinGW：勿在 `:flags.:test` 使用 `-lgcov`（无 `libgcov.a`）；`baf-quality test|check` 会自动迁移旧配置。
