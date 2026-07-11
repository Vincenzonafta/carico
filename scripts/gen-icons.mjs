// Genera le icone PWA senza dipendenze: sfondo lime arrotondato + bilanciere scuro.
// Rigenera con: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const LIME = [201, 249, 78], INK = [32, 48, 10]

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(W, H, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8-bit, RGBA
  const raw = Buffer.alloc(H * (W * 4 + 1))
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0 // filtro 0
    rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

function draw(S) {
  const buf = Buffer.alloc(S * S * 4)
  const r = S * 0.22 // raggio angoli
  const put = (x, y, [cr, cg, cb], a = 255) => {
    const i = (y * S + x) * 4; buf[i] = cr; buf[i + 1] = cg; buf[i + 2] = cb; buf[i + 3] = a
  }
  // rounded rect mask
  const inRound = (x, y) => {
    const cx = Math.min(x, S - 1 - x), cy = Math.min(y, S - 1 - y)
    if (cx >= r || cy >= r) return true
    return Math.hypot(r - cx, r - cy) <= r
  }
  // bilanciere: barra + due piastre per lato, centrato
  const bar = (x, y) => Math.abs(y - S / 2) < S * 0.035 && x > S * 0.30 && x < S * 0.70
  const plate = (x, y) => {
    const dx = Math.abs(x - S / 2)
    const inner = dx > S * 0.255 && dx < S * 0.30 && Math.abs(y - S / 2) < S * 0.15
    const outer = dx > S * 0.185 && dx < S * 0.235 && Math.abs(y - S / 2) < S * 0.105
    return inner || outer
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inRound(x, y)) { put(x, y, [0, 0, 0], 0); continue }
    put(x, y, (bar(x, y) || plate(x, y)) ? INK : LIME)
  }
  return buf
}

for (const S of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${S}.png`, import.meta.url), png(S, S, draw(S)))
  console.log(`public/icon-${S}.png ok`)
}
