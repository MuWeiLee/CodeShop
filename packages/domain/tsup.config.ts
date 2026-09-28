import { defineConfig } from 'tsup';

export default defineConfig({
  // index：前后端都能用的规则；server：依赖 node:crypto，只在服务端使用
  entry: ['src/index.ts', 'src/server.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
