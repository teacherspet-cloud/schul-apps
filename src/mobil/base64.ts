/** Base64 ↔ Bytes ohne Node – in Stücken, damit große PDFs den Aufrufstapel nicht sprengen */
export function nachBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.byteLength; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function ausBase64(b64: string): Uint8Array {
  const roh = atob(b64.replace(/^data:[^,]*,/, '').replace(/\s+/g, ''))
  const out = new Uint8Array(roh.length)
  for (let i = 0; i < roh.length; i++) out[i] = roh.charCodeAt(i)
  return out
}
