import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import type { DatabaseConfig } from '../config/app-config';
import * as schema from './schema';

export type Schema = typeof schema;
/** node-postgres 与 PGlite 共用的查询接口。业务代码只依赖这个类型。 */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export const DB = Symbol('DB');
export const DB_HANDLE = Symbol('DB_HANDLE');

export interface DatabaseHandle {
  db: Db;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

/** 迁移 SQL 目录：构建后在 dist/drizzle，开发和测试时在 apps/server/drizzle。 */
function migrationsFolder(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    join(__dirname, '..', 'drizzle'),
    join(__dirname, '..', '..', 'drizzle'),
    join(process.cwd(), 'drizzle'),
  ].filter((p): p is string => !!p);
  const found = candidates.find((p) => existsSync(join(p, 'meta', '_journal.json')));
  if (!found) throw new Error(`找不到数据库迁移目录，已查找：${candidates.join(', ')}`);
  return found;
}

export async function openDatabase(config: DatabaseConfig): Promise<DatabaseHandle> {
  if (config.kind === 'postgres') {
    const pool = new Pool({ connectionString: config.url, max: 10 });
    const db = drizzleNodePg({ client: pool, schema });
    return {
      db: db as unknown as Db,
      migrate: () => migrateNodePg(db, { migrationsFolder: migrationsFolder() }),
      close: () => pool.end(),
    };
  }

  const client = config.dataDir ? new PGlite(config.dataDir) : new PGlite();
  await client.waitReady;
  const db = drizzlePglite({ client, schema });
  return {
    db: db as unknown as Db,
    migrate: () => migratePglite(db, { migrationsFolder: migrationsFolder() }),
    close: () => client.close(),
  };
}

/**
 * 事务级互斥锁，按「顾客 × 商家」加锁。
 * 同一顾客在同一商家的扫码、领券、下单串行执行，避免并发时重复发券或绑定结果互相覆盖。
 */
export async function lockCustomerMerchant(tx: Tx, customerId: string, merchantId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${customerId}:${merchantId}`}, 0))`);
}
