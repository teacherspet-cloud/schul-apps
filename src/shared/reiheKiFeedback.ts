/**
 * Neues KI-Feedback in Unterrichtsreihen (08.10.2026, Plan „Unterrichtsreihe" E.6, abgestimmt):
 *  - Abschlussprodukt: KI-VORSCHLAG nach dem Bewertungsraster – Teilpunkte und Begründung je Kriterium, nur für die
 *    Lehrkraft (Korrektur-Eingang/Übersicht). Lernende sehen erst die von der Lehrkraft bestätigte Bewertung; in
 *    digitalen Reihen entscheiden die Einschätzungen über „geschafft" (shared/reihe.ts `einzelStatus`).
 *  - Selbsteinschätzung: kurzer, freundlicher IMPULS bzw. eine Nachfrage zum Lerntagebuch – kein Urteil, keine Note.
 * Beides läuft am Server im Namen der Lehrkraft (ihr Kontingent) über den zentralen Namensfilter; der eigene Name der
 * Person wird vorher zusätzlich durch ein Kürzel ersetzt (`ohneEigenenNamen`).
 */
import type { StructuredRequest } from './types'
import type { AbschlussVorschlag, VorschlagKriterium } from './reihe'

/** Teilpunkte je Kriterium */
export const PUNKTE_JE_KRITERIUM = 3

/** Einschätzung aus Teilpunkten (wie beim KI-Bogen: sicher / teilweise / noch nicht) – nicht der KI überlassen */
export function einschaetzungAus(punkte: number, max: number): VorschlagKriterium['einschaetzung'] {
  const anteil = max > 0 ? punkte / max : 0
  return anteil >= 0.85 ? 'sicher' : anteil >= 0.34 ? 'teilweise' : 'noch nicht'
}

