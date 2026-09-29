import Taro from '@tarojs/taro';

const BASE = process.env.TARO_APP_API_BASE || '';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * 请求服务端。
 * TODO(登录)：接入 wx.login 换取 token 后，改为携带 Authorization 头，删除开发用的 x-dev-customer-id。
 */
export async function api<T>(method: 'GET' | 'POST', path: string, data?: object): Promise<T> {
  const header: Record<string, string> = { 'content-type': 'application/json' };
  const devCustomerId = process.env.TARO_APP_DEV_CUSTOMER_ID;
  if (devCustomerId) header['x-dev-customer-id'] = devCustomerId;

  const res = await Taro.request({ url: `${BASE}/api${path}`, method, data, header });
  if (res.statusCode >= 200 && res.statusCode < 300) return res.data as T;
  const err = (res.data as { error?: { code?: string; message?: string } } | undefined)?.error;
  throw new ApiError(err?.code ?? 'http_error', err?.message ?? `请求失败（${res.statusCode}）`, res.statusCode);
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : '网络异常，请稍后重试';
}
