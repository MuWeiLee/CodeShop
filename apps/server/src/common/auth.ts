import {
  createParamDecorator,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { DB, type Db } from '../db/database';
import { customers } from '../db/schema';
import { BusinessError } from './errors';

/**
 * 登录（骨架版）。
 *
 * 正式登录（小程序 wx.login 换 openid、导购与商家账号密码 / 企业微信登录，签发 JWT）尚未接入。
 * 在此之前：
 * - AUTH_MODE=dev：用请求头 x-dev-customer-id / x-dev-guide-id / x-dev-merchant-id 模拟登录，仅限本地开发；
 * - AUTH_MODE=none（默认）：所有需要登录的接口都返回 401。
 * 生产环境配置 AUTH_MODE=dev 时服务拒绝启动（见 loadConfig）。
 *
 * 接入正式登录时只需替换 AuthGuard 里取身份的部分，控制器用的 @ActorId() 不变。
 */
export type Role = 'customer' | 'guide' | 'merchant';

const ROLE_KEY = 'codeshop:role';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const RequireRole = (role: Role) => SetMetadata(ROLE_KEY, role);

interface AuthedRequest extends Request {
  actor?: { role: Role; id: string };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const role = this.reflector.getAllAndOverride<Role | undefined>(ROLE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!role) return true;

    const unauthenticated = (message: string) =>
      new BusinessError('unauthenticated', message, undefined, HttpStatus.UNAUTHORIZED);

    if (this.config.authMode !== 'dev') throw unauthenticated('尚未接入正式登录');

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const id = req.header(`x-dev-${role}-id`);
    if (!id || !ID_RE.test(id)) throw unauthenticated(`缺少请求头 x-dev-${role}-id`);

    // 模拟「首次登录即建号」：正式登录时由 wx.login 流程创建顾客账号
    if (role === 'customer') {
      await this.db.insert(customers).values({ id }).onConflictDoNothing();
    }

    req.actor = { role, id };
    return true;
  }
}

/** 当前登录者的 ID（顾客 / 导购 / 商家，取决于接口要求的角色）。 */
export const ActorId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.actor) throw new Error('ActorId 只能用在带 @RequireRole 的接口上');
  return req.actor.id;
});
