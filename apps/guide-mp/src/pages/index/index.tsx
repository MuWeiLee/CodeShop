import { Button, Image, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import { useRef, useState } from 'react';
import { api, errorMessage } from '../../api';
import { qrDataUrl } from '../../qr';

interface GuideCode {
  token: string;
  qrUrl: string;
  refreshAt: string;
}

/**
 * 我的码：导购动态码（PRD 3.3、4.2）。
 * 服务端每 60 秒换一次签名，这里在 refreshAt 自动刷新，截图转发很快失效。
 */
export default function MyCode() {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const refresh = async () => {
    stop();
    try {
      const code = await api<GuideCode>('GET', '/guide/me/code');
      setImage(qrDataUrl(code.qrUrl));
      setError(null);
      const wait = Math.max(5_000, new Date(code.refreshAt).getTime() - Date.now() + 500);
      timer.current = setTimeout(() => void refresh(), wait);
    } catch (err) {
      setError(errorMessage(err));
      timer.current = setTimeout(() => void refresh(), 10_000);
    }
  };

  useDidShow(() => {
    void Taro.setKeepScreenOn({ keepScreenOn: true }).catch(() => undefined);
    void refresh();
  });
  useDidHide(stop);

  return (
    <View className='page'>
      <View className='card' style={{ textAlign: 'center' }}>
        <Text className='title'>请顾客扫码</Text>
        <Text className='muted'>扫码后顾客与你绑定，并领取导购券。每分钟自动刷新。</Text>
        {image && <Image src={image} style={{ width: '480px', height: '480px', marginTop: '24px' }} />}
        {error && <Text className='error'>{error}</Text>}
      </View>
      <Button onClick={() => Taro.navigateTo({ url: '/pages/workbench/index' })}>工作台</Button>
    </View>
  );
}
