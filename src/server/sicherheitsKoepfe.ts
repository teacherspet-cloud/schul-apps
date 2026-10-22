/**
 * Sicherheits-Kopfzeilen des Servers (23.10.2026, Prüfung des Schulträgers, Punkt 9 „Härtung").
 *
 * Allgemein (jede Antwort nach der Adressprüfung, http.ts):
 *  - HSTS `max-age=31536000; includeSubDomains` – nur, wenn der Server über HTTPS erreichbar ist (eigenes Zertifikat
 *    oder öffentliche Adresse mit https). Bewusst OHNE `preload` (Entscheidung: kein Eintrag in die Browser-Listen,
 *    der sich nur mühsam zurücknehmen lässt). Die Weiche (deploy/strato/weiche-nginx.conf) setzt dieselbe Zeile.
 *  - Permissions-Policy: Mikrofon (Sprechtraining, Sprachaufnahmen in Reihen) und Kamera (QR-Codes scannen,
 *    CodeScanner.tsx) nur für die eigene Seite; Standort, Bezahlen, USB, Seriell, HID, MIDI, Bildschirmaufnahme aus.
 *  - Cross-Origin-Resource-Policy `same-site`: Fremde Seiten binden Bilder/Ton/Skripte von Schul-Apps nicht ein.
 *    `same-site` statt `same-origin`, weil meineschulapps.de und www.meineschulapps.de beide in Gebrauch sind.
 *
 * Programmseite (index.html der Oberfläche, http.ts › statisch):
 *  - CSP als Kopfzeile – wie das meta-Tag in src/renderer/index.html, aber enger: frame-ancestors 'self', Bilder nur
 *    von hier, data:, blob: und den Bilddiensten, die die Oberfläche wirklich direkt zeigt (Vorschaubilder der
 *    Bildsuche: Openverse, Wikimedia, Pixabay; Lehrwerk-Cover: Klett, Cornelsen – shared/lehrwerkCover.ts),
 *    Verbindungen nur zu 'self' und wss: (kein unverschlüsseltes ws:). Der Ton des Sprechtrainings (WebRTC) fällt
 *    nicht unter die CSP; das SDP läuft über den eigenen Server (/s/api/sprechen). Gelten meta-Tag und Kopfzeile
 *    zugleich, muss der Browser beide erfüllen – das meta-Tag bleibt unverändert für die PC- und iPad-App, die die
 *    Seite lokal laden und keine Kopfzeilen bekommen.
 *  - Cross-Origin-Opener-Policy `same-origin`: Eigene Fenster (Vorschau, Hilfe, eigenesFenster.tsx) sind gleicher
 *    Herkunft und behalten ihre Verbindung; fremde Seiten bekommen keinen Griff auf das Fenster.
 */

export const HSTS = 'max-age=31536000; includeSubDomains'

export const PERMISSIONS_POLICY = 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=(), display-capture=()'

/** Bilddienste, deren Bilder die Oberfläche direkt (ohne Umweg über den Server) anzeigt */
export const BILD_QUELLEN = ['https://api.openverse.org', 'https://upload.wikimedia.org', 'https://cdn.pixabay.com', 'https://assets.klett.de', 'https://static.cornelsen.de']

export const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${BILD_QUELLEN.join(' ')}`,
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "connect-src 'self' wss: data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'"
].join('; ')

/** Läuft der Server über HTTPS? Eigenes Zertifikat oder öffentliche https-Adresse (hinter einem Vorschaltrechner) */
export const ueberHttps = (o: { tls?: unknown; adresse: string }): boolean => Boolean(o.tls) || /^https:\/\//i.test(o.adresse)

/** Kopfzeilen für jede Antwort */
export function allgemeineKoepfe(https: boolean): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'x-frame-options': 'SAMEORIGIN',
    'permissions-policy': PERMISSIONS_POLICY,
    'cross-origin-resource-policy': 'same-site',
    ...(https ? { 'strict-transport-security': HSTS } : {})
  }
}

/** Zusätzlich für die Programmseite (index.html) */
export function programmSeitenKoepfe(): Record<string, string> {
  return { 'content-security-policy': APP_CSP, 'cross-origin-opener-policy': 'same-origin' }
}
