import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { formatYuan, parseQrToken } from '@codeshop/domain';
import { useState } from 'react';
import { api, errorMessage } from '../../api';
import type { ScanResult } from '../../types';

export default function Index() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState('');
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  const handle = async (raw: string) => {
    const parsed = parseQrToken(raw);
    if (!parsed) {
      setError('不是本平台的二维码');
      return;
    }
    setLoading(true);
    setError(null);
    setSelectedSku(null);
    try {
      let location: { lat: number; lng: number; accuracy: number } | undefined;
      if (parsed.kind === 'card') {
        // 实体导购卡要确认在门店内，只在这一刻取一次位置
        const loc = await Taro.getLocation({ type: 'gcj02', isHighAccuracy: true });
        location = { lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy };
      }
      setResult(await api<ScanResult>('POST', '/scan', { token: raw, location }));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // 通过「扫普通链接二维码打开小程序」进入时，二维码链接在 q 参数里
  useLoad((options: Record<string, string | undefined>) => {
    if (options.q) void handle(decodeURIComponent(options.q));
  });

  const scan = async () => {
    try {
      const res = await Taro.scanCode({ scanType: ['qrCode'] });
      await handle(res.result);
    } catch {
      // 用户取消扫码
    }
  };

  return (
    <View className='page'>
      <View className='card'>
        <Text className='title'>扫码购物</Text>
        <Text className='muted'>扫商品吊牌、导购码或订单码。线下看好，线上下单，送货到家。</Text>
        <Button className='primary' loading={loading} onClick={scan}>
          扫一扫
        </Button>
        {process.env.NODE_ENV === 'development' && (
          <View style={{ marginTop: '24px' }}>
            <Text className='muted'>开发调试：粘贴二维码内容</Text>
            <Input
              value={manual}
              onInput={(e) => setManual(e.detail.value)}
              placeholder='例如 PTrenchJingan'
              style={{ border: '1px solid #e7e5e4', borderRadius: '8px', padding: '12px', marginTop: '8px' }}
            />
            <Button size='mini' onClick={() => handle(manual)} style={{ marginTop: '12px' }}>
              识别
            </Button>
          </View>
        )}
      </View>

      {error && <Text className='error'>{error}</Text>}

      {result?.kind === 'product' && (
        <View className='card'>
          <Text className='muted'>
            {result.merchant.name} · {result.store.name}
          </Text>
          <Text className='title'>{result.product.name}</Text>
          {result.product.skus.map((sku) => (
            <View
              key={sku.skuId}
              className={`row ${selectedSku === sku.skuId ? 'selected' : ''}`}
              onClick={() => setSelectedSku(sku.skuId)}
            >
              <Text>
                {sku.color} / {sku.size}
                <Text className={`tag ${sku.tryInStore ? 'tag-accent' : ''}`}>{sku.tryInStore ? '店内可试' : '仅线上'}</Text>
              </Text>
              <Text>¥{formatYuan(sku.priceCents)}</Text>
            </View>
          ))}
          {result.binding && (
            <Text className='muted'>
              服务导购：{result.binding.guide.name}
              {result.binding.strength === 'weak' ? '（系统分配）' : ''}
            </Text>
          )}
          {result.couponHint && <Text className='hint'>{result.couponHint}</Text>}
          <Button
            className='primary'
            disabled={!selectedSku}
            onClick={() =>
              Taro.navigateTo({ url: `/pages/checkout/index?merchantId=${result.merchant.id}&skuId=${selectedSku}` })
            }
          >
            {selectedSku ? '下单，送货到家' : '先选择颜色尺码'}
          </Button>
        </View>
      )}

      {result?.kind === 'guide' && (
        <View className='card'>
          <Text className='muted'>
            {result.merchant.name} · {result.store.name}
          </Text>
          <Text className='title'>导购 {result.guide.name}</Text>
          {result.coupon ? (
            <Text className='hint'>
              已领取导购券：{result.coupon.description}，{result.coupon.expiresAt.slice(0, 10)} 前有效
            </Text>
          ) : (
            <Text className='muted'>{couponBlockedText(result.couponBlocked?.reason)}</Text>
          )}
        </View>
      )}

      {result?.kind === 'order' && (
        <View className='card'>
          <Text className='muted'>
            导购 {result.guide.name} 为你开的单 · {result.store.name}
          </Text>
          {result.draft.lines.map((l) => (
            <View key={l.skuId} className='row'>
              <Text>
                {l.name} {l.color}/{l.size} × {l.quantity}
              </Text>
              <Text>¥{formatYuan(l.unitPriceCents * l.quantity)}</Text>
            </View>
          ))}
          <Button
            className='primary'
            onClick={() =>
              Taro.navigateTo({ url: `/pages/checkout/index?merchantId=${result.merchant.id}&draftId=${result.draft.id}` })
            }
          >
            确认并付款（¥{formatYuan(result.draft.subtotalCents)}）
          </Button>
        </View>
      )}

      <Button onClick={() => Taro.navigateTo({ url: '/pages/me/index' })}>我的导购、券和订单</Button>
    </View>
  );
}

function couponBlockedText(reason?: string): string {
  switch (reason) {
    case 'cooldown':
      return '已绑定导购。你最近领过这家的导购券，7 天内限领 1 张。';
    case 'binding_not_changed':
      return '你已有专属导购，本次未更换。';
    case 'self_scan':
      return '不能领取自己的导购券。';
    case 'disabled':
      return '已绑定导购。商家暂未开放导购券。';
    default:
      return '已绑定导购。';
  }
}
