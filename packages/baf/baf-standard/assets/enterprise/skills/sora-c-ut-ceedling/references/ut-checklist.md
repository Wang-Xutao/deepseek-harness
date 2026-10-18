# C 单元测试 Agent 核对表（SORA / baf-quality）

配合 `sora-c-ut-ceedling`。交付或自评前勾选。

## 工程

- [ ] 存在 `project.yml`（否则先 `/baf-quality:init`）
- [ ] `:flags.:test` 无 `-lgcov` / 覆盖率插桩；覆盖率仅在 `:flags.:gcov` 用 `--coverage`
- [ ] 用例在 `test/<rel>/test_*.c`，与 `source/<rel>/` **路径镜像**（无多余 `.gitkeep` 空层）

## 每条用例

- [ ] 函数名 `test_<area>_<behavior>_<expected>`，可读
- [ ] 含 AAA（Arrange / Act / Assert）
- [ ] 有有效 Unity 断言（非空跑）
- [ ] 未使用浮点断言（`UNITY_EXCLUDE_FLOAT`）
- [ ] 一条用例一个主要行为

## Mock

- [ ] 只 mock 协作依赖，不 mock 被测模块
- [ ] Expect 与 Assert 成对

## TDD / 命令

- [ ] RED 曾真跑失败；GREEN / REFACTOR 真跑通过
- [ ] 日常：`baf-quality test [suite]`
- [ ] 验收：`baf-quality check` 留下 `ut-coverage.json`
- [ ] 改动 `.c/.h` 已 `clang-format -i`

## gen-ut

- [ ] 自动识别：无测→生成；有测→重构
- [ ] 路径落在正确分层；重构未偷改生产行为、未删有效断言
