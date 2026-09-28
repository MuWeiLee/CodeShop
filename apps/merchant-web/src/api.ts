const DEV_MERCHANT_KEY = 'codeshop.devMerchantId';

export const DEMO_MERCHANTS = [
  { id: 'm_urban', name: '都市衣橱' },
  { id: 'm_home', name: '木居家' },
];

export function devMerchantId(): string {
  try {
    return localStorage.getItem(DEV_MERCHANT_KEY) || DEMO_MERCHANTS[0]!.id;
  } catch {
    return DEMO_MERCHANTS[0]!.id;
  }
}

export function setDevMerchantId(id: string): void {
  try {
    localStorage.setItem(DEV_MERCHANT_KEY, id);
  } catch {
    // 隐私模式下无法保存，只影响刷新后的默认值
  }
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/**
 * 请求服务端。
 * TODO(登录)：接入商家账号登录后改为携带 Authorization 头，删除开发用的 x-dev-merchant-id。
 */
export async function api<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dev-merchant-id': devMerchantId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(err?.code ?? 'http_error', err?.message ?? `请求失败（${res.status}）`, err?.details);
  }
  return data as T;
}
