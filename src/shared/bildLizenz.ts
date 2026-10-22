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
