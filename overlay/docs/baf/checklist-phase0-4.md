# BAF Phase 0–4 人工检查清单

> 开发/验收用，**不进**用户帮助 site。用户手册见 [`../help/`](../help/)。

用于验收已落地能力。在桌面 `baf-dsh` 上逐项勾选；失败时记下：是否 BAF 会话、工作区 cwd、截图/原文报错。

## A. 安装与启动

- [ ] 能启动当前打包的 `baf-dsh.exe`
- [ ] 应用内帮助可打开，含 [BAF 模式](../help/baf-mode.md)；帮助导航**无**本清单与 Dashboard 方案页
- [ ] 设置里能看到「轨迹图」开关（不是「工作流」）

## B. Phase 1 — BAF 预设

- [ ] 新建会话可选 **BAF 模式**（无 `commands without inject` 报错）
- [ ] 非 BAF 会话顶栏**没有**「工作流」页签
- [ ] BAF 会话顶栏**有**「工作流」页签
- [ ] 官方 BAF **不可复制**
- [ ] 切换到 BAF 后 skills（如 `baf-go`）可被加载

## C. 斜杠指令（BAF 会话）

- [ ] 输入 `/` 可见 `baf-help` / `baf-status` / `baf-version` / `baf-doctor`
- [ ] `/baf-help` 为**指令卡片**（标题为指令名）；**默认展开**；分区格式（【可用指令】等）
- [ ] `/baf-status` / `/baf-version` / `/baf-doctor` 同样默认展开；`/baf-version` 三层字段与设置「版本与更新」一致，并列出 `baf-core` / `baf-workflow`
- [ ] `/baf-open` 等建设中指令返回明确「尚未实现」错误卡，不进大模型

## D. 工作流 Tab — 空态 / 模板

- [ ] 打开「工作流」约 **3 秒内**看到流程图
- [ ] 顶栏模式为「模板（空闲）」+ 无变更提示
- [ ] 图含 intake→…→archive，以及 drift / completed / abandoned
- [ ] 主题跟随设置：浅色 / 深色 / 跟随系统

## E. 工作流 Tab — 交互

- [ ] 点击卡片：选中（右侧详情切换），**无展开折叠**
- [ ] 当前阶段卡片有醒目标识（「当前」徽标 + 描边/光晕）
- [ ] hover 仍有抬起/描边动效
- [ ] 右键拖动平移；Ctrl+滚轮缩放
- [ ] 右侧「本阶段清单」醒目列出**未作**（及已作）
- [ ] 顶栏「变更总览」可打开列表面板；顶栏**无**「点击卡片选中 · 右键…」提示条
- [ ] 阶段详情中英对照可读

## F. Intake 半交互

- [ ] 「新建变更」或对话描述后出现分类卡
- [ ] 分类卡显示 kind / mode / scope / confidence / summary
- [ ] 确认 → 模式变为 full-go / fast-path / clarify；拒绝 → 退出
- [ ] 确认前工作区无意外源码写入

## G. Projection / Transition

- [ ] 确认后顶栏显示当前阶段
- [ ] 合法按钮可点；未就绪按钮禁用且有 reason
- [ ] 刷新 / 重开同 cwd 会话后状态仍在（`.baf/projection/`）
- [ ] 阻断时顶栏有提示，图仍可见

## H. 与轨迹图隔离

- [ ] 「工作流」= 变更阶段；「轨迹图」= 执行轨迹；职责不混

## I. 模式与续跑（概念核对）

- [ ] 理解：full-go / bug-fast-path 由 **intake 分类确认**决定，不是另开 slash「选模式」
- [ ] 理解：一条变更一种模式；同工作区可多变更；快路径可升级 full-go（同变更，不必新开会话）
- [ ] 理解：状态在工作区 projection；同 cwd 新会话可续；换机需同步 `.baf/projection/`

## J. 明确尚未实现

- [ ] 阶段驱动 slash、自动门禁、归档 Dashboard、Electron IPC、热更验签 → 仍属后续 Phase，不按已完成验收
