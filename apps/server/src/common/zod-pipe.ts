import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';
import { BusinessError } from './errors';

/** 用 zod 校验请求体：@Body(new ZodPipe(schema)) */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BusinessError('invalid_request', '请求参数不合法', result.error.flatten(), HttpStatus.BAD_REQUEST);
    }
    return result.data;
  }
}
