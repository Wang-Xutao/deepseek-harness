---
name: sora-c-ut-ceedling
description: >
  SORA C 单元测试（Ceedling / Unity / CMock）完整规范与 TDD 跑测约定。
  在编写或修改 .c/.h、补测、覆盖率、/baf-quality:test|check|gen-ut|init、
  模块 UT 生成或重构时使用。
---

# SORA C 单元测试规范（Ceedling）

与企业文档 **§3.3** 一致：

| 层 | 职责 | 落点 |
|---|---|---|
| TDD 节奏 | RED → GREEN → REFACTOR | Superpowers（不 fork）+ `workflow-facade` 短引用 |
| 跑测发动机 | Unity / CMock / gcov | **本 skill** + Ceedling 工程 |
| 终点裁判 | 全绿 + 覆盖率报告 | `/baf-quality:check` |
| 规范占位 | ≥80%、TEST/VERIFY | 宪法；`/baf-quality:init` **自动填写** |

**本页为 C 单测可执行权威**（软约束）。硬门禁属 `baf-guard` / CI（P2-Q3+）。

核对表：`references/ut-checklist.md`。

---

## 1. 工程前置

- 无 `project.yml` → **高警**，建议授权 `/baf-quality:init`；**禁止**静默写入。
- **路径约定**（`init` **不**预建 `source/`/`test/` 空目录，也**不**写 `.gitkeep`）：

```text
source/<rel>/<module>.c|.h
test/<rel>/test_<module>.c          # 与 source 相对路径镜像；目录在 gen-ut 时创建
```

推荐分层名（可选）：`app` / `boot` / `hal` / `service`；亦可更深路径（如 `lib/lite_library/lite_container`）。

- 改 `:paths` 或布局约定后同步宪法 / `.baf/standards/ci-index.md`。
- 工具链：`/baf:init`。宪法命令由 quality init 自动写入：

```text
TEST_CMD   = baf-quality test
VERIFY_CMD = baf-quality check
```

### 1.1 覆盖率 flags（MinGW / Windows）

- **日常** `test:` **不得**插桩：`:flags.:test` 仅保留如 `-O0`（可用 `"*":` matcher）；**禁止** `-lgcov` / `-fprofile-arcs` / `-ftest-coverage` / `--coverage`。
- **覆盖率**只挂 `:flags.:gcov`，且必须是 **flag 列表**（Ceedling 1.0.x：`"*"` matcher **仅**允许 `:test`）：

```yaml
:flags:
  :test:
    :compile:
      "*":
        - -O0
  :gcov:
    :compile:
      - --coverage
      - -O0
    :link:
      - --coverage
```

- 用 **`--coverage`**（gcc 驱动）；**不要** `-Wl,--coverage`，也**不要** `-lgcov`（MinGW-w64 无 `libgcov.a` → `__gcov_init` 链接失败）。
- `baf-quality test|check|init` 会**自动迁移**旧/`"*":` 误用配置；Agent **不要**把覆盖率 flags 写回 `:test`。

---

## 2. baf-quality 命令

| 目的 | 斜杠 / CLI | 底层 |
|---|---|---|
| 日常 TDD | `/baf-quality:test [suite]` | `ceedling test:<suite>` / `test:all` |
| 清理 | `/baf-quality:clean` | `ceedling clean` |
| **总检查**（UT + 覆盖率） | `/baf-quality:check` | clean → gcov → gcovr → JSON |
| 生成或重构模块测 | `/baf-quality:gen-ut <层/模块>` | 本 skill（自动识别模式） |

禁止：未真跑测就宣称红/绿；口述「测过了」替代 exit code。

---

## 3. TDD 跑测节奏（构建期）

```text
RED    写/改一条失败用例  →  baf-quality test <suite>   必须失败
GREEN  最少实现生产代码   →  baf-quality test <suite>   必须通过
REFACTOR 整理（测或码）   →  baf-quality test           仍绿
verify / 验收终点         →  baf-quality check          全绿 + 覆盖率报告
```

---

## 4. 文件与命名

| 项 | 约定 |
|---|---|
| 相对路径 | `source` 下目录树；`test` **镜像**同相对路径（可多层） |
| 源码 | `source/<rel>/<module>.c` + `.h` |
| 测试文件 | `test/<rel>/test_<module>.c`（与源码同 `<rel>`；写文件时建目录，无 `.gitkeep`） |
| 测试函数 | `void test_<Area>_<behavior>_<expected>(void)` |
| setUp / tearDown | 每个测试文件必须有（可空） |
| 头文件 | `#include "unity.h"`；被测 `#include "<module>.h"`；mock `#include "mock_<dep>.h"` |

