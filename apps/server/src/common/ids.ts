import { randomUUID } from 'node:crypto';

/** 生成带类型前缀的 ID，例如 sr_3f2a9c1e5b7d4e8a9c217d4e5f6a8b90。前缀便于排查日志。 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}
