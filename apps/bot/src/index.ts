import { InternalApiClient } from "./api-client.ts";
import { createBot } from "./bot.ts";
import { readConfig } from "./config.ts";
import { HealthState, createHealthServer, superviseBot } from "./health.ts";
import { describeError } from "./redact.ts";

const result = readConfig(process.env);
if (!result.ok) {
  const problems = [
    ...(result.missing.length > 0 ? [`missing required env: ${result.missing.join(", ")}`] : []),
    ...result.invalid,
  ];
  console.error(`[bot] cannot start: ${problems.join("; ")}`);
  process.exit(2);
}

const { config } = result;

const api = new InternalApiClient({
  origin: config.apiOrigin,
  secret: config.internalSecret,
  fetch: (url, init) => fetch(url, init),
});

const bot = createBot({ token: config.token, api, publicWebUrl: config.publicWebUrl });
const health = new HealthState();
const server = createHealthServer(health);

server.on("error", (error) => {
  console.error(`[bot] health server failed on port ${config.port}: ${describeError(error, config.token)}`);
  process.exit(1);
});

server.listen(config.port, () => {
  console.log(`[bot] health server listening on :${config.port}`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[bot] ${signal} received, shutting down`);
  try {
    await bot.stop();
  } catch (error) {
    console.error(`[bot] bot.stop failed: ${describeError(error, config.token)}`);
  }
  server.close(() => process.exit(0));
  server.closeAllConnections();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await superviseBot(
  (onStart) => bot.start({ allowed_updates: ["message"], onStart: () => onStart() }),
  health,
  config.token,
);
