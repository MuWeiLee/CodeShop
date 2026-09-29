import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config/app-config';

async function bootstrap() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // 没有 .env 时使用进程环境变量
  }
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.register({ config }));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`[server] http://localhost:${config.port}/api （数据库：${config.database.kind}，登录：${config.authMode}）`);
}

void bootstrap();
