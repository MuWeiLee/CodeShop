import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { DB, DB_HANDLE, openDatabase, type DatabaseHandle } from './database';

@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(DB_HANDLE) private readonly handle: DatabaseHandle) {}

  async onModuleDestroy(): Promise<void> {
    await this.handle.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLE,
      inject: [APP_CONFIG],
      useFactory: async (config: AppConfig): Promise<DatabaseHandle> => {
        const handle = await openDatabase(config.database);
        if (config.autoMigrate) await handle.migrate();
        return handle;
      },
    },
    {
      provide: DB,
      inject: [DB_HANDLE],
      useFactory: (handle: DatabaseHandle) => handle.db,
    },
    DatabaseLifecycle,
  ],
  exports: [DB, DB_HANDLE],
})
export class DatabaseModule {}
