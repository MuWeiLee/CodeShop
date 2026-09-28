import { buildQrUrl, formatStaticToken } from '@codeshop/domain';
import { loadConfig } from '../config/app-config';
import { openDatabase } from './database';
import { DEMO, seedDemo } from './seed';

/** pnpm db:seed：建表并写入演示数据，打印可直接用于联调的二维码链接。 */
async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // 没有 .env 时使用进程环境变量
  }
  const config = loadConfig();
  if (config.nodeEnv === 'production') throw new Error('生产环境不要写入演示数据');

  const handle = await openDatabase(config.database);
  try {
    await handle.migrate();
    const inserted = await seedDemo(handle.db);
    console.log(inserted ? '已写入演示数据。' : '演示数据已存在，跳过。');
    const qr = (kind: 'product' | 'card', id: string) => buildQrUrl(config.qrBaseUrl, formatStaticToken(kind, id));
    console.log('静安店 · 风衣商品码：', qr('product', DEMO.codes.jinganTrench));
    console.log('静安店 · T 恤商品码：', qr('product', DEMO.codes.jinganTee));
    console.log('林晓 · 实体导购卡：  ', qr('card', DEMO.codes.linCard));
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
