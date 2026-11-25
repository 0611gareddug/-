// v1.9 내 브라우저에 저장된 기록 (서버가 없으므로 기록은 각자 브라우저에)
// 방장일 땐 게임 워커가 이 저장소를 그대로 쓰고, 참가자일 땐 방장이 보내 준 내 몫(sync)을 여기에 합침
import { exportStore, getRecords, loadStore, mergeSlice, sliceFor, type Slice } from "../server/store";
import type { Leaderboards, SliceWire } from "../shared/protocol";

export const STORE_KEY = "ybcy-store";

export function readStoreRaw(): string | null {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}

export function writeStoreRaw(json: string) {
  try { localStorage.setItem(STORE_KEY, json); } catch { /* 저장 공간이 없으면 이번 판만 */ }
}

/** 참가할 때 방장에게 가져갈 내 몫 */
export function mySlice(name: string): SliceWire {
  loadStore(readStoreRaw());
  return sliceFor(name) as SliceWire;
}

/** 방장이 보낸 내 몫을 내 저장소에 합침 */
export function mergeMine(name: string, slice: SliceWire) {
  loadStore(readStoreRaw());
  mergeSlice(name, slice as Slice);
  writeStoreRaw(JSON.stringify(exportStore()));
}

/** 내 기록 (순위표) */
export function myRecords(): Leaderboards {
  loadStore(readStoreRaw());
  return getRecords();
}

/** 기록 내보내기 / 불러오기 (파일) */
export function exportFile() {
  const blob = new Blob([readStoreRaw() ?? "{}"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `양배추용사단-기록-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importFile(file: File): Promise<boolean> {
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== "object" || !("profiles" in obj || "records" in obj || "saves" in obj)) return false;
    loadStore(obj);
    writeStoreRaw(JSON.stringify(exportStore()));
    return true;
  } catch {
    return false;
  }
}
