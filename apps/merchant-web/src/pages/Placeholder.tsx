import { Card, Descriptions, Result, Tag } from 'antd';
import type { ModuleDef } from '../modules';

/** 尚未开发的模块：展示 PRD 中的功能范围，方便评审时对照。 */
export default function Placeholder({ module: m }: { module: ModuleDef }) {
  return (
    <Card title={m.label}>
      <Result status='info' title='页面待开发' subTitle='功能范围见 PRD 第 7 节「商家端」' />
      <Descriptions column={1} bordered size='small'>
        <Descriptions.Item label='功能点'>{m.features}</Descriptions.Item>
        <Descriptions.Item label='可用角色'>{m.roles}</Descriptions.Item>
        <Descriptions.Item label='期数'>
          <Tag>{m.phase}</Tag>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
