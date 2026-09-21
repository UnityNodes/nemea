import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OG_PAGES, OG_SIZE, isOgKey, pageMetadata, type OgKey } from "../lib/site.ts";

const APP_DIR = path.join(import.meta.dirname, "..", "app");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "og" ? [] : routeFiles(full);
    return name === "page.tsx" || name === "not-found.tsx" ? [full] : [];
  });
}

describe("link previews", () => {
  it("gives every registered page a 1200x630 image for Open Graph and Twitter", () => {
    for (const key of Object.keys(OG_PAGES) as OgKey[]) {
      const meta = pageMetadata(key);
      const og = meta.openGraph as { images: { url: string; width: number; height: number; alt: string }[] };
      expect(og.images).toHaveLength(1);
      expect(og.images[0]).toMatchObject({ url: `/og/${key}`, width: OG_SIZE.width, height: OG_SIZE.height });
      expect(og.images[0]!.alt.length).toBeGreaterThan(10);
      const twitter = meta.twitter as { card: string; images: { url: string }[] };
      expect(twitter.card).toBe("summary_large_image");
      expect(twitter.images[0]!.url).toBe(`/og/${key}`);
    }
  });

  it("wires every page and the 404 page to a preview, and the root layout supplies the default", () => {
    const files = routeFiles(APP_DIR);
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const isRootPage = file === path.join(APP_DIR, "page.tsx");
      const source = readFileSync(file, "utf8");
      if (isRootPage) continue;
      expect(source, path.relative(APP_DIR, file)).toMatch(/export const metadata = pageMetadata\("[a-z-]+"\)/);
    }
    const layout = readFileSync(path.join(APP_DIR, "layout.tsx"), "utf8");
    expect(layout).toContain('...pageMetadata("home")');
  });

  it("only refers to registered preview keys", () => {
    for (const file of routeFiles(APP_DIR)) {
      const match = /pageMetadata\("([a-z-]+)"\)/.exec(readFileSync(file, "utf8"));
      if (match) expect(isOgKey(match[1]!), match[1]).toBe(true);
    }
    expect(isOgKey("__proto__")).toBe(false);
    expect(isOgKey("constructor")).toBe(false);
  });

  it("keeps the preview text free of dash separators", () => {
    for (const page of Object.values(OG_PAGES)) {
      for (const text of [page.headline, page.accent ?? "", page.sub, page.description, page.alt]) {
        expect(text).not.toMatch(/[–—]/);
      }
    }
  });
});