好例子：`source/hal/i2c.c` → `test/hal/test_i2c.c`；`source/lib/foo/bar.c` → `test/lib/foo/test_bar.c`
坏例子：`test1`、把测文件丢在与源码无关的目录

---

## 5. 用例结构（AAA）

1. **Arrange** — 输入、夹具、mock Expect
2. **Act** — 一次调用被测入口
3. **Assert** — Unity 断言

工程默认 **`UNITY_EXCLUDE_FLOAT`**：禁止浮点断言宏。

| 场景 | 优先 |
|---|---|
| 整型 | `TEST_ASSERT_EQUAL_INT` / `UINT` / `HEX*` |
| 真假 | `TEST_ASSERT_TRUE` / `FALSE` |
| 指针 | `TEST_ASSERT_NULL` / `NOT_NULL` |
| 内存/字符串 | `TEST_ASSERT_EQUAL_MEMORY` / `EQUAL_STRING` |

---

## 6. CMock

- mock 头：`mock_<header>.h`；只 mock 协作依赖，**不** mock 被测模块
- Expect 与 Assert 成对；意外调用应失败（`fail_on_unexpected_calls`）

---

## 7. 测什么 / 不测什么

**必须**：公开 API 正常/边界/错误码；缺陷复现（先 RED）。
**不要**：凑覆盖率废话测；测标准库；无断言空跑。

覆盖率默认 **≥80%**；验收入口 `/baf-quality:check` → `.baf/reports/ut-coverage.json`。

---

## 8. gen-ut（生成 **或** 重构 — 自动识别）

触发：`/baf-quality:gen-ut <相对路径或模块>`，例：`hal/i2c`、`lib/foo/bar`、`source/hal/i2c.c`。

### 8.1 解析

1. 解析 `rel`（`source/` 下相对目录）+ `module`（缺则从已有 `source/**/<module>.*` 推断；仍不确定则询问）。
2. **镜像路径**：`source/<rel>/<module>.c|.h` → `test/<rel>/test_<module>.c`。
3. 写测文件前 **创建** `test/<rel>/`（及必要时的 `source/<rel>/`）；**不要**写 `.gitkeep`，也**不要**预建无关空层。

### 8.2 模式判定

| 条件 | 模式 |
|---|---|
| 无 `test/<rel>/test_<module>.c`，或文件不存在 | **生成** |
| 已有测试文件且含有效 `test_*` / 断言 | **重构** |
| 仅有空骨架 / 仅有 `TEST_FAIL_MESSAGE` 占位 | **生成**（补齐行为用例） |

### 8.3 生成模式

1. 若无源码：按 `sora-c-code-standards` 写最小 `.c/.h`（或请用户确认接口），**不要**调用已删除的 `module` CLI。
2. 按镜像路径创建 `test/<rel>/test_<module>.c`（可参考 `.baf/quality/test_module.template.c`）。
3. 按 §4–§7 列出并实现用例。
4. 对改动的 `.c/.h`：**不要**中途 format；收敛与 `/baf-quality:lint` 完成后再最终 `clang-format -i`（见代码冻结）。
5. `baf-quality test <module>` 真跑；未绿不得宣称完成。

### 8.4 重构模式

1. **基线**：先 `baf-quality test <module>`（记录红因）。
2. 允许：重命名、拆大用例、抽 setUp、补边界、删废话测、理顺 AAA、**迁到与 source 镜像的正确路径**。
3. **禁止**：借重构改生产行为；静默删有效断言。
4. 小步改 + 真跑；**禁止**中途 format；收工前走 check → lint → 最终 clang-format；可选 `baf-quality check`。

新建与重构**同一套**本规范。

---

## 9. 性能约定（check / 日常跑测）

| 场景 | 推荐 |
|---|---|
| 日常 TDD | `baf-quality test <suite>`（单 suite，最快） |
| 验证 / 覆盖率 | `baf-quality check`（**默认不 clean**，增量编译） |
| 怀疑缓存脏 | `baf-quality check --clean`（慢） |
| 只要变更相关覆盖 | `baf-quality check --delta` |
| 详版 HTML | `baf-quality check --open`（默认仅简 HTML） |

**不要**用多 Agent 并行跑同一个 `ceedling`/`check`（会争抢 `build/`、结果不可复现）。多 Agent 适合 `/baf-quality:gen-ut` 按模块拆分写测。

---

## 10. 与 baf-standard / 工作流

- 生产代码风格、Doxygen、最终 `clang-format -i`（代码冻结）→ `sora-c-code-standards`
- 风格/静态分析 → `sora-c-static-analysis` / `/baf-quality:lint`
- 规格构建期：facade 短引用本约定
- 对用户优先说 `/baf-quality:test`、`/baf-quality:check`、`/baf-quality:gen-ut`
