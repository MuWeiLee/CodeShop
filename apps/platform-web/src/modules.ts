/** 菜单与 PRD 第 8 节「平台运营端」一一对应。服务端接口尚未开发，页面均为占位。 */
export interface ModuleDef {
  key: string;
  label: string;
  features: string;
  phase: '一期' | '二期';
}

export const MODULES: ModuleDef[] = [
  { key: 'merchants', label: '商家管理', features: '入驻申请与资质审核；签约与抽佣比例设置；冻结、清退', phase: '一期' },
  { key: 'products', label: '商品管理', features: '类目与品牌库；商品审核、违规下架', phase: '一期' },
  { key: 'service-records', label: '服务记录管理', features: '跨商家查询服务记录，可按顾客、导购、门店追溯', phase: '一期' },
  { key: 'customers', label: '顾客管理', features: '顾客账号查询（脱敏）；封禁；授权记录', phase: '一期' },
  { key: 'settlement', label: '结算与分账', features: '分账规则；商家结算单；抽佣对账', phase: '一期' },
  { key: 'risk', label: '风控', features: '刷单、自扫自买、异常退货、异常绑定的识别规则与复核队列', phase: '一期' },
  { key: 'system', label: '系统配置', features: '消息模板；用户协议与隐私政策版本；全局参数', phase: '一期' },
  { key: 'compliance', label: '合规与审计', features: '处理个人信息删除和导出请求；后台操作审计日志', phase: '一期' },
  { key: 'dashboard', label: '平台数据', features: '商家、门店、成交额、扫码与转化总览', phase: '一期' },
  { key: 'disputes', label: '归属争议', features: '商家或导购发起申诉，平台查看服务记录后裁定', phase: '二期' },
  { key: 'moderation', label: '内容审核', features: '商品图文、搭配、3D 素材审核', phase: '二期' },
  { key: 'marketing', label: '平台营销', features: '平台级活动与券，及其与导购券的叠加规则', phase: '二期' },
];
