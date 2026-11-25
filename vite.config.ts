import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  // 상대 경로: Render(주소 맨 앞)와 GitHub Pages(/저장소이름/ 아래) 둘 다에서 열리게
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    port: 5173,
    host: true,
    // GAME_PORT 로 다른 포트의 게임 서버에 붙일 수 있음 (기본 2567)
    proxy: { "/ws": { target: `ws://localhost:${process.env.GAME_PORT ?? 2567}`, ws: true } },
  },
});
