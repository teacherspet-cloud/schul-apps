/** `crypto` für die iPad-App – Zufall über die Web-Crypto des WKWebView */
import { Buffer } from 'buffer'

export function randomBytes(n: number): Buffer {
  const b = new Uint8Array(n)
  // getRandomValues nimmt höchstens 65536 Bytes je Aufruf
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(b.subarray(i, Math.min(n, i + 65536)))
  return Buffer.from(b)
}

export function randomUUID(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = randomBytes(16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function randomInt(min: number, max?: number): number {
  const [a, b] = max === undefined ? [0, min] : [min, max]
  return a + Math.floor((randomBytes(4).readUInt32BE(0) / 2 ** 32) * (b - a))
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) throw new RangeError('Input buffers must have the same byte length')
  let d = 0
  for (let i = 0; i < a.byteLength; i++) d |= a[i] ^ b[i]
  return d === 0
}

export function createHash(): never {
  throw new Error('createHash gibt es in der iPad-App nicht.')
}

export default { randomBytes, randomUUID, randomInt, timingSafeEqual, createHash }
