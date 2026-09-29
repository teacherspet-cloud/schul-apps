/** `url` für die iPad-App: nur die Umrechnung zwischen Pfad und file:-Adresse */
export function pathToFileURL(pfad: string): URL {
  return new URL('file://' + encodeURI(pfad.replace(/\\/g, '/').replace(/^(?!\/)/, '/')))
}
export function fileURLToPath(url: string | URL): string {
  return decodeURIComponent(new URL(String(url)).pathname)
}
const U = globalThis.URL
const S = globalThis.URLSearchParams
export { U as URL, S as URLSearchParams }
export default { pathToFileURL, fileURLToPath, URL: U, URLSearchParams: S }
