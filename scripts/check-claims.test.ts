import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scan } from "./check-claims.ts";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "claims-"));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

describe("claims scanner", () => {
  it("screams on a private key identifier", () => {
    const root = project({ "apps/x/src/a.ts": "const privateKey = process.env.PK;\n" });
    const r = scan(root, ["apps"]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ file: "apps/x/src/a.ts", line: 1 });
  });

  it.each(["sendTransaction", "writeContract", "mnemonic", "eth_sendTransaction", "personal_sign", "seedPhrase"])("screams on %s", (word) => {
    const root = project({ "packages/p/src/a.ts": `export const x = () => ${word};\n` });
    expect(scan(root, ["packages"]).findings).toHaveLength(1);
  });

  it("stays quiet on clean code and reports how many files it looked at", () => {
    const root = project({ "apps/x/src/a.ts": "export const signMessage = 1;\n", "apps/x/src/b.tsx": "export const y = 2;\n" });
    const r = scan(root, ["apps"]);
    expect(r.findings).toEqual([]);
    expect(r.filesScanned).toBe(2);
  });

  it("tolerates only the named server-side identifiers, not a user key next to them", () => {
    const root = project({ "apps/x/src/a.ts": "const a = config.VAPID_PRIVATE_KEY;\nconst b = looksLikeSeedPhrase(t);\n" });
    expect(scan(root, ["apps"]).findings).toEqual([]);
    const bad = project({ "apps/x/src/a.ts": "const a = config.VAPID_PRIVATE_KEY + privateKey;\n" });
    expect(scan(bad, ["apps"]).findings).toHaveLength(1);
  });

  it("does not look inside tests or node_modules", () => {
    const root = project({ "apps/x/src/a.ts": "export const ok = 1;\n", "apps/x/test/a.test.ts": "const privateKey = 1;\n", "apps/x/node_modules/m/i.ts": "const privateKey = 1;\n" });
    const r = scan(root, ["apps"]);
    expect(r.findings).toEqual([]);
    expect(r.filesScanned).toBe(1);
  });

  it("honours the allowlist only for the named file", () => {
    const root = project({ "apps/bot/src/safety.ts": "const seedPhrase = 1;\n", "apps/bot/src/other.ts": "const seedPhrase = 1;\n" });
    const r = scan(root, ["apps"], new Set(["apps/bot/src/safety.ts"]));
    expect(r.findings.map((f) => f.file)).toEqual(["apps/bot/src/other.ts"]);
  });
});
