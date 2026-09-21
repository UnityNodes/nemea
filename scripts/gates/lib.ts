export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;
export const EXIT_NOT_RUN = 2;

export type Check = { name: string; status: "pass" | "fail" | "not-run"; detail: string };

export function requireEnv(gate: string, names: string[]): Record<string, string> {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) {
    console.error(`${gate}: NOT RUN — missing env: ${missing.join(", ")}`);
    console.error(`${gate}: a gate that checked nothing is not a pass.`);
    process.exit(EXIT_NOT_RUN);
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n] as string]));
}

export async function timedJson(url: string, init: RequestInit = {}, timeoutMs = 15000) {
  const started = performance.now();
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const ms = Math.round(performance.now() - started);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ms, headers: res.headers, body };
}

export function report(gate: string, checks: Check[]): never {
  console.log(`\n${gate} summary`);
  for (const c of checks) {
    const tag = c.status === "pass" ? "PASS" : c.status === "fail" ? "FAIL" : "----";
    console.log(`  [${tag}] ${c.name} — ${c.detail}`);
  }
  const failed = checks.some((c) => c.status === "fail");
  const ranAny = checks.some((c) => c.status === "pass");
  if (failed) process.exit(EXIT_FAIL);
  if (!ranAny) process.exit(EXIT_NOT_RUN);
  process.exit(EXIT_PASS);
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
