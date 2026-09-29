/** `node:net` für die iPad-App: nur `isIP` (Zielprüfung, main/services/netz/zieladresse.ts) */
const V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

export function isIPv4(s: string): boolean {
  return V4.test(s)
}

export function isIPv6(s: string): boolean {
  if (!s.includes(':') || !/^[0-9a-fA-F:.%a-zA-Z]+$/.test(s)) return false
  const ohneZone = s.split('%')[0]
  const v4 = /:(\d+\.\d+\.\d+\.\d+)$/.exec(ohneZone)
  if (v4 && !isIPv4(v4[1])) return false
  const teile = (v4 ? ohneZone.slice(0, -v4[1].length) + '0:0' : ohneZone).split('::')
  if (teile.length > 2) return false
  const gruppen = teile.flatMap((t) => (t ? t.split(':') : []))
  if (!gruppen.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false
  return teile.length === 2 ? gruppen.length < 8 : gruppen.length === 8
}

export function isIP(s: string): 0 | 4 | 6 {
  return isIPv4(s) ? 4 : isIPv6(s) ? 6 : 0
}

export type AddressInfo = { address: string; family: string; port: number }
export default { isIP, isIPv4, isIPv6 }
