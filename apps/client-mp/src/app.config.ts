export default defineAppConfig({
  pages: ['pages/index/index', 'pages/checkout/index', 'pages/me/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'CodeShop',
    navigationBarTextStyle: 'black',
  },
  // 扫实体导购卡时需要定位（PRD 10.3：只在扫卡那一刻获取一次）
  permission: {
    'scope.userLocation': { desc: '用于确认你在门店内，领取导购优惠' },
  },
  requiredPrivateInfos: ['getLocation'],
});
