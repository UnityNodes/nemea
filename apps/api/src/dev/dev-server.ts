import http from "node:http";
import { createFakeCmc } from "./fake-cmc.ts";

const fake = createFakeCmc();
const port = Number(process.env.FAKE_CMC_PORT ?? 47800);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/__control") {
    const body = await new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
    });
    const cmd = JSON.parse(body || "{}") as { coin?: { id: number; price?: number; pct1h?: number; pct24h?: number; volumeChange?: number }; market?: number; category?: { name: string; avg: number } };
    if (cmd.coin) fake.setCoin(cmd.coin.id, cmd.coin);
    if (typeof cmd.market === "number") fake.setMarket(cmd.market);
    if (cmd.category) fake.setCategory(cmd.category.name, cmd.category.avg);
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
    return;
  }
  const r = await fake.fetchImpl(url);
  res.writeHead(r.status, { "content-type": "application/json" });
  res.end(await r.text());
});

server.listen(port, "127.0.0.1", () => console.log(`fake CMC (development only) on http://127.0.0.1:${port}`));
