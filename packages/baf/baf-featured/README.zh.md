---
description: "精选插件服务：在 profile plugin-manager 之上编排外部 bundle 的安装、更新、启停与自动更新。"
---

# @deepseek-ai/dsh-baf-featured

[English](README.md) | 中文

## 摘要

`dsh-baf-featured` 把一份人工维护的 `featured-plugins.json` 变成一组受管的外部 bundle。它每次调用都现读清单（热更清单无需重启服务），把每个条目与 profile 已装 bundle（经 `@deepseek-ai/dsh-plugin-manager`）做 join，并以一个远程服务（`ctx.featuredPlugins`）提供安装、更新、启停、删除、批量操作与可选自动更新。

没有 plugin-manager 时所有卡片降级为只读 `unavailable`；服务不会因此阻塞任何启动。

## 目录

- [使用](#use-this-package)
- [实现说明](#understand-the-implementation)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用

桌面壳经 `BAF_DSH_FEATURED_MANIFEST` 导出清单路径；服务由 web bundle 挂载，经 Typert Gateway 访问：

```ts
const listing = await ctx.remote.featuredPlugins.list()
await ctx.remote.featuredPlugins.install('dsh-feishu')
// A refusal the person must confirm:
if (!result.ok && result.needsRiskAck) {
  await ctx.remote.featuredPlugins.install('dsh-feishu', { acceptRisk: true })
}
```

更新就是对同一精选范围的直接安装——manager 的 inspect 期「已安装」拒绝只挡预检，不挡这条路径。`setAutoUpdate` 把用户的选择持久化到 dsh home 旁；定时检查只重装「已启用、已选择自动更新、且注册表给出的新版本仍在精选范围内」的条目。

<a id="understand-the-implementation"></a>
## 实现说明

- `manifest.ts` 严格校验清单（schemaVersion、整数 revision、逐条目的必填字段、重复 id），以非抛出的方式报告问题。
- `registry.ts` 比较版本号、判定注册表答案是否落在精选 `^` 范围内，并以每个注册表 10 秒为上限依次查 npmmirror、npmjs 的 `<pkg>/latest`。
- `state.ts` 经 `writeFileAtomic` 把自动更新覆盖与最新版本缓存持久化到 `~/.dsh/featured-state.json`，读不出的内容宽容回退为默认值。
- `service.ts` 做清单 × bundle × 状态的 join，折叠 manager 的 `ChangeResult`（兼容拒绝变成 `needsRiskAck` 确认；被扣的构建脚本以 `pendingBuilds` 透传），对已接受的豁免经 `setVersionExemption` 授权后重试一次，并用 unref 的 Node 定时器驱动自动更新、dispose 时清理。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 版本检查不咨询 profile 的 pnpm，信任注册表 `latest` 文档。注册表提供过期元数据时，`latestKnown` 会保持过期直到下一次检查。
- 自动更新绝不自行接受风险或批准构建脚本：更新触发兼容门或 pnpm 构建拦截的条目，等待用户在设置区块里处理。
- `rangeSatisfies` 只覆盖精确 pin 与三段版本上的 `^` 范围——即清单 pin 的形态；其他范围语法按精确 pin 对待。
