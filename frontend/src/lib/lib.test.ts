import { describe, expect, it } from "vitest";
import { splitForSpeech } from "./speech";
import { depthOf, fmtNum } from "./format";
import { fit } from "./photo";
import { emailProblem, passwordProblem, refusalOf, registerProblems, usernameProblem } from "./authRules";

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

describe("sign-in rules", () => {
  it("accepts ordinary names, emails and passwords", () => {
    expect(registerProblems({ username: "Meera.Kulkarni", email: "meera@example.com", password: "pond-lily-42", society_id: "1" })).toEqual({});
    expect(usernameProblem("a1_b")).toBeUndefined();
    expect(passwordProblem("पाणी-वाचवा-9")).toBeUndefined();
  });
  it("says what is wrong", () => {
    expect([usernameProblem(" "), usernameProblem("ab"), usernameProblem("a b c"), usernameProblem(".abc"), usernameProblem("x".repeat(31))])
      .toEqual(["required", "username_short", "username_chars", "username_chars", "username_chars"]);
    expect([emailProblem(""), emailProblem("a@b"), emailProblem("a b@c.in"), emailProblem("a@c.in")]).toEqual(["required", "email_invalid", "email_invalid", undefined]);
    expect([passwordProblem(""), passwordProblem("short7!"), passwordProblem("Asha.Patil", "asha.patil"), passwordProblem("aaaaaaaa"), passwordProblem("x1".repeat(65))])
      .toEqual(["required", "password_short", "password_same", "password_common", "password_long"]);
    expect(registerProblems({ username: "ok.name", email: "a@c.in", password: "pond-lily-42", society_id: "" })).toEqual({ society_id: "society_missing" });
  });
  it("tells the server's answers apart", () => {
    expect(refusalOf(404, undefined, true)).toEqual({ form: "unreachable" });
    expect(refusalOf(401, { code: "wrong" }, false)).toEqual({ form: "wrong" });
    expect(refusalOf(429, { code: "too_many", minutes: 15 }, false)).toEqual({ form: "too_many", minutes: 15 });
    expect(refusalOf(409, { code: "fields", fields: { email: "email_taken" } }, false)).toEqual({ fields: { email: "email_taken" } });
    expect(refusalOf(422, [{ loc: ["body"] }], false)).toEqual({ form: "error" });
  });
});

describe("photo size", () => {
  it("shrinks the longer side to 1600 and keeps the shape", () => {
    expect(fit(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(fit(3000, 4000)).toEqual({ w: 1200, h: 1600 });
  });
  it("never enlarges a small photo", () => {
    expect(fit(800, 600)).toEqual({ w: 800, h: 600 });
    expect(fit(5000, 1)).toEqual({ w: 1600, h: 1 });
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
