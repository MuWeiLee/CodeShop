/**
 * 金额统一用「分」为单位的整数，避免浮点误差。
 * 所有进入领域函数的金额都应先经过 assertCents 校验。
 */
export type Cents = number;

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function assertCents(value: number, label = 'amount'): asserts value is Cents {
  if (!isCents(value)) {
    throw new RangeError(`${label} 必须是非负整数（单位：分），实际为 ${value}`);
  }
}

/** 分转元字符串，例如 12345 → "123.45"。仅用于展示。 */
export function formatYuan(cents: Cents): string {
  assertCents(cents);
  const yuan = Math.floor(cents / 100);
  const fen = cents % 100;
  return `${yuan}.${fen.toString().padStart(2, '0')}`;
}
