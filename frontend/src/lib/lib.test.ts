import { describe, expect, it } from "vitest";
import { splitForSpeech } from "./speech";
import { depthOf, fmtNum } from "./format";

describe("splitForSpeech", () => {
  it("splits on sentence ends, including the Devanagari danda", () => {
    expect(splitForSpeech("पानी आया। टैंकर आया। ठीक है।")).toEqual(["पानी आया।", "टैंकर आया।", "ठीक है।"]);
  });
  it("never splits a decimal number", () => {
    const parts = splitForSpeech("Water is 6.3 metres below ground. In 30 days it is expected at 5.5 metres.");
    expect(parts.join(" ")).toContain("6.3 metres");
    expect(parts.every((p) => !p.endsWith("6.") && !p.startsWith("3 "))).toBe(true);
  });
  it("breaks long sentences at commas", () => {
    const long = "Clean the roof, clear the downpipes, check the first flush, wash the filter, remove silt, test with a bucket of water";
    expect(splitForSpeech(long, 40, 40).length).toBeGreaterThan(1);
  });
});

describe("format", () => {
  it("keeps Latin digits in every language", () => {
    expect(fmtNum(1336, "mr", 0)).toMatch(/^[0-9,]+$/);
    expect(fmtNum(6.31, "hi")).toBe("6.3");
  });
  it("turns a level into a depth below ground", () => {
    expect(depthOf(-6.31)).toBe(6.31);
    expect(depthOf(null)).toBeNull();
  });
});
