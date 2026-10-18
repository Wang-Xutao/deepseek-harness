---
name: sora-c-static-analysis
description: >
  Use when running or interpreting /baf-quality:lint, cpplint, cppcheck,
  static-analysis.json, C style lint vs clang-format, or code-freeze quality
  convergence (check → lint → final format). Prefer this for static analysis;
  use sora-c-code-standards for naming/Doxygen and sora-c-ut-ceedling for UT.
---

# SORA C 风格检查与静态分析（cpplint + cppcheck）

**分层**：skill = 软约束；`baf-quality lint` 写机读报告；默认 `gate_mode: shadow`；`--strict`/`--ci` 或 `fail-closed` 升格。硬拦属 `baf-guard`/CI（P2-L3）。

## 与 clang-format 分工

| 工具 | 职责 |
|---|---|
| **clang-format** | 排版（空白/换行/括号）；**代码冻结前最后一步** |
| **cpplint**（仓根 `CPPLINT.cfg`） | SORA 定制风格/禁项类检查（**非** Google C++ 默认） |
| **cppcheck** | 缺陷/未定义行为类静态分析 |

**禁止**中途 `clang-format -i`。顺序：**check → lint（修完）→ 最终 format → status**。

## 命令

```text
baf-quality lint [--strict|--ci] [paths…]
```

→ `.baf/reports/static-analysis.json`（`baf.static-analysis/v1`）

入仓：`/baf-quality:init`（写 `CPPLINT.cfg`、抑制文件、`config.json` lint 段）。
工具链：`/baf:init`（cpplint + cppcheck）。

## Agent 契约

1. 验证/收工触及自研 `.c/.h` 时必须跑 lint，留下新鲜报告。
2. 有须修项 → 改源码 → 重跑相关 `test`/`lint`（仍在**冻结前**）。
3. 收敛干净后才 `clang-format -i`；之后**禁止**再改自研 `.c/.h`（须改则显式解冻并重走）。
4. 缺工具/缺配置 → 提示 `/baf:init` / `/baf-quality:init`；禁止假装已检。
5. shadow 下 findings 高警可过；用户要求合入升格时用 `--strict`。

## 路径差异（摘要）

| 路径 | lint |
|---|---|
| full / hotfix / tweak | 冻结前**必守**（触及 `.c/.h`） |
| vibe | 触及自研 `.c/.h` → **条件必守**；跳过须用户确认 |
