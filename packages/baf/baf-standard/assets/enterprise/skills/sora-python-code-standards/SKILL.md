---
name: sora-python-code-standards
description: >
  Use when writing, reviewing, refactoring, or generating Python (.py) for SORA
  tools and scripts; when running template_gen or baf-standard new-module
  helpers; PEP 8 / ruff style for automation code. Not for C firmware
  (use sora-c-code-standards).
---

# SORA Python 工具/脚本编码规范（Agent 短规则）

**定位**：工具语言；**无**公司受控正式规范。基线：**Python 3.10+** + 常用标准（PEP 8 / Ruff 等）。
**分层**：skill = 软约束；hook/CI = 硬拦截（P2+，按需）。

## 强制

1. 3.10+；4 空格。
2. 源文件 **UTF-8 无 BOM**；`open` / `Path.read_text` / `Path.write_text` 显式 `encoding="utf-8"`（禁止依赖系统默认编码）。
3. 禁 `from x import *`；禁裸 `except:`；禁提交密钥。
4. `subprocess` 用参数列表；路径用 `pathlib`；失败非零退出。
5. 可复用函数尽量类型注解。

## 推荐

Ruff/Black（行宽 88）；`logging`；`argparse`；可测逻辑抽函数（**覆盖率暂不进 CI**）。

## 边界

| 场景 | Skill / 规则 |
|---|---|
| `.c`/`.h` | `sora-c-code-standards` |
| `.py` | 本 skill |
| 白名单第三方路径 | 非必要不改（同 C） |
| `template_gen.py` | 本 skill；产出 C 文件守 C skill |

C 的禁堆/单出口/禁递归 **不**套用到 Python。
