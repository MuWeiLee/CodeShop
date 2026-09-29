export const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/** `later` 是否在 `earlier` 之后的 `days` 天以内（含边界）。 */
export function isWithinDays(earlier: Date, later: Date, days: number): boolean {
  const diff = later.getTime() - earlier.getTime();
  return diff >= 0 && diff <= days * DAY_MS;
}
