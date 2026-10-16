// MD5 of a string (UTF-8), as lower-case hex. The FoxESS web portal wants the password as its MD5
// (WebCrypto has no MD5).

const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

export function md5(text: string): string {
  const msg = new TextEncoder().encode(text)
  const padded = new Uint8Array((((msg.length + 8) >> 6) + 1) << 6)
  padded.set(msg)
  padded[msg.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, (msg.length << 3) >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(msg.length / 2 ** 29), true)

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let off = 0; off < padded.length; off += 64) {
    const m = Array.from({ length: 16 }, (_, i) => view.getUint32(off + i * 4, true))
    let a = a0, b = b0, c = c0, d = d0
    for (let i = 0; i < 64; i++) {
      let f: number, g: number
      if (i < 16) { f = (b & c) | (~b & d); g = i }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16 }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16 }
      else { f = c ^ (b | ~d); g = (7 * i) % 16 }
      f = (f + a + K[i] + m[g]) >>> 0
      a = d; d = c; c = b
      const s = S[(i >> 4) * 4 + (i & 3)]
      b = (b + ((f << s) | (f >>> (32 - s)))) >>> 0
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0
  }
  const out = new DataView(new ArrayBuffer(16))
  ;[a0, b0, c0, d0].forEach((v, i) => out.setUint32(i * 4, v, true))
  return Array.from(new Uint8Array(out.buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}
