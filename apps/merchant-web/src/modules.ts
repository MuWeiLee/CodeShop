/**
 * 菜单与 PRD 第 7 节「商家端」一一对应。status 标注开发进度：
 * ready = 已接入服务端；todo = 页面待开发。
 */
export interface ModuleDef {
  key: string;
  label: string;
  features: string;
  roles: string;
  phase: '一期' | '二期' | '三期';
  status: 'ready' | 'todo';
}

export const MODULES: ModuleDef[] = [
  { key: 'codes', label: '商品码', features: '按门店批量生成商品码，打印吊牌、价签、台卡', roles: '总部、店长', phase: '一期', status: 'ready' },
  { key: 'rules', label: '规则配置', features: '归属规则、导购券规则、佣金方案', roles: '总部', phase: '一期', status: 'ready' },
  { key: 'shop', label: '店铺设置', features: '品牌信息、资质、收款账户、发货方式', roles: '总部', phase: '一期', status: 'todo' },
  { key: 'products', label: '商品', features: '录入商品（款、规格、价格、图片、详情），批量导入，上下架', roles: '总部', phase: '一期', status: 'todo' },
  { key: 'display', label: '门店陈列', features: '每家店陈列的款和样衣规格，决定「店内可试」标注', roles: '总部、店长', phase: '一期', status: 'todo' },
  { key: 'org', label: '组织', features: '门店、区域、导购账号、陈列区责任划分', roles: '总部、区域', phase: '一期', status: 'todo' },
  { key: 'customers', label: '客户', features: '客户列表与详情、服务记录、标签、客户转移', roles: '按角色数据范围', phase: '一期', status: 'todo' },
  { key: 'orders', label: '订单', features: '订单查看与导出、发货、归属查看与留痕调整', roles: '总部、店长', phase: '一期', status: 'todo' },
  { key: 'aftersale', label: '售后', features: '退换货审核、到店退换商品去向', roles: '总部、店长', phase: '一期', status: 'todo' },
  { key: 'dashboard', label: '数据看板', features: '门店与导购业绩、扫码率、绑定率、离店后下单占比、退货率', roles: '按角色数据范围', phase: '一期', status: 'todo' },
  { key: 'settlement', label: '结算对账', features: '平台抽佣对账、导购佣金结算单导出', roles: '总部', phase: '一期', status: 'todo' },
  { key: 'schedule', label: '排班', features: '导购排班，与签到记录对照', roles: '店长', phase: '二期', status: 'todo' },
  { key: 'inventory', label: '库存与调拨', features: '商家仓库存、门店样衣库存、预约试穿调拨单', roles: '总部', phase: '二期', status: 'todo' },
  { key: 'appointments', label: '预约试穿', features: '试衣间数量、可约时段、爽约规则', roles: '店长', phase: '二期', status: 'todo' },
  { key: 'outfits', label: '搭配', features: '创建搭配、审核导购提交的搭配', roles: '总部、店长', phase: '二期', status: 'todo' },
  { key: 'assets3d', label: '3D 素材', features: '上传 3D 模型并关联到款', roles: '总部', phase: '三期', status: 'todo' },
];
