/**
 * Bildlizenzen für Schulmaterial (22.10.2026, Prüfung des Schulträgers, Punkt 12).
 *
 *  - NC (nicht kommerziell) und ND (keine Bearbeitung) sind für Schulmaterial ausgeschlossen: Material wird
 *    verkleinert, beschnitten und beschriftet (= Bearbeitung), und die Weitergabe über Schulserver/Verlagsplattformen
 *    ist bei NC rechtlich unsicher. Solche Bilder werden weder gesucht noch angeboten; vorhandene werden markiert.
 *  - Lernende sehen bei Bildern aus Wikimedia/Openverse/Pixabay den Nachweis (Urheber, Lizenz, Link),
 *    bei KI-Bildern „KI-generiert“.
 * Ohne Abhängigkeiten – Hauptprozess, Server und Oberfläche nutzen dieselben Regeln.
 */

/** NC/ND in Kurz- oder Langform: „CC BY-NC-SA 4.0“, „by-nd“, „NonCommercial“, „NoDerivatives“, „nicht kommerziell“ … */
const UNZULAESSIG = /(^|[^a-z])(nc|nd)([^a-z]|$)|non-?commercial|no-?deriv|nicht[- ]?kommerziell|keine bearbeitung/i

/** Darf ein Bild mit dieser Lizenzangabe in Schulmaterial? (Leere/unbekannte Angabe: ja – Prüfung über die Quelle.) */
export function lizenzErlaubt(lizenz: string | undefined | null): boolean {
  return !UNZULAESSIG.test(String(lizenz ?? ''))
}

/** Grund für die Sperre – für Markierungen in der Oberfläche der Lehrkraft. */
export function lizenzSperrgrund(lizenz: string | undefined | null): string | null {
  const s = String(lizenz ?? '')
  if (lizenzErlaubt(s)) return null
  const nc = /(^|[^a-z])nc([^a-z]|$)|non-?commercial|nicht[- ]?kommerziell/i.test(s)
  const nd = /(^|[^a-z])nd([^a-z]|$)|no-?deriv|keine bearbeitung/i.test(s)
  const teile = [nc ? 'nicht kommerziell (NC)' : '', nd ? 'keine Bearbeitung (ND)' : ''].filter(Boolean)
  return `Lizenz ${teile.join(' und ')} – für Schulmaterial nicht zulässig`
}

/** Filtert Treffer mit unzulässiger Lizenz heraus. */
export function nurZulaessige<T>(liste: T[], lizenz: (x: T) => string | undefined | null): T[] {
  return liste.filter((x) => lizenzErlaubt(lizenz(x)))
}

/** Quellen, deren Bilder einen Nachweis brauchen (nicht KI, nicht eigene Fotos). */
const NACHWEIS_QUELLEN = /wikimedia|commons|openverse|flickr|pixabay|clipart|rawpixel/i

/** Bildangaben, wie sie Arbeitsblatt, Medienbank und Lernende kennen. */
export interface BildHerkunft {
  /** 'ki' | 'suche' | 'openverse' | 'wikimedia' | 'pixabay' | 'own' | 'openmoji' … */
  herkunft?: string
  /** Nachweistext („Titel · Urheber · Lizenz · Quelle“) oder „KI-generiert“ */
  nachweis?: string
  urheber?: string
  lizenz?: string
  link?: string
}

/** Ist das Bild KI-erzeugt? */
export function istKiBild(b: BildHerkunft): boolean {
  return b.herkunft === 'ki' || /^ki[- ]?generiert/i.test(String(b.nachweis ?? '').trim())
}

/**
 * Kurze Bildunterschrift für Lernende: „KI-generiert“ oder „Foto: Urheber · CC BY 4.0“ – null, wenn nichts zu nennen ist
 * (eigene Fotos der Lehrkraft, OpenMoji-Symbole haben ihren Nachweis in der Lizenzübersicht).
 */
export function lernendenNachweis(b: BildHerkunft): string | null {
  if (istKiBild(b)) return 'KI-generiert'
  const nachweis = String(b.nachweis ?? '').trim()
  const fremd = b.herkunft === 'suche' || NACHWEIS_QUELLEN.test(String(b.herkunft ?? '')) || NACHWEIS_QUELLEN.test(nachweis)
  if (!fremd) return null
  if (b.urheber || b.lizenz) return ['Bild: ' + (b.urheber || 'unbekannt'), b.lizenz].filter(Boolean).join(' · ')
  return nachweis ? `Bild: ${nachweis}` : null
}

// ---------------------------------------------------------------- Bildnachweis in Spielen und Tests (23.10.2026, Bildnachweise)

