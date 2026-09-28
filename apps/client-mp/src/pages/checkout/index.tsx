import { Button, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { formatYuan } from '@codeshop/domain';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api';
import type { CouponView, Quote } from '../../types';

/**
 * 确认订单：按商家下单，价格和优惠以服务端试算为准。
 * TODO(支付)：创建订单后调用微信支付（服务商分账），当前订单停在待支付。
 */
export default function Checkout() {
  const { params } = useRouter<{ merchantId: string; skuId?: string; draftId?: string }>();
  const [coupons, setCoupons] = useState<CouponView[]>([]);
  const [couponId, setCouponId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const body = () => ({
    merchantId: params.merchantId,
    lines: params.skuId ? [{ skuId: params.skuId, quantity: 1 }] : [],
    draftId: params.draftId ?? null,
    couponId,
  });

  useEffect(() => {
    api<{ items: CouponView[] }>('GET', `/me/coupons?merchantId=${params.merchantId}`)
      .then((res) => {
        setCoupons(res.items);
        setCouponId(res.items[0]?.id ?? null);
      })
      .catch(() => setCoupons([]));
  }, [params.merchantId]);

  useEffect(() => {
    setError(null);
    api<Quote>('POST', '/orders/quote', body())
      .then(setQuote)
      .catch((err) => {
        setQuote(null);
        setError(errorMessage(err));
      });
  }, [couponId]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api('POST', '/orders', body());
      await Taro.showToast({ title: '下单成功', icon: 'success' });
      await Taro.redirectTo({ url: '/pages/me/index' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className='page'>
      {error && <Text className='error'>{error}</Text>}
      {quote && (
        <View className='card'>
          <Text className='title'>确认订单</Text>
          {quote.lines.map((l) => (
            <View key={l.skuId} className='row'>
              <Text>
                {l.name} {l.color}/{l.size} × {l.quantity}
              </Text>
              <Text>¥{formatYuan(l.unitPriceCents * l.quantity)}</Text>
            </View>
          ))}
          <View className='row'>
            <Text>商品金额</Text>
            <Text>¥{formatYuan(quote.subtotalCents)}</Text>
          </View>
          <View className='row'>
            <Text>导购券</Text>
            <Text>-¥{formatYuan(quote.discountCents)}</Text>
          </View>
          <View className='row'>
            <Text className='title'>实付</Text>
            <Text className='title'>¥{formatYuan(quote.totalCents)}</Text>
          </View>
          <Text className='muted'>送货到家，门店只放样品，不用拎包。</Text>
        </View>
      )}

      {coupons.length > 0 && (
        <View className='card'>
          <Text className='title'>可用导购券</Text>
          {coupons.map((c) => (
            <View
              key={c.id}
              className={`row ${couponId === c.id ? 'selected' : ''}`}
              onClick={() => setCouponId(couponId === c.id ? null : c.id)}
            >
              <Text>{c.description}</Text>
              <Text className='muted'>{couponId === c.id ? '已选' : `${c.expiresAt.slice(0, 10)} 到期`}</Text>
            </View>
          ))}
        </View>
      )}

      <Button className='primary' loading={submitting} disabled={!quote} onClick={submit}>
        提交订单
      </Button>
    </View>
  );
}
