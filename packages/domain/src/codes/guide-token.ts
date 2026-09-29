import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 导购动态码：导购端每个时间窗口（默认 60 秒）刷新一次，截图转发很快失效。
 * 不入库，靠 HMAC 签名校验。仅在服务端使用（依赖 node:crypto）。
 *
 * 格式：G.<guideId>.<窗口编号，36 进制>.<签名>
 */

export interface GuideTokenOptions {
  /** 签名密钥，至少 32 个字符，从环境变量读取，不得写进代码仓库。 */
  secret: string;
  /** 刷新周期（秒），默认 60。 */
  periodSeconds?: number;
  /** 除当前窗口外，再接受前几个窗口的码，用于容忍扫码和网络延迟，默认 1。 */
  acceptPreviousWindows?: number;
}

export type GuideTokenVerification =
  | { ok: true; guideId: string; window: number }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'not_yet_valid' };

const GUIDE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const WINDOW_RE = /^[0-9a-z]{1,12}$/;
const SIGNATURE_LENGTH = 22; // base64url 下约 132 位

function resolveOptions(opts: GuideTokenOptions) {
  if (typeof opts.secret !== 'string' || opts.secret.length < 32) {
    throw new Error('导购动态码密钥至少需要 32 个字符');
  }
  const periodSeconds = opts.periodSeconds ?? 60;
  const acceptPreviousWindows = opts.acceptPreviousWindows ?? 1;
  if (!Number.isInteger(periodSeconds) || periodSeconds < 10) {
    throw new RangeError('刷新周期至少 10 秒');
  }
  if (!Number.isInteger(acceptPreviousWindows) || acceptPreviousWindows < 0) {
    throw new RangeError('acceptPreviousWindows 须为非负整数');
  }
  return { secret: opts.secret, periodSeconds, acceptPreviousWindows };
}

function windowOf(now: Date, periodSeconds: number): number {
  return Math.floor(now.getTime() / 1000 / periodSeconds);
}

function signature(secret: string, guideId: string, window: number): string {
  return createHmac('sha256', secret)
    .update(`guide:${guideId}:${window}`)
    .digest('base64url')
    .slice(0, SIGNATURE_LENGTH);
}

export function signGuideToken(
  guideId: string,
  now: Date,
  opts: GuideTokenOptions,
): { token: string; refreshAt: Date } {
  const { secret, periodSeconds } = resolveOptions(opts);
  if (!GUIDE_ID_RE.test(guideId)) throw new Error(`非法的导购 ID：${guideId}`);
  const window = windowOf(now, periodSeconds);
  const token = `G.${guideId}.${window.toString(36)}.${signature(secret, guideId, window)}`;
  return { token, refreshAt: new Date((window + 1) * periodSeconds * 1000) };
}

export function verifyGuideToken(
  token: string,
  now: Date,
  opts: GuideTokenOptions,
): GuideTokenVerification {
  const { secret, periodSeconds, acceptPreviousWindows } = resolveOptions(opts);
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };
  const [prefix, guideId = '', windowText = '', sig = ''] = parts;
  if (prefix !== 'G' || !GUIDE_ID_RE.test(guideId) || !WINDOW_RE.test(windowText)) {
    return { ok: false, reason: 'malformed' };
  }
  const window = parseInt(windowText, 36);
  if (!Number.isSafeInteger(window)) return { ok: false, reason: 'malformed' };

  const expected = Buffer.from(signature(secret, guideId, window));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  const current = windowOf(now, periodSeconds);
  if (window > current) return { ok: false, reason: 'not_yet_valid' };
  if (current - window > acceptPreviousWindows) return { ok: false, reason: 'expired' };
  return { ok: true, guideId, window };
}
