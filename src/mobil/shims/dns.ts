/**
 * `node:dns/promises` für die iPad-App. Im WKWebView gibt es keine Namensauflösung; der Start
 * (mobil/start.ts) setzt deshalb in netz/zieladresse.ts einen eigenen Auflöser. Kommt doch ein
 * Aufruf hier an, liefert er den Namen selbst – `istPrivateAdresse` erkennt darin keine IP.
 */
export async function lookup(host: string, opt?: { all?: boolean }): Promise<{ address: string; family: number }[] | { address: string; family: number }> {
  const e = { address: host, family: 0 }
  return opt?.all ? [e] : e
}
export default { lookup }
