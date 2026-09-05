# overlay 文档索引

| 目录 | 读者 | 内容 |
|------|------|------|
| [help/](help/) | 终端用户 | MkDocs 源文档；构建产物在 [`../site/`](../site/) |
| [product/](product/) | 二次开发 | 需求总账 |
| [engineering/](engineering/) | 二次开发 | 架构、打包、上游触达 |
| [release/](release/) | 发版 | 版本对照表 |
| [enterprise-workflow.md](enterprise-workflow.md) | BAF 实现 / 企业落地 | 企业级 BAF 模式在 dsh 中的设计与分阶段实施（含评审结论） |
| [baf/](baf/) | BAF 实现 / 企业落地 | Phase 0 合同：企业输入、错误码、兼容矩阵、route 核查 |

用户帮助站构建：

```powershell
cd overlay
npm run docs:build
```
