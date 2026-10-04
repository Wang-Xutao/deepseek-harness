# dsh-auth cookie 无限累积 → 431 砖死修复（2026-10-04）

症状：桌面应用（dev 与打包版同样）白壳 +「Failed to load plugins / client-modules: HTML did not preload」。同 repo 同 env 独立起 `node apps/cli/lib/bin.js web` 却完全正常——构建与插件都不是原因，先查 cookie。

## 根因

dsh host 的浏览器会话 cookie 名原为 `dsh-auth-<sha256(Host 头)>`（[browser-auth.ts](../../../../packages/client/connection/src/browser-auth.ts) 原 `cookieName(authority)`）。cookie 按 host 存储且**不分端口**，而桌面子进程每次启动 `--port 0` 拿到新随机端口 → authority 变 → cookie 名变 → 同名覆盖永不发生，每开一次机净增一条 ~226B、7 天期的 HttpOnly cookie。累积到请求头超过 Node 默认 `maxHeaderSize` 16KB（本机实测 70 条 / 15.7KB）后，host 对 `plugins/*` 一律 431，模块系统起不来。浏览器直开 `dsh web` 多端口同样会累积——桌面只是最先撞线。

关键认知：**authority 绑定本来就在签名 payload 里**（`isAuthenticated` 校验 `payload.authority !== authority` 即拒绝），cookie 名只是索引。按 authority 命名对安全性是冗余的，对累积是致命的。

## 修复（候选 a：host 侧固定 cookie 名）

- 【变更】`packages/client/connection/src/browser-auth.ts`：cookie 名固定为常量 `COOKIE_NAME = 'dsh-auth'`（原 `COOKIE_PREFIX + sha256(authority)` 与 `cookieName()` 删除，`createHash` import 一并移除）。每次 token 交换 `Set-Cookie` 同名同 Path → 浏览器/Electron jar 自动替换，恒为 1 条；签名 payload 的 authority 受众校验原样保留，换端口旧 cookie 依旧被拒（各端口重新走打印的 token URL 自愈，桌面每次启动本就带新 token URL）。
- 【变更】`packages/client/connection/tests/browser-auth.host.spec.ts` 新增回归用例「mints one fixed cookie name across authorities so a browser jar cannot accumulate」：4 个不同 authority 交换出的 Set-Cookie 名必须同为 `dsh-auth`，且固定名下异 authority cookie 仍被拒（绑定在 payload 不在名）。
- 修复面覆盖**所有客户端**（浏览器直开、桌面 dev、打包版），不止桌面。
- 取舍：b)（桌面 main 启动清 cookie）不修浏览器直开场景且不修根因；c)（host 登录时清同前缀旧 cookie）需在 credentials 里记账历史 authority 才能逐名发 `Max-Age=0`，a 落地后无物可回收。

## 验证梯（2026-10-04，全部通过）

- 单测：browser-auth.host.spec 7/7（6 存量 + 1 新增）；connection 包 + gateway.host + frontend-static 批跑仅 4 例失败（rpc-retry 3 + fixture 1），`git stash` 对照证实**不带本改动同样挂**——预存的客户端 fetch-mock/夹具问题，与鉴权无关（binary-rpc 单跑通过，批跑并行下抖动）。
- 类型：包内 `tsc -b tsconfig.host.json` OK；根 host 面 `tsc -b tsconfig.host.json` exit 0。
- 产物：包内 tsdown 重建 `lib/index.js`——bundle 中 `dsh-auth` 恰 1 处、`createHash` 0 处。
- 独立 CLI 双端口 + 共享 curl jar（curl 的 jar 同样 host 域不分端口）：3181 交换 → `set-cookie: dsh-auth=…`（payload 内 authority 可见）+ jar 取 index 200；3182 用**同一 jar** 交换 → 仍是 `dsh-auth`，**jar 中 dsh-auth 条目恰好 1 条**（旧名方案此处为 2 条）；3182 用新 cookie 200；3181 对新 cookie 401（payload 绑定把守，与修复前语义一致）。
- 桌面端（electron dev + CDP 9201，`Storage.getCookies` 取证）：第一次启动 = 6 条旧哈希名残留（当天早些时候旧代码运行所留）+ 1 条新固定名 `dsh-auth`；**杀进程重启第二次仍为同样 7 条**（固定名替换而非新增；旧代码每次启动 +1 条新哈希名）；渲染器内复取页面真实发出的三个 `/plugins/??…` 组合 URL 全部 **200 text/javascript**（砖死症状 431 消失），应用壳与 `__ModuleLoader__` 完整。

## 存量影响与急救

已累积的旧名 cookie 各自 ≤7 天自然过期（HttpOnly，服务端无法枚举客户端 jar 逐名清除）；修复只保证不再增长。个别已砖环境急救：app 存活时 CDP `Storage.clearDataForOrigin {origin:'http://127.0.0.1', storageTypes:'cookies'}`；app 起不来时删 `%APPDATA%/baf-dsh/Network/Cookies` 文件。

同浏览器同 host 双端口并行会话现在互相顶掉 cookie（最后登录者胜）——被顶方走打印的 token URL 重交换即恢复，桌面单子进程场景不构成问题。
