import { describe, expect, it } from "vitest";
import en from "./en.json";
import mr from "./mr.json";
import hi from "./hi.json";

type Tree = { [k: string]: string | Tree };
function flat(t: Tree, prefix = ""): Record<string, string> {
  return Object.entries(t).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? { ...acc, [key]: v } : { ...acc, ...flat(v, key) };
  }, {} as Record<string, string>);
}
const placeholders = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).map((x) => x.replace(/\s/g, "")).sort();

describe("translations", () => {
  const E = flat(en as Tree);
  for (const [name, tree] of [["mr", mr], ["hi", hi]] as const) {
    const L = flat(tree as Tree);
    it(`${name} has exactly the English keys`, () => {
      expect(Object.keys(L).sort()).toEqual(Object.keys(E).sort());
    });
    it(`${name} keeps every {{placeholder}}`, () => {
      for (const k of Object.keys(E)) expect(placeholders(L[k]), k).toEqual(placeholders(E[k]));
    });
    it(`${name} is actually translated (Devanagari in long strings)`, () => {
      const untranslated = Object.entries(L).filter(([k, v]) => v.length > 25 && !/[ऀ-ॿ]/.test(v) && !k.startsWith("place."));
      expect(untranslated).toEqual([]);
    });
  }
  it("never names the forecasting project", () => {
    const name = ["jal", "vaani"].join("");          // spelled in parts so the repo itself never contains it
    expect(JSON.stringify([en, mr, hi]).toLowerCase()).not.toContain(name);
  });
});
