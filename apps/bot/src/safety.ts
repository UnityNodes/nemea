const PRIVATE_KEY = /^(0x)?[0-9a-fA-F]{64}$/;
const SEED_WORD = /^[a-z]{3,8}$/;
const MIN_SEED_WORDS = 12;

export function looksLikeSeedPhrase(text: string): boolean {
  const body = text.trim().replace(/^\/\S+\s*/, "").trim();
  if (PRIVATE_KEY.test(body)) return true;
  const words = body.toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ");
  return words.length >= MIN_SEED_WORDS && words.every((word) => SEED_WORD.test(word));
}
