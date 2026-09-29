/// <reference types="@tarojs/taro" />

declare module '*.png';
declare module '*.gif';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.css';

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production';
    TARO_ENV: 'weapp' | 'swan' | 'alipay' | 'h5' | 'rn' | 'tt' | 'qq' | 'jd' | 'harmony' | 'jdrn';
    TARO_APP_ID: string;
    /** 服务端地址，H5 预览时为空 */
    TARO_APP_API_BASE?: string;
    /** 开发用登录身份，接入正式登录后删除 */
    TARO_APP_DEV_CUSTOMER_ID?: string;
    TARO_APP_DEV_GUIDE_ID?: string;
  }
}
