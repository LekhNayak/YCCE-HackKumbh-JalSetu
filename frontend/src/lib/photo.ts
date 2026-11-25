/** Photos are made smaller before sending: quicker on a weak network and below the server's limit. Drawing the photo
 *  again also drops what phones store inside the file, such as the exact location and the device. */
export const MAX_SIDE = 1600;
const MAX_BYTES = 4 * 1024 * 1024;

export function fit(w: number, h: number, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** The photo as a small JPEG, or null if this browser cannot read the file. */
export async function shrinkPhoto(file: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { w, h } = fit(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);          // JPEG has no transparency
    g.drawImage(img, 0, 0, w, h);
    const out = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.82));
    return out && out.size <= MAX_BYTES ? out : null;
  } catch { return null; }
  finally { URL.revokeObjectURL(url); }
}
