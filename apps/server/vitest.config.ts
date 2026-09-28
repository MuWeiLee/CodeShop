import swc from 'unplugin-swc';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // NestJS 依赖装饰器元数据做依赖注入，esbuild 不生成，这里改用 SWC 编译
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    alias: {
      // 测试直接用领域包源码，改了规则不用先 build
      '@codeshop/domain/server': fileURLToPath(new URL('../../packages/domain/src/server.ts', import.meta.url)),
      '@codeshop/domain': fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
