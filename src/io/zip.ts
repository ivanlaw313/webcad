// Minimal pure-JS ZIP writer (STORE method — no compression). Zero dependencies (keeps the project's
// "license-safe deps only" rule — no JSZip). Good enough to bundle a handful of STL files for download.
// Builds: [local file header + data]* + [central directory record]* + end-of-central-directory.

// CRC-32 (IEEE 802.3) — required per ZIP entry.
const CRC_TABLE: number[] = (() => {
  const t: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export type ZipFile = { name: string; data: Uint8Array }

// Returns a Uint8Array containing a valid (uncompressed) .zip of the given files.
export function makeZip(files: ZipFile[]): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff])
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])

  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const crc = crc32(f.data)
    const size = f.data.length
    // Local file header (sig 0x04034b50)
    const lfh = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), // ver, flags, method=0(store), modtime, moddate
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0),
      nameBytes,
    ])
    chunks.push(lfh, f.data)
    // Central directory file header (sig 0x02014b50)
    const cdh = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nameBytes,
    ])
    central.push(cdh)
    offset += lfh.length + f.data.length
  }

  const centralStart = offset
  let centralSize = 0
  for (const c of central) { chunks.push(c); centralSize += c.length }
  // End of central directory (sig 0x06054b50)
  chunks.push(concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(centralStart), u16(0),
  ]))

  return concat(chunks)
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0
  for (const p of parts) len += p.length
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
