import { randomBytes } from 'node:crypto';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

export type DatabaseConfig =
  | { kind: 'postgres'; url: string }
  /** dataDir 为空表示纯内存，进程退出后数据消失（测试用） */
  | { kind: 'pglite'; dataDir: string | null };

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  database: DatabaseConfig;
  autoMigrate: boolean;
  guideCodeSecret: string;
  qrBaseUrl: string;
  authMode: 'dev' | 'none';
  orderCodeTtlMinutes: number;
}

const PLACEHOLDER_QR_BASE_URL = 'https://example.com';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url().optional(),
  PGLITE_DATA_DIR: z.string().optional(),
  DB_AUTO_MIGRATE: z.enum(['true', 'false']).default('true'),
  GUIDE_CODE_SECRET: z.string().min(32, 'GUIDE_CODE_SECRET 至少 32 个字符').optional(),
  QR_BASE_URL: z.string().url().default(PLACEHOLDER_QR_BASE_URL),
  AUTH_MODE: z.enum(['dev', 'none']).default('none'),
  ORDER_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(30),
});

/**
 * 读取并校验环境变量。生产环境缺少关键配置时直接拒绝启动，而不是带着不安全的默认值运行。
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // .env 里写了「KEY=」但没填值时，按未配置处理
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`环境变量配置有误：${issues}`);
  }
  const e = result.data;
  const production = e.NODE_ENV === 'production';

  if (production) {
    const problems: string[] = [];
    if (e.AUTH_MODE === 'dev') problems.push('生产环境禁止使用 AUTH_MODE=dev');
    if (!e.GUIDE_CODE_SECRET) problems.push('生产环境必须配置 GUIDE_CODE_SECRET');
    if (!e.DATABASE_URL) problems.push('生产环境必须配置 DATABASE_URL（PGlite 仅用于开发和测试）');
    if (e.QR_BASE_URL === PLACEHOLDER_QR_BASE_URL) problems.push('生产环境必须配置真实的 QR_BASE_URL');
    if (problems.length > 0) throw new Error(problems.join('；'));
  }

  let guideCodeSecret = e.GUIDE_CODE_SECRET;
  if (!guideCodeSecret) {
    guideCodeSecret = randomBytes(32).toString('base64url');
    if (e.NODE_ENV === 'development') {
      console.warn('[config] 未配置 GUIDE_CODE_SECRET，已临时生成；服务重启后已发出的导购动态码会失效。');
    }
  }

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    database: e.DATABASE_URL
      ? { kind: 'postgres', url: e.DATABASE_URL }
      : { kind: 'pglite', dataDir: e.PGLITE_DATA_DIR ?? null },
    autoMigrate: e.DB_AUTO_MIGRATE === 'true',
    guideCodeSecret,
    qrBaseUrl: e.QR_BASE_URL,
    authMode: e.AUTH_MODE,
    orderCodeTtlMinutes: e.ORDER_CODE_TTL_MINUTES,
  };
}
