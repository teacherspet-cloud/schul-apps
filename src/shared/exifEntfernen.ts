/**
 * Metadaten aus Bildern entfernen (Großprogramm 0.4, Rechtspaket).
 *
 * Fotos tragen oft Aufnahmeort (GPS), Kamera, Zeitpunkt und Namen in EXIF/XMP. Hochgeladene
 * Bilder laufen im Programm über eine Zeichenfläche (`normalizeImage`) und verlieren dabei alle
 * Metadaten. Bilder aus dem Netz (Bildsuche) kamen dagegen unverändert ins Blatt und damit in
 * jede Word-Datei. Hier werden sie ohne Neukodierung bereinigt – verlustfrei:
 *
 * - JPEG: APP1 (EXIF, XMP), APP13 (IPTC/Photoshop) und Kommentare fallen weg; APP0 (JFIF),
 *   APP2 (Farbprofil) und APP14 (Adobe-Farbraum) bleiben, sonst ändern sich Farben.
 * - PNG: eXIf, tEXt, zTXt, iTXt und tIME fallen weg.
 *
 * Unbekanntes oder Beschädigtes bleibt unverändert – lieber ein Bild mit Metadaten als keins.
 */
const JPEG_WEG = new Set([0xe1, 0xed, 0xfe])
const PNG_WEG = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'])

export function exifEntfernen(daten: Uint8Array): Uint8Array {
  try {
    if (daten[0] === 0xff && daten[1] === 0xd8) return jpeg(daten)
    if (daten[0] === 0x89 && daten[1] === 0x50 && daten[2] === 0x4e && daten[3] === 0x47) return png(daten)
  } catch {
    // unverändert zurück
  }
  return daten
}

function jpeg(d: Uint8Array): Uint8Array {
  const teile: Uint8Array[] = [d.subarray(0, 2)]
  let i = 2
  while (i + 4 <= d.length) {
    if (d[i] !== 0xff) return d
    const marker = d[i + 1]
    // Beginn der Bilddaten: Rest unverändert übernehmen
    if (marker === 0xda) {
      teile.push(d.subarray(i))
      return verbinde(teile)
    }
    // Marker ohne Länge
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      teile.push(d.subarray(i, i + 2))
      i += 2
      continue
    }
    const laenge = (d[i + 2] << 8) | d[i + 3]
    if (laenge < 2 || i + 2 + laenge > d.length) return d
    if (!JPEG_WEG.has(marker)) teile.push(d.subarray(i, i + 2 + laenge))
    i += 2 + laenge
  }
  return d
}

function png(d: Uint8Array): Uint8Array {
  const teile: Uint8Array[] = [d.subarray(0, 8)]
  let i = 8
  while (i + 12 <= d.length) {
    const laenge = ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0
    const typ = String.fromCharCode(d[i + 4], d[i + 5], d[i + 6], d[i + 7])
    const ende = i + 12 + laenge
    if (ende > d.length) return d
    if (!PNG_WEG.has(typ)) teile.push(d.subarray(i, ende))
    i = ende
    if (typ === 'IEND') return verbinde(teile)
  }
  return d
}

function verbinde(teile: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(teile.reduce((n, t) => n + t.length, 0))
  let o = 0
  for (const t of teile) {
    out.set(t, o)
    o += t.length
  }
  return out
}
