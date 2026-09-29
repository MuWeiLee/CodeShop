import { Text, View } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { formatYuan } from '@codeshop/domain';
import { useState } from 'react';
import { api } from '../../api';
import type { CouponView } from '../../types';

interface BindingItem {
  merchantId: string;
  merchantName: string;
  guideName: string;
  strength: 'strong' | 'weak';
  expiresAt: string;
}

interface OrderItem {
  id: string;
  totalCents: number;
  status: string;
  createdAt: string;
  lines: Array<{ name: string; quantity: number }>;
}

const STATUS_TEXT: Record<string, string> = { pending_payment: '待支付', paid: '已支付', cancelled: '已取消' };

/** 我的：各商家的专属导购、导购券、订单。 */
export default function Me() {
  const [bindings, setBindings] = useState<BindingItem[]>([]);
  const [coupons, setCoupons] = useState<CouponView[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);

  useDidShow(() => {
    void api<{ items: BindingItem[] }>('GET', '/me/bindings').then((r) => setBindings(r.items));
    void api<{ items: CouponView[] }>('GET', '/me/coupons').then((r) => setCoupons(r.items));
    void api<{ items: OrderItem[] }>('GET', '/me/orders').then((r) => setOrders(r.items));
  });

  return (
    <View className='page'>
      <View className='card'>
        <Text className='title'>我的导购</Text>
        {bindings.length === 0 && <Text className='muted'>到店扫导购码，就有专属导购为你服务。</Text>}
        {bindings.map((b) => (
          <View key={b.merchantId} className='row'>
            <Text>
              {b.merchantName} · {b.guideName}
            </Text>
            <Text className='muted'>{b.expiresAt.slice(0, 10)} 前有效</Text>
          </View>
        ))}
      </View>

      <View className='card'>
        <Text className='title'>导购券</Text>
        {coupons.length === 0 && <Text className='muted'>暂无可用的券</Text>}
        {coupons.map((c) => (
          <View key={c.id} className='row'>
            <Text>{c.description}</Text>
            <Text className='muted'>{c.expiresAt.slice(0, 10)} 到期</Text>
          </View>
        ))}
      </View>

      <View className='card'>
        <Text className='title'>订单</Text>
        {orders.length === 0 && <Text className='muted'>还没有订单</Text>}
        {orders.map((o) => (
          <View key={o.id} className='row'>
            <Text>
              {o.lines.map((l) => `${l.name}×${l.quantity}`).join('、')}
            </Text>
            <Text>
              ¥{formatYuan(o.totalCents)} <Text className='tag'>{STATUS_TEXT[o.status] ?? o.status}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
