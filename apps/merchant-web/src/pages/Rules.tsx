import { describeDiscount, type AttributionRules, type GuideCouponRules } from '@codeshop/domain';
import { Alert, Button, Card, Form, InputNumber, message, Radio, Space, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface Rules {
  attribution: AttributionRules;
  guideCoupon: GuideCouponRules;
}

/** 表单里用「元」，提交时换算成「分」。 */
interface FormValues {
  strongBindingDays: number;
  weakBindingDays: number;
  storeWindowDays: number;
  lockStrongBinding: boolean;
  couponEnabled: boolean;
  discountKind: 'percent' | 'threshold';
  percentOff?: number;
  thresholdYuan?: number;
  offYuan?: number;
  validDays: number;
  cooldownDays: number;
  stackWithPlatform: boolean;
  cardGeofenceMeters: number;
}

function toForm(r: Rules): FormValues {
  const d = r.guideCoupon.discount;
  return {
    ...r.attribution,
    couponEnabled: r.guideCoupon.enabled,
    discountKind: d.kind,
    percentOff: d.kind === 'percent' ? d.percentOff : 10,
    thresholdYuan: d.kind === 'threshold' ? d.thresholdCents / 100 : undefined,
    offYuan: d.kind === 'threshold' ? d.offCents / 100 : undefined,
    validDays: r.guideCoupon.validDays,
    cooldownDays: r.guideCoupon.cooldownDays,
    stackWithPlatform: r.guideCoupon.stackWithPlatform,
    cardGeofenceMeters: r.guideCoupon.cardGeofenceMeters,
  };
}

function toPayload(v: FormValues) {
  const discount =
    v.discountKind === 'percent'
      ? { kind: 'percent' as const, percentOff: v.percentOff ?? 0, maxOffCents: null }
      : {
          kind: 'threshold' as const,
          thresholdCents: Math.round((v.thresholdYuan ?? 0) * 100),
          offCents: Math.round((v.offYuan ?? 0) * 100),
        };
  return {
    attribution: {
      strongBindingDays: v.strongBindingDays,
      weakBindingDays: v.weakBindingDays,
      storeWindowDays: v.storeWindowDays,
      lockStrongBinding: v.lockStrongBinding,
    },
    guideCoupon: {
      enabled: v.couponEnabled,
      discount,
      validDays: v.validDays,
      cooldownDays: v.cooldownDays,
      stackWithPlatform: v.stackWithPlatform,
      cardGeofenceMeters: v.cardGeofenceMeters,
    },
  };
}

/** 规则配置（PRD 4.1、4.2）。数值范围由服务端用领域规则统一校验。 */
export default function RulesPage() {
  const [form] = Form.useForm<FormValues>();
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const discountKind = Form.useWatch('discountKind', form);
  const values = Form.useWatch([], form);

  useEffect(() => {
    api<Rules>('GET', '/merchant/settings').then((r) => form.setFieldsValue(toForm(r)));
  }, [form]);

  const save = async (v: FormValues) => {
    setSaving(true);
    setErrors([]);
    try {
      const saved = await api<Rules>('PUT', '/merchant/settings', toPayload(v));
      form.setFieldsValue(toForm(saved));
      message.success('已保存');
    } catch (e) {
      const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as string[]) : [];
      setErrors(details.length ? details : [(e as Error).message]);
    } finally {
      setSaving(false);
    }
  };

  let preview = '';
  if (values) {
    try {
      preview = describeDiscount(toPayload(values).guideCoupon.discount);
    } catch {
      preview = '';
    }
  }

  return (
    <Form form={form} layout='vertical' onFinish={save} style={{ maxWidth: 720 }}>
      <Space direction='vertical' size='large' style={{ width: '100%' }}>
        {errors.length > 0 && <Alert type='error' message='规则不合法' description={errors.join('；')} />}

        <Card title='归属规则'>
          <Space size='large' wrap>
            <Form.Item name='strongBindingDays' label='强绑定有效期（天）'>
              <InputNumber min={1} max={365} />
            </Form.Item>
            <Form.Item name='weakBindingDays' label='弱绑定有效期（天）'>
              <InputNumber min={1} max={365} />
            </Form.Item>
            <Form.Item name='storeWindowDays' label='门店归因窗口（天）'>
              <InputNumber min={1} max={365} />
            </Form.Item>
          </Space>
          <Form.Item
            name='lockStrongBinding'
            label='强绑定有效期内不允许其他导购覆盖'
            valuePropName='checked'
            extra='关闭时以后扫码的导购为准'
          >
            <Switch />
          </Form.Item>
        </Card>

        <Card title='导购券' extra={preview && <Typography.Text type='secondary'>当前力度：{preview}</Typography.Text>}>
          <Form.Item name='couponEnabled' label='启用导购券' valuePropName='checked'>
            <Switch />
          </Form.Item>
          <Form.Item name='discountKind' label='折扣方式'>
            <Radio.Group
              options={[
                { value: 'percent', label: '按比例减' },
                { value: 'threshold', label: '满减' },
              ]}
            />
          </Form.Item>
          {discountKind === 'threshold' ? (
            <Space size='large'>
              <Form.Item name='thresholdYuan' label='满（元）'>
                <InputNumber min={0} precision={2} />
              </Form.Item>
              <Form.Item name='offYuan' label='减（元）'>
                <InputNumber min={0} precision={2} />
              </Form.Item>
            </Space>
          ) : (
            <Form.Item name='percentOff' label='减百分之几' extra='10 即九折'>
              <InputNumber min={1} max={99} />
            </Form.Item>
          )}
          <Space size='large' wrap>
            <Form.Item name='validDays' label='有效期（天）'>
              <InputNumber min={1} max={365} />
            </Form.Item>
            <Form.Item name='cooldownDays' label='每位顾客领取间隔（天）'>
              <InputNumber min={0} max={365} />
            </Form.Item>
            <Form.Item name='cardGeofenceMeters' label='实体导购卡校验半径（米）'>
              <InputNumber min={20} max={5000} />
            </Form.Item>
          </Space>
          <Form.Item name='stackWithPlatform' label='可与平台活动叠加' valuePropName='checked'>
            <Switch />
          </Form.Item>
        </Card>

        <Button type='primary' htmlType='submit' loading={saving}>
          保存
        </Button>
      </Space>
    </Form>
  );
}
