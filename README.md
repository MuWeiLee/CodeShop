# CodeShop 扫码导购商城

线下体验、线上成交：门店只放样品，顾客扫码下单、送货到家，线上订单按「服务记录」归属到门店和导购。

产品需求见 [扫码导购商城 PRD](https://claude.ai/code/artifact/56f919ae-b48b-4ade-9e62-fdbe0228adef)，文中的「PRD x.x」均指该文档章节。

## 当前进度

第一步：项目骨架 + 三个核心引擎，服务端主流程已能跑通。

| 部分 | 目录 | 状态 |
| --- | --- | --- |
| 领域核心：码服务、归属引擎、导购券引擎 | `packages/domain` | 已完成，78 个单元测试 |
| 服务端（NestJS + Drizzle + PostgreSQL） | `apps/server` | 扫码、绑定、领券、导购开单、下单归属、生码、规则配置；29 个端到端测试 |
| 客户端小程序（Taro + React） | `apps/client-mp` | 扫码、店内模式商品页、领券、下单、我的 |
| 导购端小程序 | `apps/guide-mp` | 动态导购码；其余为工作台占位 |
| 商家端后台（React + Ant Design） | `apps/merchant-web` | 商品码生成与打印、规则配置；其余模块占位 |
| 平台运营端后台 | `apps/platform-web` | 菜单骨架，页面待开发 |

尚未接入：正式登录、微信支付与分账、物流、商家 ERP / 仓库对接。详见 [docs/architecture.md](docs/architecture.md#尚未接入)。

## 快速开始

需要 Node.js 22 与 pnpm 10。本地开发不用安装数据库，服务端默认使用内嵌的 PGlite。

```bash
pnpm install
pnpm --filter @codeshop/domain build      # 服务端和前端依赖领域包的构建产物

cd apps/server
cp .env.example .env                      # 默认 AUTH_MODE=dev，可用请求头模拟登录
pnpm build && pnpm db:seed                # 建表并写入演示数据，打印演示二维码链接
pnpm dev                                  # http://localhost:3000/api
```

其他端（另开终端）：

```bash
pnpm dev:merchant                         # 商家后台 http://localhost:5173
pnpm dev:platform                         # 平台后台 http://localhost:5174
pnpm --filter @codeshop/client-mp dev:h5  # 客户端 H5 预览 http://localhost:10086
pnpm --filter @codeshop/client-mp dev:weapp  # 生成 apps/client-mp/dist，用微信开发者工具打开
```

微信开发者工具调试小程序时，在 `apps/client-mp/.env.development` 里把 `TARO_APP_API_BASE` 改为 `http://localhost:3000`，并在工具里勾选「不校验合法域名」。

## 用接口走一遍主流程

演示数据：商家「都市衣橱」有静安店（导购林晓负责女装区、周洋负责男装区）和徐家汇店；商家「木居家」有浦东店。

```bash
API=http://localhost:3000/api
H='content-type: application/json'

# 1. 顾客扫静安店风衣的商品码：进入店内模式，自动分配女装区导购林晓（弱绑定）
curl -s -X POST $API/scan -H "$H" -H 'x-dev-customer-id: cu_alice' -d '{"token":"PTrenchJingan"}'

# 2. 导购周洋出示动态码，顾客扫码：改为强绑定周洋，并领到 9 折导购券
TOKEN=$(curl -s $API/guide/me/code -H 'x-dev-guide-id: gd_zhou' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -X POST $API/scan -H "$H" -H 'x-dev-customer-id: cu_alice' -d "{\"token\":\"$TOKEN\"}"

# 3. 顾客回家后下单：试算显示优惠和归属（归周洋、静安店）
COUPON=$(curl -s "$API/me/coupons" -H 'x-dev-customer-id: cu_alice' | node -pe 'JSON.parse(require("fs").readFileSync(0)).items[0].id')
curl -s -X POST $API/orders/quote -H "$H" -H 'x-dev-customer-id: cu_alice' \
  -d "{\"merchantId\":\"m_urban\",\"lines\":[{\"skuId\":\"sk_trench_khaki_l\",\"quantity\":1}],\"couponId\":\"$COUPON\"}"
```

完整的场景（导购开单、实体导购卡定位校验、防作弊、多商家隔离、并发领券）见 `apps/server/test/`。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm test` | 运行全部测试（领域单测 + 服务端端到端测试） |
| `pnpm typecheck` | 全部包的类型检查 |
| `pnpm build` | 先构建领域包，再构建所有应用 |
| `pnpm --filter @codeshop/server db:generate` | 修改 `schema.ts` 后生成数据库迁移 |

## 目录结构

```
packages/domain      领域规则（纯 TypeScript，无框架依赖，前后端共用）
apps/server          服务端：公共服务层 + 四个端的接口
apps/client-mp       客户端小程序
apps/guide-mp        导购端小程序
apps/merchant-web    商家端后台
apps/platform-web    平台运营端后台
docs/                架构说明、规则与代码对照
```

## 文档

- [架构说明](docs/architecture.md)：分层、数据模型、并发与多商家隔离、安全、尚未接入的部分
- [规则与代码对照](docs/rules.md)：PRD 第 4 节每条规则在哪里实现、哪个测试覆盖，以及待拍板的默认值
