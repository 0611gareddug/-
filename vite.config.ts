import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    port: 5173,
    host: true,
    // GAME_PORT 로 다른 포트의 게임 서버에 붙일 수 있음 (기본 2567)
    proxy: { "/ws": { target: `ws://localhost:${process.env.GAME_PORT ?? 2567}`, ws: true } },
  },
});
