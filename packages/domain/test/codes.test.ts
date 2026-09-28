import { describe, expect, it } from 'vitest';
import {
  buildQrUrl,
  CODE_ID_ALPHABET,
  distanceMeters,
  formatStaticToken,
  generateCodeId,
  parseQrToken,
  verifyCardScan,
} from '../src/index.js';
import { signGuideToken, verifyGuideToken } from '../src/server.js';
import { T0 } from './helpers.js';

describe('generateCodeId', () => {
  it('长度正确，只包含去掉易混淆字符后的字母表', () => {
    for (let i = 0; i < 200; i++) {
      const id = generateCodeId();
      expect(id).toHaveLength(12);
      for (const ch of id) expect(CODE_ID_ALPHABET).toContain(ch);
    }
  });

  it('不会生成重复 ID（抽样）', () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => generateCodeId()));
    expect(ids.size).toBe(5_000);
  });

  it('长度越界时报错', () => {
    expect(() => generateCodeId(4)).toThrow(RangeError);
  });
});

describe('二维码 token 解析', () => {
  it('静态码可以格式化后原样解析', () => {
    const codeId = generateCodeId();
    expect(parseQrToken(formatStaticToken('product', codeId))).toEqual({ kind: 'product', codeId });
    expect(parseQrToken(formatStaticToken('card', codeId))).toEqual({ kind: 'card', codeId });
    expect(parseQrToken(formatStaticToken('order', codeId))).toEqual({ kind: 'order', codeId });
  });

  it('接受完整链接，忽略查询参数', () => {
    const codeId = generateCodeId();
    const url = `${buildQrUrl('https://m.example.com/', `P${codeId}`)}?from=wx#top`;
    expect(url).toBe(`https://m.example.com/q/P${codeId}?from=wx#top`);
    expect(parseQrToken(url)).toEqual({ kind: 'product', codeId });
  });

  it('导购动态码只做形态判断', () => {
    expect(parseQrToken('G.g-1.abc.sig')).toEqual({ kind: 'guide', token: 'G.g-1.abc.sig' });
    expect(parseQrToken('G.g-1.abc')).toBeNull();
  });

  it('不认识的内容返回 null', () => {
    for (const raw of ['', 'hello', 'X23456789ab', 'P0000', 'P23456789ab!', 'https://evil.com/other']) {
      expect(parseQrToken(raw)).toBeNull();
    }
  });
});

describe('导购动态码', () => {
  const opts = { secret: 'test-secret-that-is-at-least-32-chars!!' };

  it('当前窗口内有效，并返回下次刷新时间', () => {
    const { token, refreshAt } = signGuideToken('g-1', T0, opts);
    expect(verifyGuideToken(token, T0, opts)).toMatchObject({ ok: true, guideId: 'g-1' });
    expect(refreshAt.getTime()).toBeGreaterThan(T0.getTime());
    expect(refreshAt.getTime() - T0.getTime()).toBeLessThanOrEqual(60_000);
  });

  it('默认多容忍一个窗口，再往前就过期', () => {
    const { token, refreshAt } = signGuideToken('g-1', T0, opts);
    expect(verifyGuideToken(token, new Date(refreshAt.getTime() + 30_000), opts).ok).toBe(true);
    expect(verifyGuideToken(token, new Date(refreshAt.getTime() + 60_000), opts)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('未来窗口的码无效', () => {
    const { token } = signGuideToken('g-1', new Date(T0.getTime() + 120_000), opts);
    expect(verifyGuideToken(token, T0, opts)).toEqual({ ok: false, reason: 'not_yet_valid' });
  });

  it('篡改导购 ID 或签名、换密钥都无法通过', () => {
    const { token } = signGuideToken('g-1', T0, opts);
    const [, , window, sig] = token.split('.');
    expect(verifyGuideToken(`G.g-2.${window}.${sig}`, T0, opts)).toEqual({ ok: false, reason: 'bad_signature' });
    const flipped = sig!.slice(0, -1) + (sig!.endsWith('A') ? 'B' : 'A');
    expect(verifyGuideToken(`G.g-1.${window}.${flipped}`, T0, opts).ok).toBe(false);
    expect(verifyGuideToken(token, T0, { secret: 'another-secret-that-is-32-chars-long!!' }).ok).toBe(false);
  });

  it('格式错误的码', () => {
    for (const bad of ['', 'G.g-1', 'X.g-1.1.sig', 'G.g 1.1.sig', 'G.g-1.ZZ.sig']) {
      expect(verifyGuideToken(bad, T0, opts)).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('密钥太短时拒绝工作', () => {
    expect(() => signGuideToken('g-1', T0, { secret: 'short' })).toThrow();
  });
});

describe('实体导购卡定位校验', () => {
  // 上海静安寺附近
  const store = { lat: 31.2235, lng: 121.4453 };
  const near = { lat: 31.2244, lng: 121.4453 }; // 北约 100 米
  const far = { lat: 31.2280, lng: 121.4453 }; // 北约 500 米

  it('距离计算大致正确', () => {
    expect(distanceMeters(store, near)).toBeGreaterThan(95);
    expect(distanceMeters(store, near)).toBeLessThan(105);
  });

  it('半径内通过', () => {
    expect(verifyCardScan({ customerLocation: near, storeLocation: store, radiusMeters: 200 })).toEqual({
      ok: true,
      distanceMeters: 100,
    });
  });

  it('超出半径、没有定位、定位太粗、门店没坐标都不通过', () => {
    expect(verifyCardScan({ customerLocation: far, storeLocation: store, radiusMeters: 200 })).toMatchObject({
      ok: false,
      reason: 'out_of_range',
    });
    expect(verifyCardScan({ customerLocation: null, storeLocation: store, radiusMeters: 200 })).toMatchObject({
      ok: false,
      reason: 'location_required',
    });
    expect(
      verifyCardScan({ customerLocation: near, accuracyMeters: 1_500, storeLocation: store, radiusMeters: 200 }),
    ).toMatchObject({ ok: false, reason: 'location_inaccurate' });
    expect(verifyCardScan({ customerLocation: near, storeLocation: null, radiusMeters: 200 })).toMatchObject({
      ok: false,
      reason: 'store_location_missing',
    });
  });
});
