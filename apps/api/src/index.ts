import { createApp } from "./app.ts";
import { compose, defaultLog } from "./compose.ts";
import { loadConfig } from "./config.ts";

const result = loadConfig(process.env);
if (!result.ok) {
  console.error("[nemea-api] cannot start, fix the environment:");
  for (const p of result.problems) console.error(`  - ${p}`);
  process.exit(2);
}

const { config } = result;
const composed = await compose(config);
await composed.poller?.loadPersistedLanes();
const app = createApp(composed.deps);
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`[nemea-api] listening on ${config.HOST}:${config.PORT} (db: ${composed.handle.driver}, poller: ${composed.poller ? "on" : "off"}, telegram: ${composed.deps.telegramConfigured ? "on" : "off"})`);
  composed.poller?.start();
});

process.on("unhandledRejection", (reason) => defaultLog("unhandled promise rejection", reason));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void composed.stop().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
