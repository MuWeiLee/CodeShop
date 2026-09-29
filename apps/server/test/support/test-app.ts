import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { Clock } from '../../src/common/clock';
import type { AppConfig } from '../../src/config/app-config';
import { DB, type Db } from '../../src/db/database';
import { seedDemo } from '../../src/db/seed';

export const START = new Date('2026-10-01T02:00:00.000Z'); // 北京时间 10:00

export class FakeClock extends Clock {
  private current: Date;

  constructor(start: Date) {
    super();
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  advanceDays(days: number): void {
    this.advance(days * 86_400_000);
  }
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    database: { kind: 'pglite', dataDir: null },
    autoMigrate: true,
    guideCodeSecret: 'test-guide-code-secret-at-least-32-chars',
    qrBaseUrl: 'https://m.codeshop.test',
    authMode: 'dev',
    orderCodeTtlMinutes: 30,
    ...overrides,
  };
}

export interface TestApp {
  app: INestApplication;
  clock: FakeClock;
  db: Db;
  customer(id: string): Actor;
  guide(id: string): Actor;
  merchant(id: string): Actor;
  anonymous(): request.Agent;
  close(): Promise<void>;
}

interface Actor {
  get(url: string): request.Test;
  post(url: string, body?: object): request.Test;
  put(url: string, body?: object): request.Test;
}

/** 启动完整应用：内存 PGlite + 迁移 + 演示数据 + 可控时钟。 */
export async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const clock = new FakeClock(START);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ config: testConfig(overrides), clock })],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  await app.init();
  const db = moduleRef.get<Db>(DB);
  await seedDemo(db);

  const server = app.getHttpServer();
  const actor = (header: string, id: string): Actor => ({
    get: (url) => request(server).get(url).set(header, id),
    post: (url, body) => request(server).post(url).set(header, id).send(body),
    put: (url, body) => request(server).put(url).set(header, id).send(body),
  });

  return {
    app,
    clock,
    db,
    customer: (id) => actor('x-dev-customer-id', id),
    guide: (id) => actor('x-dev-guide-id', id),
    merchant: (id) => actor('x-dev-merchant-id', id),
    anonymous: () => request.agent(server),
    close: () => app.close(),
  };
}
