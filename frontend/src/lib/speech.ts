/** Split text into speakable pieces: sentences first (. । ! ?), then commas; never inside a decimal like 6.3. */
export function splitForSpeech(text: string, first = 55, rest = 85): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?।])\s+(?=\S)/).filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    const limit = out.length === 0 ? first : rest;
    if (s.length <= limit) { out.push(s); continue; }
    let cur = "";
    for (const part of s.split(/(?<=,)\s+/)) {
      if (cur && (cur + " " + part).length > limit) { out.push(cur); cur = part; } else { cur = cur ? cur + " " + part : part; }
    }
    if (cur) out.push(cur);
  }
  return out;
}