/** Wörter eines Eintrags, klein und ohne Artikel/Klammern („(to) go“ → „go“, „the apple“ → „apple“) */
function suchWoerter(loesung: (string | undefined | null)[]): string[] {
  const aus = new Set<string>()
  for (const roh of loesung) {
    const s = String(roh ?? '')
      .toLowerCase()
      .normalize('NFC')
      .replace(/[()[\]{}]/g, ' ')
    const ganz = s.replace(/\s+/g, ' ').trim()
    if (ganz.length >= 2) aus.add(ganz)
    for (const w of s.split(/[\s/;,|]+/)) {
      const t = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      if (t.length >= 3 || (t.length === 2 && !/^(to|a|an|de|la|le|el|il|un|sb|sth)$/.test(t))) aus.add(t)
    }
  }
  return [...aus]
}

/** Text vergleichbar machen: Dateinamen/Adressen („Red_apple.jpg“, „%20“) wie normale Wörter lesen */
function vergleichbar(s: string): string {
  let t = s
  try {
    t = decodeURIComponent(s)
  } catch {
    /* kaputte Kodierung: so lassen */
  }
  return ` ${t
    .toLowerCase()
    .replace(/[_\-+./:=?&#]+/g, ' ')
    .replace(/\s+/g, ' ')} `
}

const DATEINAME = /\.(jpe?g|png|gif|svg|webp|tiff?|bmp)\b|^(file|datei):/i

/**
 * Bildnachweis ohne Lösung (23.10.2026): Während eines Spiels oder Tests darf der Nachweis das gesuchte Wort nicht
 * verraten – Wikimedia-Titel und Dateinamen heißen oft wie das Wort („Apple – J. Smith, CC BY 4.0, Wikimedia Commons“).
 * Entfernt werden der Titel (vor dem ersten „ – “), jedes Stück mit dem Wort bzw. seiner Übersetzung, Dateinamen und
 * Adressen, die das Wort enthalten. Übrig bleiben Urheber, Lizenz und Quelle. „KI-generiert“ bleibt, wie es ist.
 */
export function nachweisOhneLoesung(text: string | null | undefined, loesung: (string | undefined | null)[]): string | null {
  const roh = String(text ?? '').trim()
  if (!roh) return null
  if (/^ki[- ]?generiert/i.test(roh)) return 'KI-generiert'
  const verboten = suchWoerter(loesung)
  let rest = roh.replace(/^(bild|foto|quelle)\s*:\s*/i, '')
  // „Titel – Urheber, Lizenz, Quelle“ (Medienbank, Arbeitsblatt): der Titel fällt weg
  const strich = rest.search(/\s[–—]\s/)
  if (strich > 0) rest = rest.slice(strich + 3)
  const stuecke = rest
    .split(/\s+[·|–—]\s+|,\s+|;\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !DATEINAME.test(x))
    .filter((x) => {
      const v = vergleichbar(x)
      return !verboten.some((w) => v.includes(` ${vergleichbar(w).trim()} `))
    })
  return stuecke.length ? `Bild: ${stuecke.join(' · ')}` : 'Bild: Nachweis nach der Runde'
}

/**
 * Nachweis einer Bildangabe aus Arbeitsblatt/Vokabeltest (`ImageRef`: source, credit; `zitat` = formatierte
 * Quellenangabe): KI → „KI-generiert“, ohne Angabe → nichts, sonst „Bild: …“ (auch Schulbuch-Ausschnitte).
 */
export function nachweisAusBildquelle(img: { source?: string; credit?: string } | null | undefined, zitat?: string | null): string | null {
  if (!img) return null
  if (img.source === 'ai' || /^ki[- ]?generiert/i.test(String(img.credit ?? '').trim())) return 'KI-generiert'
  // Eigene Fotos/OpenMoji ohne Angabe brauchen keinen Nachweis (Lizenzübersicht); eine eingetragene Angabe wird gezeigt
  const text = String(zitat ?? '').trim() || String(img.credit ?? '').trim()
  return text ? `Bild: ${text.replace(/^(bild|foto)\s*:\s*/i, '')}` : null
}

/** Für die Anzeige: Art, Text ohne Adresse und die Adresse als Link */
export function nachweisTeile(text: string): { art: 'ki' | 'fremd'; text: string; link?: string } {
  const t = String(text ?? '').trim()
  if (/^ki[- ]?generiert/i.test(t)) return { art: 'ki', text: 'KI-generiert' }
  const m = t.match(/https?:\/\/[^\s·,;]+/)
  if (!m) return { art: 'fremd', text: t }
  const ohne = t
    .replace(m[0], '')
    .replace(/\s*[·,;]\s*$/, '')
    .replace(/\s*[·,;]\s*([·,;])/g, '$1')
    .trim()
  return { art: 'fremd', text: ohne || 'Bild', link: m[0] }
}
