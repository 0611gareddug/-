import http from "node:http";
const kv = new Map<string, string>();
kv.set("yangbaechu-store", JSON.stringify({ saves: [], clears: ["이전기록"], records: {}, codex: {}, profiles: {} }));
let auth = "";
const srv = http.createServer((req, res) => {
  auth = req.headers.authorization ?? "";
  const [, cmd, key] = (req.url ?? "").split("/");
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (cmd === "get") res.end(JSON.stringify({ result: kv.get(key) ?? null }));
    else if (cmd === "set") { kv.set(key, body); res.end(JSON.stringify({ result: "OK" })); }
  });
});
await new Promise<void>((r) => srv.listen(39123, r));
process.env.UPSTASH_REDIS_REST_URL = "http://localhost:39123";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
process.env.STORE_FILE = `${process.env.TEMP}/cloudtest-store.json`;
const st = await import("../server/store");
await st.initStore();
console.log("불러온 클리어 명단:", JSON.stringify((st as any).canHardcore("이전기록")));
st.addClears(["새기록"]);
await st.flushStore();
const saved = JSON.parse(kv.get("yangbaechu-store")!);
console.log("클라우드에 저장된 명단:", saved.clears, "· 인증 헤더:", auth === "Bearer test-token");
srv.close();
process.exit(0);
