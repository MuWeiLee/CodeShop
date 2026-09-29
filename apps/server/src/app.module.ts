import { Module, type DynamicModule } from '@nestjs/common';
import { Clock, SystemClock } from './common/clock';
import { APP_CONFIG, loadConfig, type AppConfig } from './config/app-config';
import { DatabaseModule } from './db/database.module';
import { AttributionService } from './modules/attribution/attribution.service';
import { CatalogService } from './modules/catalog/catalog.service';
import { CodesService } from './modules/codes/codes.service';
import { CouponsService } from './modules/coupons/coupons.service';
import { CustomerController } from './modules/customer/customer.controller';
import { GuideController } from './modules/guide/guide.controller';
import { HealthController } from './modules/health.controller';
import { MerchantController } from './modules/merchant/merchant.controller';
import { OrdersService } from './modules/orders/orders.service';
import { MerchantRulesService } from './modules/rules/merchant-rules.service';
import { ScanService } from './modules/scan/scan.service';

@Module({})
export class AppModule {
  /** 测试可以传入自己的配置和时钟。 */
  static register(opts: { config?: AppConfig; clock?: Clock } = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule],
      controllers: [HealthController, CustomerController, GuideController, MerchantController],
      providers: [
        { provide: APP_CONFIG, useValue: opts.config ?? loadConfig() },
        { provide: Clock, useValue: opts.clock ?? new SystemClock() },
        MerchantRulesService,
        AttributionService,
        CatalogService,
        CodesService,
        CouponsService,
        ScanService,
        OrdersService,
      ],
      exports: [APP_CONFIG, Clock],
      global: true,
    };
  }
}
