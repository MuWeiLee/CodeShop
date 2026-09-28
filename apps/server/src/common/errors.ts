import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/**
 * 业务规则拒绝（例如定位校验失败、券已过期）。默认 422，前端按 code 展示对应提示。
 */
export class BusinessError extends HttpException {
  constructor(code: string, message: string, details?: unknown, status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY) {
    const body: ErrorBody = { error: { code, message, ...(details === undefined ? {} : { details }) } };
    super(body, status);
  }
}

export class NotFoundError extends BusinessError {
  constructor(what: string, code = 'not_found') {
    super(code, `${what}不存在或已失效`, undefined, HttpStatus.NOT_FOUND);
  }
}
