import { Card, Descriptions, Layout, Menu, Result, Tag, Typography } from 'antd';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MODULES, type ModuleDef } from './modules';

function Placeholder({ module: m }: { module: ModuleDef }) {
  return (
    <Card title={m.label}>
      <Result status='info' title='页面待开发' subTitle='功能范围见 PRD 第 8 节「平台运营端」' />
      <Descriptions column={1} bordered size='small'>
        <Descriptions.Item label='功能点'>{m.features}</Descriptions.Item>
        <Descriptions.Item label='期数'>
          <Tag>{m.phase}</Tag>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const current = location.pathname.split('/')[1] || MODULES[0]!.key;

  const menuItems = (['一期', '二期'] as const).map((phase) => ({
    type: 'group' as const,
    key: phase,
    label: phase,
    children: MODULES.filter((m) => m.phase === phase).map((m) => ({ key: m.key, label: m.label })),
  }));

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider width={220} theme='light' style={{ borderRight: '1px solid #f0f0f0' }}>
        <Typography.Title level={5} style={{ padding: '16px 24px', margin: 0 }}>
          CodeShop 平台运营
        </Typography.Title>
        <Menu mode='inline' selectedKeys={[current]} items={menuItems} onClick={(e) => navigate(`/${e.key}`)} />
      </Layout.Sider>
      <Layout.Content style={{ padding: 24 }}>
        <Routes>
          <Route path='/' element={<Navigate to={`/${MODULES[0]!.key}`} replace />} />
          {MODULES.map((m) => (
            <Route key={m.key} path={`/${m.key}`} element={<Placeholder module={m} />} />
          ))}
        </Routes>
      </Layout.Content>
    </Layout>
  );
}
