import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { OG_PAGES, OG_SIZE, isOgKey, siteBase } from "@/lib/site";
import { LIGHT_PALETTE, logoMarkSvg, valleySvg } from "@/lib/valley-geometry";

export const dynamic = "force-static";
export const dynamicParams = false;

const INK = "#22261f";
const MUTED = "#555a4d";
const FAINT = "#666b5c";
const PRIMARY = "#3b5837";
const BACKGROUND = "#f2f1ea";

const FONT_DIR = path.join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-sans");

export function generateStaticParams() {
  return Object.keys(OG_PAGES).map((key) => ({ key }));
}

function dataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function font(file: string): Promise<ArrayBuffer> {
  const buffer = await readFile(path.join(FONT_DIR, file));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isOgKey(key)) return new Response(null, { status: 404 });
  const page = OG_PAGES[key];
  const host = siteBase()?.host ?? null;
  const [regular, semibold] = await Promise.all([font("Geist-Regular.ttf"), font("Geist-SemiBold.ttf")]);

  return new ImageResponse(
    (
      <div style={{ width: OG_SIZE.width, height: OG_SIZE.height, display: "flex", background: BACKGROUND, color: INK, fontFamily: "Geist" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 736, padding: "60px 0 56px 76px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <img src={dataUri(logoMarkSvg(PRIMARY, 52))} width={52} height={52} alt="" />
            <div style={{ display: "flex", marginLeft: 16, fontSize: 38, fontWeight: 600, letterSpacing: "-0.03em" }}>Nemea</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 68, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.06 }}>
              <div style={{ display: "flex" }}>{page.headline}</div>
              {page.accent ? <div style={{ display: "flex", color: PRIMARY }}>{page.accent}</div> : null}
            </div>
            <div style={{ display: "flex", marginTop: 28, maxWidth: 604, fontSize: 30, lineHeight: 1.4, fontWeight: 400, color: MUTED }}>{page.sub}</div>
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 400, color: FAINT }}>{host}</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", paddingRight: 24 }}>
          <img src={dataUri(valleySvg(LIGHT_PALETTE, 388, 466))} width={388} height={466} alt="" />
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
