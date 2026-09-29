# 规则与代码对照

PRD 第 4 节每条规则在哪里实现、由哪个测试覆盖。改规则时先改测试，再改 `packages/domain`。

## 归属规则（PRD 4.1）

| 规则 | 实现 | 测试 |
| --- | --- | --- |
| 强绑定来源：扫导购码、扫实体导购卡、导购开单、预约接待 | `bindingStrengthOf` | `packages/domain/test/binding.test.ts` |
| 弱绑定来源：自动分配、响应呼叫、认领线索 | `bindingStrengthOf` | 同上 |
| 强覆盖弱；强覆盖强以后扫为准；弱覆盖弱以最近到店为准；弱不能覆盖强 | `nextBinding` | 「覆盖规则」一组 |
| 商家可开启「强绑定有效期内不可覆盖」 | `nextBinding` + `lockStrongBinding` | 同上；`apps/server/test/merchant.test.ts` |
| 同一导购再次接触只续期，弱遇强升级为强 | `nextBinding` | 「同一导购续期与升级」一组 |
| 有新的服务记录时重新计时（回到绑定门店扫商品码、导购跟进） | `nextBinding` | 同上 |
| 店长转移：保留强度，新导购接手并重新计时 | `nextBinding`（`TRANSFER`） | 「转移与异常」一组 |
| 导购不能绑定自己 | `nextBinding`（`self_binding`） | 同上；`security.test.ts` |
| 下单判定：有效绑定 → 导购；窗口内到店 → 门店池；否则自然订单 | `attributeOrder` | `order-attribution.test.ts`；`customer-journey.test.ts` |
| 按人归属：绑定期内的所有订单都算绑定导购 | `attributeOrder` | 同上 |
| 导购开单的订单直接归开单导购 | `attributeStaffOrder` | 同上；`staff-order.test.ts` |
| 绑定导购离职未转移 → 门店池 | `attributeOrder`（`boundGuideActive`） | `order-attribution.test.ts` |
| 自动分配顺序：响应呼叫者 → 陈列区当班导购（绑定最少者） → 线索池 | `pickAutoAssignee`、`needsAutoAssign` | `order-attribution.test.ts`；`customer-journey.test.ts` |
| 「到店接触」包括哪些服务记录 | `IN_STORE_RECORD_TYPES` | `customer-journey.test.ts` |

## 导购券规则（PRD 4.2）

| 规则 | 实现 | 测试 |
| --- | --- | --- |
| 扫导购码后自动发券，券面显示导购 | `issueGuideCoupon`；`ScanService.scanGuide` | `coupons.test.ts`；`customer-journey.test.ts` |
| 绑定没有落到这位导购身上时不发券 | `ScanService.scanGuide` | `merchant.test.ts`（锁定场景） |
| 每位顾客在每个商家每 7 天限领 1 张 | `checkGuideCouponEligibility` | `coupons.test.ts`；`security.test.ts`（并发） |
| 按比例减（向下取整到分，可封顶）或满减 | `applyCoupon` | `coupons.test.ts` |
| 适用范围、与平台活动叠加 | `applyCoupon` | 同上 |
| 优惠按比例分摊到每行，合计严格相等 | `allocateDiscount` | 同上（含 500 组随机样本） |
| 动态码 60 秒刷新，多容忍一个窗口 | `signGuideToken` / `verifyGuideToken` | `codes.test.ts`；`customer-journey.test.ts` |
| 实体卡定位校验，失败不绑定、不发券 | `verifyCardScan`；`ScanService.scanGuide` | `codes.test.ts`；`customer-journey.test.ts` |

## 防作弊（PRD 4.4）

| 规则 | 实现 | 测试 |
| --- | --- | --- |
| 导购不能扫自己的码领券 | `checkGuideCouponEligibility`（`self_scan`） | `security.test.ts` |
| 自动分配不会把导购分给自己 | `ScanService.zoneCandidates` | 同上 |
| 员工本人下单、与导购同手机号下单不计佣金 | `attributeOrder` / `attributeStaffOrder` + `AttributionService.buyerRisk` | `order-attribution.test.ts`；`security.test.ts` |
| 所有绑定变化留有服务记录 | `AttributionService.recordTouch`（`meta.bindingChange`） | — |

## 待拍板的默认值

以下取自 PRD 第 12 节，代码中已按推荐方案实现，改动时只需调整默认值或商家配置：

| 事项 | 当前实现 | 位置 |
| --- | --- | --- |
| 归属按人还是按商品 | 按人 | `attributeOrder` |
| 强绑定有效期内能否被覆盖 | 默认允许，商家可锁定 | `DEFAULT_ATTRIBUTION_RULES.lockStrongBinding` |
| 导购券能否店外分享 | 未实现（二期） | — |
| 券和佣金成本由谁承担 | 未涉及，结算模块再定 | — |
| 导购券默认力度 | 9 折 | `DEFAULT_GUIDE_COUPON_RULES.discount` |
