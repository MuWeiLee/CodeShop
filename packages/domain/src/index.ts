// 前后端通用的领域规则。依赖 node:crypto 的部分在 '@codeshop/domain/server'。

export * from './time.js';
export * from './money.js';
export * from './geo.js';
export * from './rules.js';

export * from './codes/qr-token.js';
export * from './codes/card-scan.js';

export * from './attribution/types.js';
export * from './attribution/binding.js';
export * from './attribution/auto-assign.js';
export * from './attribution/order-attribution.js';

export * from './coupons/types.js';
export * from './coupons/issue.js';
export * from './coupons/apply.js';
