const SEED_WORD = /^[a-z]{3,8}$/;
const MIN_SEED_WORDS = 12;

export function looksLikeSeedPhrase(text: string): boolean {
  const body = text.trim().replace(/^\/\S+\s*/, "");
  if (body === "") return false;
  const words = body.split(/\s+/);
  return words.length >= MIN_SEED_WORDS && words.every((word) => SEED_WORD.test(word));
}
