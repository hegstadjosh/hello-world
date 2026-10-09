export type ImageType = { extension: "jpg" | "png" | "webp"; contentType: string };

// Trust the file's bytes, not its name or the browser's reported type.
export function detectImage(bytes: Uint8Array): ImageType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", contentType: "image/jpeg" };
  if ([137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return { extension: "png", contentType: "image/png" };
  if (String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return { extension: "webp", contentType: "image/webp" };
  return null;
}
