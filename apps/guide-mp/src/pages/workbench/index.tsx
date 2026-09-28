import { Text, View } from '@tarojs/components';

/** 与 PRD 第 6 节「导购端」对应的功能清单，状态随开发进度更新。 */
const MODULES: Array<{ name: string; detail: string; phase: string; status: '已接入' | '待开发' }> = [
  { name: '我的码', detail: '动态导购码，每 60 秒刷新', phase: '一期', status: '已接入' },
  { name: '扫码开单', detail: '扫商品码查库存、选规格、生成订单码（服务端接口已就绪）', phase: '一期', status: '待开发' },
  { name: '我的顾客', detail: '绑定顾客、授权共享的清单、看过没买的商品', phase: '一期', status: '待开发' },
  { name: '维护客户', detail: '备注、标签、尺码偏好、跟进计划', phase: '一期', status: '待开发' },
  { name: '服务记录', detail: '按顾客查看全部服务记录，补录线下沟通', phase: '一期', status: '待开发' },
  { name: '线索池', detail: '认领自扫码但未绑定的顾客', phase: '一期', status: '待开发' },
  { name: '业绩与佣金', detail: '归属订单、冻结与可结算佣金，离店后下单单独统计', phase: '一期', status: '待开发' },
  { name: '签到', detail: '上下班签到，签到后参与自动分配', phase: '一期', status: '待开发' },
  { name: '待办', detail: '响应呼叫、帮我拿、预约接待、调货到店', phase: '二期', status: '待开发' },
];

export default function Workbench() {
  return (
    <View className='page'>
      <View className='card'>
        <Text className='title'>工作台</Text>
        {MODULES.map((m) => (
          <View key={m.name} className='row'>
            <View>
              <Text>{m.name}</Text>
              <Text className='muted' style={{ display: 'block' }}>
                {m.detail}
              </Text>
            </View>
            <Text className={`tag ${m.status === '已接入' ? 'tag-accent' : ''}`}>
              {m.phase} · {m.status}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
