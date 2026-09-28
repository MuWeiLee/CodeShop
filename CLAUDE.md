# CodeShop 开发约定

产品需求见 README 中的 PRD 链接；规则与代码的对照见 `docs/rules.md`。

## 命令

- `pnpm test`：全部测试。改动规则或服务端后必须跑通。
- `pnpm typecheck`：全部包类型检查。
- `pnpm --filter @codeshop/domain build`：服务端和前端依赖领域包的构建产物，改了 `packages/domain` 后先构建。
- `pnpm --filter @codeshop/server db:generate`：修改 `apps/server/src/db/schema.ts` 后生成迁移，迁移文件要一起提交。

## 约定

- 业务规则只写在 `packages/domain`，保持纯函数、无 I/O；服务端负责读写和事务。
- 改规则先改测试。PRD 第 4 节的每条规则都要有对应测试。
- 金额用整数「分」；时间从 `Clock` 取，不直接 `new Date()`，方便测试控制时间。
- 所有业务查询都要按 `merchant_id` 过滤。
- 涉及同一「顾客 × 商家」的写操作，在事务内先调用 `lockCustomerMerchant`。
- 业务拒绝抛 `BusinessError(code, message)`，`code` 用 snake_case，前端按 code 展示提示。
- 坐标一律使用 GCJ-02。
