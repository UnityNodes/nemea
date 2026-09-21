import { Bot, type Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { InternalApiClient } from "./api-client.ts";
import { ApiProtocolError, ApiUnreachableError } from "./api-client.ts";
import {
  badResponseMessage,
  expiredCodeMessage,
  helpMessage,
  internalErrorMessage,
  invalidCodeMessage,
  linkedMessage,
  notLinkedMessage,
  seedPhraseWarning,
  startInstructions,
  statusMessage,
  unknownMessage,
  unlinkedMessage,
  unreachableMessage,
} from "./format.ts";
import { describeError } from "./redact.ts";
import { looksLikeSeedPhrase } from "./safety.ts";

export type BotApi = Pick<InternalApiClient, "link" | "unlink" | "summary">;

export type BotDeps = {
  token: string;
  api: BotApi;
  publicWebUrl: string | null;
  botInfo?: UserFromGetMe;
};

const LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;

function errorReply(error: unknown): string {
  if (error instanceof ApiUnreachableError) return unreachableMessage();
  if (error instanceof ApiProtocolError) return badResponseMessage();
  return internalErrorMessage();
}

async function reply(ctx: Context, html: string): Promise<void> {
  await ctx.reply(html, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.token, { botInfo: deps.botInfo });

  const logError = (context: string, error: unknown): void => {
    console.error(`[bot] ${context}: ${describeError(error, deps.token)}`);
  };

  const answer = async (ctx: Context, command: string, build: () => Promise<string>): Promise<void> => {
    let html: string;
    try {
      html = await build();
    } catch (error) {
      logError(`/${command} failed in chat ${ctx.chat?.id}`, error);
      html = errorReply(error);
    }
    await reply(ctx, html);
  };

  bot.catch((error) => {
    logError(`unhandled error for update ${error.ctx.update.update_id}`, error.error);
  });

  const priv = bot.chatType("private");

  priv.on("message:text", async (ctx, next) => {
    if (!looksLikeSeedPhrase(ctx.message.text)) {
      await next();
      return;
    }
    let deleted = false;
    try {
      await ctx.deleteMessage();
      deleted = true;
    } catch (error) {
      logError(`could not delete a seed-phrase-like message in chat ${ctx.chat.id}`, error);
    }
    await reply(ctx, seedPhraseWarning(deleted));
  });

  priv.command("start", (ctx) =>
    answer(ctx, "start", async () => {
      const code = ctx.match.trim();
      if (code === "") return startInstructions(deps.publicWebUrl);
      if (!LINK_CODE_PATTERN.test(code)) return invalidCodeMessage();
      const username = ctx.from?.username ?? null;
      const outcome = await deps.api.link({ code, chatId: String(ctx.chat.id), username });
      if (outcome === "linked") return linkedMessage(username);
      if (outcome === "expired_code") return expiredCodeMessage();
      return invalidCodeMessage();
    }),
  );

  priv.command("status", (ctx) =>
    answer(ctx, "status", async () => {
      const summary = await deps.api.summary(String(ctx.chat.id));
      return summary.linked ? statusMessage(summary) : notLinkedMessage();
    }),
  );

  priv.command("stop", (ctx) =>
    answer(ctx, "stop", async () => {
      const { wasLinked } = await deps.api.unlink(String(ctx.chat.id));
      return unlinkedMessage(wasLinked);
    }),
  );

  priv.command("help", (ctx) => answer(ctx, "help", async () => helpMessage()));

  priv.on("message:text", (ctx) => reply(ctx, unknownMessage()));

  return bot;
}
