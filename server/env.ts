/** 테스트용 환경변수 (Node에선 process.env, 브라우저에선 빈 값) */
declare const process: { env: Record<string, string | undefined> } | undefined;
export const ENV: Record<string, string | undefined> = typeof process !== "undefined" && process?.env ? process.env : {};
