/**
 * Untertitel mit Zeitmarken – für Fragen zu einem Video (Hör-/Sehverstehen, 02.10.2026).
 *
 * Wunsch der Lehrkraft: „Wenn ich URLs zu Dokumentationen (ZDF z.B.) oder YouTube-Videos als
 * Material angebe, wird die Webseite nur als Text behandelt anstatt mit dem Video (z.B.
 * Untertitel auslesen) Fragen zu den Videos zu erstellen."
 *
 * Bis dahin wurden die YouTube-Untertitel zu Fließtext zusammengezogen – die Zeitmarken gingen
 * verloren, und eine Aufgabe konnte nicht sagen, in welchem Abschnitt etwas vorkommt. Jetzt
 * bleiben sie erhalten: Die Untertitel werden zu Abschnitten von rund 20 Sekunden gebündelt und
 * als „[mm:ss] Text" an die KI gegeben.
 *
 * Die Untertitel dienen NUR als Eingabe für die KI und werden nicht auf das Blatt gedruckt (auf
 * dem Blatt stehen eigene Fragen, dazu Link und QR-Code zum Video beim Anbieter).
 */

export interface UntertitelZeile {
  /** Beginn in Sekunden */
  start: number
  text: string
}

/** „00:01:02.500" oder „01:02.500" oder „62.5s" in Sekunden */
export function sekundenAus(zeit: string): number {
  const t = zeit.trim()
  const s = /^([\d.]+)s$/.exec(t)
  if (s) return Number(s[1])
  const teile = t.split(':').map((x) => Number(x.replace(',', '.')))
  if (teile.some((x) => !Number.isFinite(x))) return 0
  return teile.reduce((summe, x) => summe * 60 + x, 0)
}

/** Steuerzeichen, Klassen-Markierungen (<c.S4>) und Sprecherangaben aus einem Untertitel entfernen */
function bereinige(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** WebVTT (ARD, ZDF) in Zeilen */
export function leseWebVtt(vtt: string): UntertitelZeile[] {
  const zeilen: UntertitelZeile[] = []
  const bloecke = vtt.replace(/\r/g, '').split(/\n\n+/)
  for (const block of bloecke) {
    const z = block.split('\n')
    const i = z.findIndex((x) => x.includes('-->'))
    if (i < 0) continue
    const start = sekundenAus(z[i].split('-->')[0])
    const text = bereinige(z.slice(i + 1).join(' '))
    // Senderkennung („UNTERTITEL: Hessischer Rundfunk") ist kein Inhalt
    if (!text || /^untertitel\s*:/i.test(text)) continue
    zeilen.push({ start, text })
  }
  return zeilen
}

/**
 * Zeilen zu Abschnitten von etwa `sekunden` bündeln – die KI braucht Zusammenhang, keine
 * Einzelzeilen, und die Zeitmarke des Abschnitts genügt, um eine Stelle wiederzufinden.
 */
export function buendele(zeilen: UntertitelZeile[], sekunden = 20): UntertitelZeile[] {
  const out: UntertitelZeile[] = []
  for (const z of zeilen) {
    const letzter = out[out.length - 1]
    if (letzter && z.start - letzter.start < sekunden) letzter.text = `${letzter.text} ${z.text}`.replace(/\s+([.,;:!?])/g, '$1')
    else out.push({ start: z.start, text: z.text })
  }
  return out
}

export const zeitmarke = (s: number): string => {
  const ganz = Math.max(0, Math.floor(s))
  const h = Math.floor(ganz / 3600)
  const m = Math.floor((ganz % 3600) / 60)
  const sek = String(ganz % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sek}` : `${m}:${sek}`
}

/** Transkript für die KI: ein Abschnitt je Zeile mit Zeitmarke */
export function alsTranskript(zeilen: UntertitelZeile[], max = 120_000): string {
  const text = buendele(zeilen)
    .map((z) => `[${zeitmarke(z.start)}] ${z.text}`)
    .join('\n')
  return text.length > max ? `${text.slice(0, max)} …` : text
}
