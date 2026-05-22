import sharp from "sharp"
import type { ImageMask } from "./flashcard-types"

export async function generateOccludedImage(
  imageBuffer: Buffer,
  masks: ImageMask[],
  fillColor = "#808080"
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata()
  const width = meta.width ?? 1
  const height = meta.height ?? 1

  const overlays = masks.map((m) => {
    const left = Math.round(m.x * width)
    const top = Math.round(m.y * height)
    const w = Math.max(1, Math.round(m.w * width))
    const h = Math.max(1, Math.round(m.h * height))
    const svg = `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="${fillColor}"/>
    </svg>`
    return { input: Buffer.from(svg), left, top }
  })

  if (overlays.length === 0) {
    return imageBuffer
  }

  return sharp(imageBuffer).composite(overlays).png().toBuffer()
}
