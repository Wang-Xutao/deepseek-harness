---
name: sora-c-code-standards
description: >
  Use when writing, reviewing, refactoring, or generating C (.c/.h) for SORA
  projects; when applying C templates, clang-format, third-party whitelist,
  high-risk review checklist, or SRI-SPEC-SW-01A rules; when touching malloc,
  goto, recursion, SDK/BSP/vendor paths, or module prefixes like I2c_Read.
---

# SORA C 语言编码规范（Agent 短规则）

**权威**：`SRI-SPEC-SW-01A` + 企业拍板。本页为可执行摘要。
**分层**：**skill = 软约束（教/提醒）**；**hook / CI = 硬拦截**（`baf-guard` 与流水线，P2+）。不要假装 skill 能替硬门禁。

模板入仓：`/baf-standard:apply-c-templates` 或 `baf-standard apply-c-templates`（须用户授权）。
**新建与重构同等（强制）**：凡触及自研 `.c/.h`——无论新建模块、改行为、还是重构/整理——**同一套**本 skill（文件头、Doxygen、命名）。排版见「clang-format（代码冻结）」；禁止「只 refactor 不 format / 不补注释」。
**新建 C 模块（主路径）**：由 Agent **按模板一次写齐**完整件（见下节），不以 CLI 为工作流前置。
可选脚手架：`baf-standard new-module <name>`（**非工作流必经**；现亦生成 `AGENTS.md` + `CLAUDE.md`）。
核对表：`references/sri-spec-sw-01a-agent-checklist.md`。
模块手册样板：`templates/c/module-README.template.md`（入仓后 `.baf/template/`）。

## 企业拍板（摘要）

| 项 | 决定 |
|---|---|
| 圈复杂度 | **&lt; 15** |
| 接口命名 | **`I2c_Read` 风格**：模块前缀 UpperCamel 缩写 + `_` + UpperCamel 动词（例 `I2c_Read`、`Spi_Transfer`） |
| return | 允许**卫语句提前 return**；其余保持单出口 |
| 动态分配 / goto / 递归 | 默认禁止；例外见「高风险」 |
| 格式 | **以项目 `.clang-format` 为准**（含 `PointerAlignment: Left`）；**代码冻结前最后一步**对本次触及的自研 `.c/.h` 执行 `clang-format -i`；**禁止中途 format** |
| 风格/静态分析 | `/baf-quality:lint`（cpplint 定制 + cppcheck）；在最终 format **之前**跑完并修完；见 `sora-c-static-analysis` |
| AUTOSAR | **暂不支持**；按本常用规范。待后续专项再开 |
| 度量 CI | 注释率/扇入扇出/CC **暂不进 CI** |
| 源文件编码 | **UTF-8 无 BOM**（中文注释必备；禁止 GBK/GB2312 等） |
| 语言范围 | 本期 **C + Python**；C++ 等后续 |

## 高风险例外（自有代码）

未授权不得引入：`malloc`/`calloc`/`realloc`/`free`、VLA、`alloca`、`goto`、自有递归。

授权后 **同时**满足：

1. 源码注释：`/* HIGH-RISK: <malloc|goto|recursion> — confirmed: <reason> */`
2. MR/评审附上并勾选：`.baf/standards/high-risk-review-checklist.md`（入仓后路径；插件源在 `templates/c/`）
3. 交付说明单列高风险点

## 第三方 / SDK / BSP 白名单

配置：`.baf/standards/third-party-whitelist.json`（`apply-c-templates` 写入）。

| 策略 | 含义 |
|---|---|
| `allowHighRisk: true` | 白名单内第三方源码可含堆/goto/递归，**不**按自有代码逐处 HIGH-RISK 注释 |
| `writePolicy: deny_by_default` | **非必要不得修改**白名单路径；禁止默默 Edit/Write |
| 修改第三方 | 须用户明确授权 + 评审清单「第三方写入」节 + 最小 diff |

默认 glob 示例：`third_party/**`、`vendor/**`、`sdk/**`、`bsp/**`、`Drivers/**`（可按项目改）。
硬拦截由 **baf-guard** 读同一白名单（P2）；本 skill 负责软约束与提醒。

## 文件头与生成

文件头模板：`templates/c/template.c` / `template.h`（入仓后多在 `.baf/template/`）。

