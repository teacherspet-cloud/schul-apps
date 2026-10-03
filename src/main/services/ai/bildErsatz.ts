/**
 * Ersatzwege für die Bilderzeugung (03.10.2026).
 *
 * Wunsch der Lehrkraft: „benutz für Bilder einen Fallback, wenn das Abo keine Bilder abdeckt oder
 * das Kontingent aufgebraucht ist während der Erzeugung." Anlass: Auf dem Server war ein ChatGPT-Konto
 * im kostenlosen Tarif angemeldet – Codex bot dort kein Bildwerkzeug an, und alle KI-Bilder fielen
 * still aus.
 *
 * Reihenfolge: zuerst der eingestellte Weg, danach jeder andere, der eingerichtet ist – API-Schlüssel
 * (eigener oder vom Admin freigegebener) für OpenAI, Google, Claude (Vektorgrafik), zuletzt das
 * ChatGPT-Abo. Scheitert ein Abo, wird es eine Weile übersprungen: Sonst liefe in einem Test mit
 * zehn Bildern jedes Bild erst eine Minute in denselben Fehler.
 */
import type { AppSettings, AiProviderId } from '@shared/types'

export interface BildWeg {
  provider: AiProviderId
  zugang: 'abo' | 'api'
}

export const weg = (w: BildWeg): string =>
  `${w.provider === 'openai' ? 'OpenAI' : w.provider === 'google' ? 'Google' : 'Claude'} (${w.zugang === 'abo' ? 'Abo' : 'API-Schlüssel'})`

/** Alle Wege in der Reihenfolge, in der sie versucht werden */
export function bildWege(ai: AppSettings['ai'], hatSchluessel: (p: AiProviderId) => boolean): BildWeg[] {
  const liste: BildWeg[] = []
  const dazu = (w: BildWeg): void => {
    if (!liste.some((x) => x.provider === w.provider && x.zugang === w.zugang)) liste.push(w)
  }
  const img = ai.imageProvider
  if (img && img !== 'none') {
    const zugang = ai.imageAccess[img] === 'subscription' ? 'abo' : 'api'
    // Der eingestellte Weg nur, wenn er überhaupt nutzbar ist (Schlüssel bzw. bestätigtes Abo)
    if (zugang === 'abo' ? ai.subscriptionAccepted[img] : hatSchluessel(img)) dazu({ provider: img, zugang })
  }
  for (const p of ['openai', 'google', 'anthropic'] as AiProviderId[]) if (hatSchluessel(p)) dazu({ provider: p, zugang: 'api' })
  // Abo nur bei OpenAI: Codex erzeugt echte Bilder; die anderen Programme können das nicht verlässlich
  if (ai.subscriptionAccepted.openai) dazu({ provider: 'openai', zugang: 'abo' })
  return liste
}

/** Abo-Wege, die gerade übersprungen werden – je Nutzer (Schlüssel: Datenordner) */
const pause = new Map<string, number>()
export const PAUSE_MS = 30 * 60 * 1000

export const pausiert = (nutzer: string, w: BildWeg, jetzt = Date.now()): boolean => w.zugang === 'abo' && (pause.get(`${nutzer}|${w.provider}`) ?? 0) > jetzt

export const pausieren = (nutzer: string, w: BildWeg, jetzt = Date.now()): void => void pause.set(`${nutzer}|${w.provider}`, jetzt + PAUSE_MS)

/**
 * Die Wege der Reihe nach versuchen. Ein Abbruch durch die Lehrkraft beendet sofort; jeder andere
 * Fehler führt zum nächsten Weg. Gemeldet wird, welcher Weg das Bild geliefert hat.
 */
export async function mitErsatz(
  wege: BildWeg[],
  nutzer: string,
  erzeuge: (w: BildWeg) => Promise<string>,
  istAbbruch: (e: unknown) => boolean,
  jetzt = Date.now
): Promise<{ bild: string; weg: BildWeg; fehler: { weg: BildWeg; text: string }[] }> {
  const fehler: { weg: BildWeg; text: string }[] = []
  const offen = wege.filter((w) => !pausiert(nutzer, w, jetzt()))
  // Alle Abos pausiert und sonst nichts eingerichtet: lieber doch noch einmal versuchen als gar nicht
  const reihe = offen.length ? offen : wege
  for (const w of reihe) {
    try {
      return { bild: await erzeuge(w), weg: w, fehler }
    } catch (e) {
      if (istAbbruch(e)) throw e
      fehler.push({ weg: w, text: e instanceof Error ? e.message : String(e) })
      if (w.zugang === 'abo') pausieren(nutzer, w, jetzt())
    }
  }
  if (!wege.length) throw new Error('Es ist keine KI für Bilder eingerichtet (Einstellungen › KI-Zugang).')
  const [erster] = fehler
  throw new Error(
    reihe.length > 1
      ? `Kein Bild erzeugt – alle Wege scheiterten: ${fehler.map((f) => `${weg(f.weg)}: ${f.text}`).join(' | ')}`
      : `${erster?.text ?? 'Kein Bild erzeugt.'} Als Ersatz lässt sich ein API-Schlüssel für Bilder (OpenAI oder Google) hinterlegen – eigener oder vom Admin freigegebener.`
  )
}
