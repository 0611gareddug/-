// 친구들과 노는 서버(2567)를 켜 둔 채로 테스트: 게임 서버 2577 + 화면 5174, 기록은 data/store-test.json
import { spawn } from "node:child_process";

const env = { ...process.env, PORT: "2577", GAME_PORT: "2577", STORE_FILE: process.env.STORE_FILE ?? "data/store-test.json" };
const run = (cmd: string) => spawn(cmd, { stdio: "inherit", shell: true, env });
const procs = [run("npx tsx server/index.ts"), run("npx vite --port 5174 --strictPort")];
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
