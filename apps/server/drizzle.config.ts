import { defineConfig } from 'drizzle-kit';

// 只用来根据 schema.ts 生成迁移 SQL（pnpm db:generate），不连接数据库。
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
