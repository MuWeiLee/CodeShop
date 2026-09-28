import { Layout, Menu, Select, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DEMO_MERCHANTS, devMerchantId, setDevMerchantId } from './api';
import { MODULES } from './modules';
import Placeholder from './pages/Placeholder';
import ProductCodes from './pages/ProductCodes';
import Rules from './pages/Rules';

const READY_PAGES: Record<string, () => React.JSX.Element> = {
  codes: ProductCodes,
  rules: Rules,
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [merchantId, setMerchantId] = useState(devMerchantId);
  const current = location.pathname.split('/')[1] || 'codes';

  const phases = ['一期', '二期', '三期'] as const;
  const menuItems = phases.map((phase) => ({
    type: 'group' as const,
    key: phase,
    label: phase,
    children: MODULES.filter((m) => m.phase === phase).map((m) => ({
      key: m.key,
      label: (
        <Space>
          {m.label}
          {m.status === 'todo' && <Tag bordered={false}>待开发</Tag>}
        </Space>
      ),
    })),
  }));

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider width={220} theme='light' style={{ borderRight: '1px solid #f0f0f0' }}>
        <Typography.Title level={5} style={{ padding: '16px 24px', margin: 0 }}>
          CodeShop 商家后台
        </Typography.Title>
        <Menu mode='inline' selectedKeys={[current]} items={menuItems} onClick={(e) => navigate(`/${e.key}`)} />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end' }}
        >
          <Space>
            <Typography.Text type='secondary'>开发用登录：</Typography.Text>
            <Select
              value={merchantId}
              style={{ width: 140 }}
              options={DEMO_MERCHANTS.map((m) => ({ value: m.id, label: m.name }))}
              onChange={(id) => {
                setDevMerchantId(id);
                setMerchantId(id);
              }}
            />
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          {/* key 让切换商家时页面重新加载数据 */}
          <Routes key={merchantId}>
            <Route path='/' element={<Navigate to='/codes' replace />} />
            {MODULES.map((m) => {
              const Page = READY_PAGES[m.key];
              return <Route key={m.key} path={`/${m.key}`} element={Page ? <Page /> : <Placeholder module={m} />} />;
            })}
          </Routes>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
