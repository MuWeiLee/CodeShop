import qrcode from 'qrcode-generator';

/**
 * 把文本编码成二维码图片（base64 GIF），不依赖 DOM 和 canvas，小程序和 H5 都能直接给 <Image> 用。
 * 纠错等级 M：导购码会被手机屏幕反光、摩尔纹干扰，M 比 L 更稳。
 */
export function qrDataUrl(text: string, cellSize = 8): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(cellSize, cellSize * 2);
}
