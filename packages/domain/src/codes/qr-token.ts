/**
 * 二维码内容格式。
 *
 * 二维码里只放一个短 token，不放价格、姓名等信息；价格和库存在扫码后实时查询，
 * 改价不用重印，码泄露也不会暴露个人信息。
 *
 *   商品码   P<codeId>          贴在陈列商品上，库里记录 门店 + 款
 *   实体导购卡 C<codeId>        导购工牌上的静态码，扫码时需通过定位校验
 *   订单码   O<codeId>          导购开单后生成，顾客扫码付款
 *   导购动态码 G.<guideId>.<窗口>.<签名>   导购端每 60 秒刷新，不入库，靠签名校验
 *
 * 二维码可以是完整链接 `<baseUrl>/q/<token>`（微信扫一扫可直接打开小程序），
 * 也可以只是 token 本身；parseQrToken 两种都接受。
 */

export type StaticCodeKind = 'product' | 'card' | 'order';

const PREFIX_BY_KIND: Record<StaticCodeKind, string> = { product: 'P', card: 'C', order: 'O' };
const KIND_BY_PREFIX: Record<string, StaticCodeKind> = { P: 'product', C: 'card', O: 'order' };

export const GUIDE_TOKEN_PREFIX = 'G';

/** 去掉易混淆字符（0/O、1/I/l）的字母表。 */
export const CODE_ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const CODE_ID_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{8,32}$/;

export type RandomSource = (bytes: Uint8Array) => Uint8Array;

const defaultRandom: RandomSource = (bytes) => globalThis.crypto.getRandomValues(bytes);

/** 生成随机码 ID。使用拒绝采样，保证每个字符等概率。 */
export function generateCodeId(length = 12, random: RandomSource = defaultRandom): string {
  if (!Number.isInteger(length) || length < 8 || length > 32) {
    throw new RangeError('码 ID 长度须为 8–32');
  }
  const alphabetSize = CODE_ID_ALPHABET.length;
  const limit = 256 - (256 % alphabetSize);
  let result = '';
  while (result.length < length) {
    const buf = random(new Uint8Array(length * 2));
    for (const byte of buf) {
      if (byte < limit) {
        result += CODE_ID_ALPHABET[byte % alphabetSize];
        if (result.length === length) break;
      }
    }
  }
  return result;
}

export function formatStaticToken(kind: StaticCodeKind, codeId: string): string {
  if (!CODE_ID_RE.test(codeId)) throw new Error(`非法的码 ID：${codeId}`);
  return `${PREFIX_BY_KIND[kind]}${codeId}`;
}

export function buildQrUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/q/${token}`;
}

export type ParsedQrToken =
  | { kind: StaticCodeKind; codeId: string }
  | { kind: 'guide'; token: string };

/** 解析二维码内容。不认识的内容返回 null，调用方应提示「不是本平台的二维码」。 */
export function parseQrToken(raw: string): ParsedQrToken | null {
  if (typeof raw !== 'string') return null;
  let token = raw.trim();
  if (token.length === 0 || token.length > 512) return null;

  const marker = token.lastIndexOf('/q/');
  if (marker >= 0) {
    token = token.slice(marker + 3).split(/[?#]/)[0] ?? '';
  }

  if (token.startsWith(`${GUIDE_TOKEN_PREFIX}.`)) {
    // 只做形态判断，签名和时效由服务端的 verifyGuideToken 校验
    return token.split('.').length === 4 ? { kind: 'guide', token } : null;
  }

  const kind = KIND_BY_PREFIX[token.charAt(0)];
  const codeId = token.slice(1);
  if (!kind || !CODE_ID_RE.test(codeId)) return null;
  return { kind, codeId };
}
