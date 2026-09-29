/**
 * 当前时间的唯一来源。业务代码不直接调用 new Date()，测试里可以替换成可控的时钟，
 * 验证「7 天后」「15 天后」这类规则。
 */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
