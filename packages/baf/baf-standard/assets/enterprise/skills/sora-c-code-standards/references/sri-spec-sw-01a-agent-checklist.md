# SRI-SPEC-SW-01A Agent 核对表

> `SRI-SPEC-SW-01A` + 企业拍板。非受控副本。

## 拍板

- [x] CC **&lt; 15**；接口 **`I2c_Read` 风格**；卫语句可提前 return
- [x] 格式以 **clang-format** 为准；**改完 `.c/.h` 立刻**对改动文件 format
- [x] 高风险：注释 **+** 评审清单；白名单路径高风险可预期；第三方默认只读
- [x] 无 AUTOSAR；度量暂不进 CI；语言 C+Python
- [x] 源文件编码 **UTF-8 无 BOM**
- [x] skill=软 / hook+CI=硬

## 交付前

- [ ] 源文件为 **UTF-8 无 BOM**（含中文注释）
- [ ] 文件头 `@copyright` = 索拉智能英文公司名（`Huizhou SORA Intelligent Technology Co., Ltd.`）；**禁止**填 git author
- [ ] `@author` / history Author = `git config user.name`（自然人）
- [ ] 改完 `.c/.h` 已对改动文件 `clang-format -i`（非仅提交前）
- [ ] 自有高风险：注释 + `.baf/standards/high-risk-review-checklist.md`
- [ ] 未擅自改 `third-party-whitelist` 内路径（除非授权）
- [ ] 命名 / 复杂度 / 防御性符合 skill
- [ ] 公开 API：Doxygen 完整块（`@brief` / `@param` 含单位范围 / `@return` 含调用方处理）；`@brief` 非空泛复述名
- [ ] `static` 函数至少一条**有信息量**的 `@brief`
- [ ] 注释说明中文为主；术语/括注符合方案 C；**无**语法翻译式废话
- [ ] 状态机 / ISR / DMA / 硬件时序 / 共享变量等关键点已补意图与约束（有则写）
- [ ] 未改第三方 / `DO NOT EDIT` / 生成文件
- [ ] 新建 C 模块：`<name>/` + `.c`/`.h` + 9 节 `README.md`（§4 含错误码与关键日志）
