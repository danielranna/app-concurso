import { createRequire } from "node:module"

const require = createRequire(new URL("../../../package.json", import.meta.url))
const sharp = require("sharp")
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
mkdirSync(dir, { recursive: true })

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#0f766e"/>
  <text x="256" y="330" text-anchor="middle" font-size="280" font-family="Arial, sans-serif" font-weight="700" fill="#ffffff">V</text>
</svg>`

async function png(size) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
}

function ico(png32) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry.writeUInt8(32, 0)
  entry.writeUInt8(32, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png32.length, 8)
  entry.writeUInt32LE(6 + 16, 12)
  return Buffer.concat([header, entry, png32])
}

const png32 = await png(32)
const png128 = await png(128)
const png512 = await png(512)
writeFileSync(join(dir, "32x32.png"), png32)
writeFileSync(join(dir, "128x128.png"), png128)
writeFileSync(join(dir, "icon.png"), png512)
writeFileSync(join(dir, "icon.ico"), ico(png32))
console.log("icons ok")
