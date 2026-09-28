import { Alert, Button, Card, Form, Input, Select, Space, Table, Typography } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { api } from '../api';

interface Option {
  id: string;
  name: string;
}

interface IssuedCode {
  spuId: string;
  codeId: string;
  token: string;
  qrUrl: string;
}

/** 商品码（PRD 7）：按门店批量生成，已有有效码的款返回原码。 */
export default function ProductCodes() {
  const [stores, setStores] = useState<Option[]>([]);
  const [spus, setSpus] = useState<Option[]>([]);
  const [codes, setCodes] = useState<IssuedCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api<{ items: Option[] }>('GET', '/merchant/stores'), api<{ items: Option[] }>('GET', '/merchant/spus')])
      .then(([s, p]) => {
        setStores(s.items);
        setSpus(p.items);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const spuName = (id: string) => spus.find((s) => s.id === id)?.name ?? id;

  const generate = async (values: { storeId: string; spuIds: string[]; zone?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ items: IssuedCode[] }>('POST', `/merchant/stores/${values.storeId}/product-codes`, {
        spuIds: values.spuIds,
        zone: values.zone || null,
      });
      setCodes(res.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction='vertical' size='large' style={{ width: '100%' }}>
      <Card title='生成商品码'>
        {error && <Alert type='error' message={error} style={{ marginBottom: 16 }} />}
        <Form layout='inline' onFinish={generate}>
          <Form.Item name='storeId' label='门店' rules={[{ required: true, message: '请选择门店' }]}>
            <Select style={{ width: 160 }} options={stores.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name='spuIds' label='商品' rules={[{ required: true, message: '请选择商品' }]}>
            <Select mode='multiple' style={{ width: 320 }} options={spus.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name='zone' label='陈列区' tooltip='用于把自扫码的顾客分配给该区的当班导购'>
            <Input style={{ width: 120 }} placeholder='如 women' />
          </Form.Item>
          <Button type='primary' htmlType='submit' loading={loading}>
            生成
          </Button>
        </Form>
      </Card>

      {codes.length > 0 && (
        <Card title='商品码' extra={<Button onClick={() => window.print()}>打印</Button>}>
          <Table
            rowKey='codeId'
            pagination={false}
            dataSource={codes}
            columns={[
              { title: '二维码', render: (_, c) => <QRCodeSVG value={c.qrUrl} size={96} level='M' /> },
              { title: '商品', render: (_, c) => spuName(c.spuId) },
              { title: '码 ID', dataIndex: 'codeId' },
              { title: '链接', render: (_, c) => <Typography.Text copyable>{c.qrUrl}</Typography.Text> },
            ]}
          />
        </Card>
      )}
    </Space>
  );
}
