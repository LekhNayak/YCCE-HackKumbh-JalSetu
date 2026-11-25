export const LANGS = [
  { code: "en", native: "English", bcp47: "en-IN" },
  { code: "mr", native: "मराठी", bcp47: "mr-IN" },
  { code: "hi", native: "हिंदी", bcp47: "hi-IN" },
] as const;

export type Lang = (typeof LANGS)[number]["code"];
export const LANG_CODES = LANGS.map((l) => l.code) as Lang[];
export const isLang = (x: unknown): x is Lang => typeof x === "string" && (LANG_CODES as string[]).includes(x);
export const bcp47 = (l: Lang) => LANGS.find((x) => x.code === l)?.bcp47 ?? "en-IN";
