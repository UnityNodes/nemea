import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const FORBIDDEN = /privateKey|private_key|mnemonic|seedPhrase|seed_phrase|secretKey|signTransaction|sendTransaction|writeContract|eth_sendTransaction|eth_sign\b|personal_sign|eth_signTypedData/i;
export const ALLOWED_FILES = new Set(["apps/bot/src/safety.ts"]);
export const ALLOWED_TOKENS = /VAPID_PRIVATE_KEY|looksLikeSeedPhrase|seedPhraseWarning/g;
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "test", "tests", "drizzle", ".pglite", "scripts"]);
const EXTENSIONS = /\.(ts|tsx|mjs|js)$/;

export type Finding = { file: string; line: number; text: string };
export type ScanResult = { filesScanned: number; findings: Finding[] };

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTENSIONS.test(name)) out.push(full);
  }
}

export function scan(root: string, roots: readonly string[], allowed: ReadonlySet<string> = ALLOWED_FILES): ScanResult {
  const files: string[] = [];
  for (const r of roots) {
    const base = join(root, r);
    for (const pkg of readdirSync(base)) {
      const src = join(base, pkg);
      if (statSync(src).isDirectory()) walk(src, files);
    }
  }
  const findings: Finding[] = [];
  for (const file of files) {
    const rel = relative(root, file);
    if (allowed.has(rel)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, i) => {
        if (FORBIDDEN.test(text.replace(ALLOWED_TOKENS, ""))) findings.push({ file: rel, line: i + 1, text: text.trim().slice(0, 120) });
      });
  }
  return { filesScanned: files.length, findings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const result = scan(root, ["apps", "packages"]);
  if (result.filesScanned === 0) {
    console.error("check:claims scanned 0 files — a check that looked at nothing is not a pass");
    process.exit(2);
  }
  if (result.findings.length > 0) {
    console.error(`check:claims FAILED: ${result.findings.length} key-handling identifier(s) in ${result.filesScanned} files`);
    for (const f of result.findings) console.error(`  ${f.file}:${f.line}  ${f.text}`);
    process.exit(1);
  }
  console.log(`check:claims ok: no key-handling identifiers in ${result.filesScanned} source files (allowlisted: ${[...ALLOWED_FILES].join(", ")})`);
}