| 字段 | 填什么 | 禁止 |
|---|---|---|
| `@copyright` | `Copyright (c) <年> Huizhou SORA Intelligent Technology Co., Ltd. All Rights Reserved.`（**索拉智能**英文法定名） | 把 **git author / 个人姓名** 写进公司位；留 `***` / `__COMPANY__` 未替换 |
| `@author` | `git config user.name`（自然人） | 把公司名写进 `@author` |
| 年份 | 当前日历年 | — |
| history 表 Author | 同 `@author`（自然人） | 用公司名冒充变更作者 |

生成器占位符：`__YEAR__`、`__COMPANY__`（固定公司英文名）、`__AUTHOR__`（仅 git user.name）。手写文件头时同样遵守上表；**不要**用 git author 顶替 `@copyright` 中的公司。

## clang-format（代码冻结 · 最终排版）

**冻结点**：对**本次触及的全部自研 `.c/.h`（含 `test_*.c`）**执行最终一次 `clang-format -i` 且成功结束的时刻。此后禁止再改自研 `.c/.h`。

**禁止中途 format**：构建 / TDD / 补注释 / 修测 / 修 lint 过程中 **不得** 执行 `clang-format -i`。

**正式时机（冻结前最后一步）**

1. `/baf-quality:check` 与 `/baf-quality:lint` 已收敛（无需再改源码）
2. 再执行：

```bash
clang-format -i path/to/file.c path/to/file.h
```

3. 然后 `/baf-workflow:status`（`--dry-run -Werror` 机检）→ 归档/提交

若冻结后必须再改源码 → **显式解冻** → 修完 → 重跑相关 test/lint → 再次最终 format。

**范围**

- 仅对**本次改动的** `.c` / `.h`（可多文件一次命令）
- 白名单第三方 / 生成代码：默认不碰
- 配置：仓根 `.clang-format`；无则提醒先 `/baf-standard:apply-c-templates`（或团队自备），**不**静默写入

**失败处理**

| 情况 | Agent 行为 |
|---|---|
| `clang-format` 不在 PATH | **【阻塞】代码格式**；提醒安装；**不要**假装已格式化；**不得**宣称验证完成 / 不得 archive |
| 无 `.clang-format` | 提醒入仓/自备；规格验证阶段视为格式门未就绪；不擅自用默认 style |
| 冻结后 dry-run 失败 | **解冻**或补跑最终 `-i` 后再 status |
| 中途已 format 又改源码 | 不算「已做」；须在冻结前再跑最终一次 |

**与 lint**：`/baf-quality:lint` 在最终 format **之前**；修告警属于冻结前。

## 注释 / Doxygen（P1.6）