/** Eigenen Namen (alle Namensteile ab zwei Buchstaben) durch ein Kürzel ersetzen – vor jedem KI-Aufruf */
export function ohneEigenenNamen(text: string, name: string, kuerzel = 'S1'): string {
  const teile = name
    .split(/[\s,.-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length)
  let aus = text
  for (const t of teile) {
    const muster = new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu')
    aus = aus.replace(muster, kuerzel)
  }
  return aus
}

export interface AbschlussEingabe {
  titel: string
  anweisung: string
  /** Bewertungsraster; leer = Lernziele bzw. „Auftrag erfüllt" */
  raster: string[]
  lernziele: string[]
  fach: string
  jahrgang: number
  /** Text der Abgabe (schon ohne Namen) */
  text: string
  /** Fotos der Abgabe (data:-URLs) */
  bilder: string[]
  /** Zahl der Dateien, die die KI nicht sehen kann (Video, PDF …) */
  andereDateien: number
}

/** Kriterien des Vorschlags: Raster, sonst die Lernziele, sonst der Auftrag selbst */
export const kriterienFuer = (e: Pick<AbschlussEingabe, 'raster' | 'lernziele'>): string[] => {
  const raster = e.raster.map((k) => k.trim()).filter(Boolean)
  if (raster.length) return raster.slice(0, 12)
  const ziele = e.lernziele.map((k) => k.trim()).filter(Boolean)
  return ziele.length ? ziele.slice(0, 8) : ['Auftrag erfüllt']
}

export function abschlussVorschlagAnfrage(e: AbschlussEingabe): StructuredRequest {
  const kriterien = kriterienFuer(e)
  return {
    system:
      'Du bist eine erfahrene Lehrkraft und bereitest die Bewertung eines Lernprodukts (Abschluss einer Unterrichtsreihe) vor. Dein Vorschlag geht NUR an die Lehrkraft; sie entscheidet. Bewerte fair, nachvollziehbar und am Raster.',
    user: [
      `FACH: ${e.fach} · JAHRGANG: ${e.jahrgang}`,
      `LERNPRODUKT: ${e.titel}`,
      `AUFTRAG:\n${e.anweisung || '(siehe Titel)'}`,
      e.lernziele.length ? `LERNZIELE:\n${e.lernziele.map((z) => `- ${z}`).join('\n')}` : '',
      `BEWERTUNGSRASTER – bewerte GENAU diese Kriterien in dieser Reihenfolge, je 0 bis ${PUNKTE_JE_KRITERIUM} Teilpunkte:`,
      kriterien.map((k, i) => `${i + 1}. ${k}`).join('\n'),
      'REGELN:',
      `- punkte: ganze Zahl 0–${PUNKTE_JE_KRITERIUM} (${PUNKTE_JE_KRITERIUM} = voll erfüllt, 0 = nicht erkennbar).`,
      '- begruendung: ein bis zwei Sätze mit konkretem Beleg aus dem Produkt (kurzes Zitat oder was auf dem Foto zu sehen ist); was du nicht sehen kannst, bewertest du nicht als fehlend, sondern sagst es.',
      '- gesamt: zwei bis drei Sätze Gesamteindruck für die Lehrkraft, mit dem wichtigsten nächsten Schritt.',
      e.bilder.length ? '- Die beigefügten Bilder sind Fotos des Produkts – beziehe sie ein.' : '',
      e.andereDateien
        ? `- Es gibt ${e.andereDateien} weitere Datei(en) (z. B. Video, PDF), die du nicht sehen kannst – sage das in „gesamt".`
        : '',
      'ABGABE (zwischen <<< und >>>):',
      `<<<\n${e.text.trim() || '(nur Foto bzw. Datei)'}\n>>>`
    ]
      .filter(Boolean)
      .join('\n'),
    ...(e.bilder.length ? { images: e.bilder.slice(0, 4) } : {}),
    schemaName: 'reihe_abschluss_vorschlag',
    schema: {
      type: 'object',
      properties: {
        kriterien: {
          type: 'array',
          items: {
            type: 'object',
            properties: { kriterium: { type: 'string' }, punkte: { type: 'number' }, begruendung: { type: 'string' } },
            required: ['kriterium', 'punkte', 'begruendung'],
            additionalProperties: false
          }
        },
        gesamt: { type: 'string' }
      },
      required: ['kriterien', 'gesamt'],
      additionalProperties: false
    }
  }
}

/** Antwort der KI prüfen: genau die Kriterien des Rasters, Punkte begrenzt, Einschätzung selbst berechnet */
export function abschlussVorschlagAus(roh: unknown, e: Pick<AbschlussEingabe, 'raster' | 'lernziele'>, zeit = Date.now()): AbschlussVorschlag {
  const r = (roh ?? {}) as Record<string, unknown>
  const liste = (Array.isArray(r.kriterien) ? r.kriterien : []).map((x) => (x ?? {}) as Record<string, unknown>)
  const namen = kriterienFuer(e)
  const norm = (t: unknown): string => String(t ?? '').trim().toLocaleLowerCase('de')
  // Zuerst nach Wortlaut, die übrigen Kriterien nach Stelle aus den nicht zugeordneten Antworten
  const nachName = namen.map((k) => liste.find((x) => norm(x.kriterium) === norm(k)))
  const uebrig = liste.filter((x) => !nachName.includes(x))
  const kriterien = namen.map((k, i): VorschlagKriterium => {
    const treffer = nachName[i] ?? uebrig.shift() ?? {}
    const p = Number(treffer.punkte)
    const punkte = Number.isFinite(p) ? Math.max(0, Math.min(PUNKTE_JE_KRITERIUM, Math.round(p))) : 0
    return {
      kriterium: k,
      punkte,
      max: PUNKTE_JE_KRITERIUM,
      einschaetzung: einschaetzungAus(punkte, PUNKTE_JE_KRITERIUM),
      begruendung: String(treffer.begruendung ?? '')
        .trim()
        .slice(0, 600)
    }
  })
  const gesamt = String(r.gesamt ?? '')
    .trim()
    .slice(0, 1200)
  return { kriterien, ...(gesamt ? { gesamt } : {}), zeit }
}

/** Summe für die Anzeige („5 / 9 Punkte") */
export const vorschlagSumme = (v: AbschlussVorschlag): { punkte: number; max: number } => ({
  punkte: v.kriterien.reduce((n, k) => n + k.punkte, 0),
  max: v.kriterien.reduce((n, k) => n + k.max, 0)
})

export interface ReflexionEingabe {
  frage: string
  /** Lerntagebuch (schon ohne Namen) */
  tagebuch: string
  /** Selbsteinschätzung je Lernziel */
  ampel: { ziel: string; farbe: 'gruen' | 'gelb' | 'rot' }[]
  fach: string
  jahrgang: number
}

const FARBE: Record<string, string> = { gruen: 'sicher', gelb: 'teilweise', rot: 'noch nicht' }

export function reflexionImpulsAnfrage(e: ReflexionEingabe): StructuredRequest {
  return {
    system:
      'Du begleitest Lernende freundlich beim Nachdenken über ihr Lernen. Du bewertest NICHT, gibst keine Note und kein Urteil über richtig oder falsch. Sprich die Person mit „du" an, altersgerecht und warm.',
    user: [
      `FACH: ${e.fach} · JAHRGANG: ${e.jahrgang}`,
      e.ampel.length ? `SELBSTEINSCHÄTZUNG:\n${e.ampel.map((a) => `- ${a.ziel}: ${FARBE[a.farbe] ?? a.farbe}`).join('\n')}` : '',
      `FRAGE IM LERNTAGEBUCH: ${e.frage}`,
      'EINTRAG (zwischen <<< und >>>):',
      `<<<\n${e.tagebuch.trim()}\n>>>`,
      'AUFGABE: Schreibe EINEN kurzen Impuls (höchstens drei Sätze): greife einen Gedanken aus dem Eintrag wertschätzend auf und stelle eine offene Nachfrage oder gib eine kleine Anregung, wie es weitergehen kann (z. B. bei „noch nicht" eine konkrete, machbare Übungsidee). Kein Lob in Floskeln, keine Bewertung, keine Note, keine Namen.'
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'reihe_reflexion_impuls',
    schema: {
      type: 'object',
      properties: { impuls: { type: 'string' } },
      required: ['impuls'],
      additionalProperties: false
    }
  }
}

export function reflexionImpulsAus(roh: unknown): string {
  return String(((roh ?? {}) as Record<string, unknown>).impuls ?? '')
    .trim()
    .slice(0, 600)
}
