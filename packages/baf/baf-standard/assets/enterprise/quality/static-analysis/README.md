# 静态分析入仓资产（cpplint + cppcheck）

由 `/baf-quality:init` 写入客户仓：

| 文件 | 作用 |
|---|---|
| 仓根 `CPPLINT.cfg` | SORA 定制风格检查（非 Google C++ 默认；与 clang-format 分工） |
| `.baf/quality/cppcheck-suppressions.xml` | 第三方 / test / build 抑制 |
| `.baf/quality/config.json` → `lint` 段 | `gate_mode`、报告路径、排除 |

## 命令

```text
baf-quality lint [--strict|--ci] [paths…]
```

→ `.baf/reports/static-analysis.json`

## 流程位置（代码冻结）

- **冻结前**：`check` → `lint`（修告警可改源码）→ **最终** `clang-format -i`
- **冻结后**：禁止再改自研 `.c/.h`；`status` 只读机检

中途禁止 `clang-format`。详见 `sora-c-static-analysis` skill 与 enterprise-workflow P2-L。