**方言**：`/** … */`（极短可用 `/** @brief … */` 单行）；关键局部逻辑用 `/* … */` 块注释。
**分层**：本专节 = 软约束；注释率 / doxygen warn **不进 CI**（P2 另议）。
**价值导向**（嵌入式）：注释补的是代码看不出来的**设计意图、硬件/时序约束、状态机规则、并发关系、单位、边界与风险**——**禁止**把语句翻译成中文废话。参考：[别让AI把你的代码注释成废话](https://cloud.tencent.com/developer/article/2684127)。

### 原则（强制）

1. **少而准**：只注释关键点；不增加纯文字密度。
2. **不解释语法**：禁止 `cnt++ // 计数加一`、`if (v < th) // 如果电压小于阈值` 一类噪音。
3. **写意图与现场约束**：为何此顺序、为何延时、为何不能跳状态、错误码为何保留、阈值从哪来。
4. **不确定不编造**：意图不明 → 写「待确认：…」或不写；禁止把猜测写成确定事实。
5. **不改逻辑**：补注释不得改名、改结构、扩头文件、扩编译产物；保持编码/缩进/行宽。
6. **范围可控**：只改用户自研代码；第三方/生成文件默认不碰（见下）。

### 覆盖（强制 · 接口层）

| 符号 | 要求 |
|---|---|
| `.h` 全局函数 / 公开类型 / 有语义的对外宏 | 完整文档块（且 `@brief` 须有业务信息，禁止空泛复述函数名） |
| `.c` 非 `static` 函数 | 同公开 API |
| `static` 辅助函数 | **至少**一条有信息量的 `@brief`（禁止「处理数据」「辅助函数」等空话） |

公开 API 完整块：`@brief` + 每个形参 `@param`（含**单位/范围/可否 NULL**）+ `@return`（错误码与**调用方处理**；`void` 可省略或写「无」）。
有调用上下文 / 硬件 / 并发约束时写 `@note` / `@warning`。推荐常见错误码用 `@retval`。

### 优先注释（逻辑层 · 强制有则写）

出现以下对象时，**必须**补有信息量的注释（函数头或紧邻块/行注释）：

| 对象 | 注释重点 |
|---|---|
| 全局 / 静态 / 跨上下文共享变量 | 单位、更新者、读取者、生命周期、并发 |
| 状态机状态与迁移 | 含义、合法进入/离开、**禁止直跳的原因**、与硬件/保护关系 |
| 中断 / 回调 | ISR 只做什么、禁止做什么 |
| DMA / 环形缓冲 / 双缓冲 | 读写者、边界、满时策略 |
| 硬件时序 / 延时 / 魔法数 | 为何该值、板卡/实测依据（可知则写） |
| 安全保护 / 故障恢复 / 协议兼容分支 | 动作顺序、保留原因、删改风险 |

### 不建议注释（禁止硬凑）

单纯赋值、一眼能懂的条件、标准库调用、普通循环计数、无关临时变量、已自解释的枚举名——**不要**为凑覆盖率而写。

### 语言（方案 C）

- 说明以**中文**为主。
- 允许固定英文术语（`NULL`、`I2C`、`timeout`、`retry`、`ISR`、`DMA` 等）与「中文（English）」括注。
- 禁止无结构的中英碎片乱拼；禁止空泛套话（「提高稳定性」「保证安全」却不写机制）。

### 格式锚点

**函数（Doxygen）**：

```c
/**
 * @brief  处理 RS485 接收事件并推进协议解析状态机。
 * @param  port   通信端口索引；取值 0 .. COMM_PORT_MAX-1。
 * @param  event  接收事件；须来自串口空闲中断或 DMA 完成回调投递。
 * @return 0 成功；负数表示端口无效、缓冲异常或状态机错误（调用方应停止推进并记日志）。
 * @note   运行于通信任务上下文，禁止在中断中直接调用。
 * @note   只消费环形缓冲中的完整帧，不负责清空 DMA 原始缓冲。
 */
int Comm_ProcessRxEvent(uint8_t port, const CommRxEvent_t *event);
```

**共享变量**：

```c
/* DMA 写位置，由串口空闲中断更新；通信任务只读快照，禁止直接改写。 */
static volatile uint16_t s_uart3_dma_write_pos;
```

**关键局部逻辑 / 状态机**：

```c
/* RS485 方向脚释放后须等收发器进接收态；V2.1 板实测约 15us，取 20us。 */
Delay_Us(20);

/*
 * 先等 PWM 降至 0 再关驱动使能。
 * 直接跳 IDLE 会绕过制动释放，功率桥残余电流可能未泄放。
 */
```

### 文件头

延续 `@copyright` / `@author` / history 表；与 API 块并存。
`HIGH-RISK` 注释规则见上文「高风险例外」，**不**替代 API 文档块与意图注释。

### 第三方 / 生成文件（不修改）

白名单路径默认不改、不要求补 Doxygen。另跳过（只读分析即可）：含 `DO NOT EDIT` / `Generated by`、CMSIS/HAL/RTOS/开源组件等厂商与生成痕迹文件。来源不确定 → **先问用户或只读**，不批量改。

### 反模式

| 借口 / 写法 | 现实 |
|---|---|
| 「static 不用写」 | 至少一条**有信息量**的 `@brief` |
| 「名字已经说明一切」 | 公开 API 仍要完整块（单位/错误码/上下文） |
| 「@brief 处理电机状态」 | 空泛；须写清状态机/保护/并发等非表面信息 |
| 「先整仓自动注释一遍」 | 易污染；先小范围自研模块，排除第三方 |
| 「skill 写了就算 CI 过了」 | 硬拦是 P2 |

### 真站同步（公开注释变更后）

触及公开 `.h` / 对外符号的 Doxygen 注释或签名时，同一变更须跑 **`baf-standard docs-doxygen`**，提交 **`docs/api/site/`**（入口 `docs/api/site/index.html`）。仓级清单仍是人手维护的 `docs/api/README.md`。细节见 `sora-docs-standards`；缺 `doxygen` / 未更新 site → **`【阻塞】API 文档`**（`baf-workflow status` 机检），勿假装已更新站点。

## 新建 / 重构 C 模块完整件（P1.6 · AI 主路径）

Agent **写出或重构**触及独立边界的 C 模块时须具备（对照 `templates/c`）：

| 项 | 要求 |
|---|---|
| 目录 | `<name>/` |
| 源码 | `<name>.c` + `<name>.h`；格式/命名/文件头符合本 skill 与 `template.*`；收工前最终 `clang-format -i` |
| 注释 | 符合上文「注释 / Doxygen」（重构触达的符号同等补齐；删语法废话） |
| 人读手册 | `<name>/README.md`，结构见 `module-README.template.md`（固定 9 节；§4 含错误码**与关键日志**） |
| Agent 约定 | 成对 `<name>/AGENTS.md` + `<name>/CLAUDE.md`；**细则只写 AGENTS**；CLAUDE **仅**短指针 → `./AGENTS.md` |

缺任一项 → **高警**，补齐前不宣称模块已就绪。
**不以**执行 `baf-standard new-module` 为前置；该 CLI 仅为可选人工脚手架。

## 文件 / 排版 / 命名（强制要点）

- **编码**：**UTF-8 无 BOM** 写入/保存 `.c`/`.h`；禁止 GBK、GB2312、系统默认 ANSI；中文注释依赖本条
- 文件名：`lower_snake`；`.c`/`.h` 同名；inc/src 分离；第三方独立目录
- Allman 大括号；4 空格；行宽 120；控制语句必 `{}`；`switch` 有 `default`；`if/else if` 以 `else` 收尾
- 类型 UpperCamel；函数 `I2c_Read` 风格；全局 `g`+lowerCamel；成员 `m`+；宏 `UPPER_SNAKE`；禁拼音
- ISO C99；扇出&lt;14 / 扇入&lt;10；参数≤8；嵌套≤6
- 形参自检；`const`/`volatile`；不返回栈指针；声明即初始化

## Agent 契约

1. 强制违规先改再交；格式争议服从 `.clang-format`。
2. 自研 `.c/.h` 变更收敛后、**代码冻结前最后一步**执行 `clang-format -i`；禁止中途 format；无二进制或缺配置按上文失败处理，禁止假装已 format。
3. 新建/改写源文件必须 **UTF-8 无 BOM**；发现非 UTF-8 先转码再改；生成器同此。
4. 白名单路径：默认只读；要改先问用户。
5. 自有高风险：无确认 + 注释 + 评审清单 → 不得落地。
6. 不把 AUTOSAR 规则擅自加严。
7. 不输出受控 PDF 全文。
8. 写/改 C：缺合规注释（公开完整块 / static 有信息量的 `@brief` / 关键逻辑意图注释）→ **先补再交**；发现语法翻译式废话注释 → **删改后再交**。
9. 新建 C 模块：缺目录 / `.c`/`.h` / 合规注释 / 9 节 `README.md` / 成对 `AGENTS.md`+`CLAUDE.md` 任一 → **先补齐完整件再交**。
10. **重构**触及的自研 `.c/.h`：同等执行契约 1–8（含 `clang-format -i` 与注释）；不得以「只是重构」跳过。
11. 批量补注释：先列拟改/跳过文件；只处理自研代码；完成后自检无第三方误改、无「该函数用于…」类低价值句。

## 反模式

| 借口 | 现实 |
|---|---|
| 「先改一下 HAL 驱动」 | 白名单默认禁止写 |
| 「注释了就不用评审」 | 必须进高风险评审清单 |
| 「skill 拦了就算门禁」 | 硬拦是 hook/CI |
| 「按 AUTOSAR 来」 | 本期不用 |
| 「Windows 默认编码也行」 | 必须 UTF-8 无 BOM，否则中文注释易乱码 |
| 「注释越多越好」 | 嵌入式要少而准；废话是噪声 |
| 「提交前再 format 就行」 | **正确时机**：lint 收敛后的最终 format（代码冻结）；禁止中途 format 与冻结后再改源码 |
| 「@copyright 填 git author」 | 公司位固定索拉英文名；个人只进 `@author` / history |
| 「公司位留 *** / 占位符」 | 生成或手写时必须落成 `Huizhou SORA Intelligent Technology Co., Ltd.` |
