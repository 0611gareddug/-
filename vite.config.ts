import { defineConfig } from "vite";

// v1.9: 서버 없이 정적 파일만 (GitHub Pages). 게임 서버는 브라우저 Web Worker(server/worker.ts)
export default defineConfig({
  root: "client",
  // 상대 경로: GitHub Pages(/저장소이름/ 아래)에서도 열리게
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true },
  worker: { format: "es" },
  server: { port: 5173, host: true },
});
