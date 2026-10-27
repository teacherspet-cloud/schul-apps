/**
 * Bereits akzeptierte Alternativen (10.10.2026, Entscheidung der Lehrkraft).
 *
 * Akzeptiert die Lehrkraft im Onlinetest eines Vokabeltests eine Antwort, die laut Lösung falsch ist (Bild, Lücke, jede
 * Wort-Aufgabe), merkt sich der Server diese Antwort als „bereits akzeptierte Alternative" zum Wort – je Lehrkraft, Sprache
 * und Lösungswort, nur der Text mit Anzahl und Datum, ohne Bezug zur Person.
 *  - Lösungsblätter (Druck, PDF, Editor) nennen sie neben der Lösung: „schon einmal als richtig akzeptiert: X, Y" – auch in
 *    später erzeugten Tests mit demselben Wort.
 *  - In späteren Onlinetests zählt eine gleiche Antwort NICHT automatisch als richtig: Sie kommt nach „Zu entscheiden" mit
 *    dem Vermerk „Wurde schon einmal als richtig akzeptiert (n×)" – die Lehrkraft entscheidet („Wieder akzeptieren").
 *
 * Hier nur die reine Logik (Server: src/server/akzeptierteAlternativen.ts, Anzeige: akzeptiertSpeicher.ts).
 */
import { normalisiere, vergleiche, type Antworten, type Bewertung, type Einheit, type EinheitBewertung, type OnlineFassung } from './kern'

export interface AkzeptierteAlternative {
  /** Die Antwort, wie sie (normalisiert) geschrieben wurde */
  text: string
  /** Wie oft die Lehrkraft sie akzeptiert hat */
  anzahl: number
  /** Zuletzt akzeptiert (ISO-Datum) */
  zuletzt: string
}

/** Schlüssel des Lösungsworts → Lösungswort und seine akzeptierten Alternativen */
export type AkzeptiertListe = Record<string, { wort: string; alternativen: AkzeptierteAlternative[] }>

/** Fehlerart im Pop-up „Zu entscheiden" (gebündelt unter „Wortwahl / Synonym") */
export const SCHON_AKZEPTIERT_ART = 'schon einmal als richtig akzeptiert'

export const schonAkzeptiertVermerk = (n: number): string => `Wurde schon einmal als richtig akzeptiert (${n}×)`

const ARTIKEL = /^(to|a|an|the|le|la|les|l'|un|une|des|el|los|las|il|lo|gli|i|der|die|das|ein|eine|de|het)\s+/i

/** Vergleichsform: normalisiert, ohne Groß-/Kleinschreibung und ohne Artikel bzw. „to" am Anfang */
export function akzeptiertSchluessel(s: string): string {
  const n = normalisiere(s).toLowerCase()
  const ohne = n.replace(ARTIKEL, '').trim()
  return ohne || n
}

/**
 * Die laut Lösung falschen Wörter einer Einheit – nur wenn ALLES Übrige stimmt bzw. ebenfalls ein Wort ist: ein leeres
 * Feld, eine falsche Auswahl oder ein frei bewertetes Feld (KI/Lehrkraft) → null (dann wird nichts gemerkt bzw. erkannt).
 */
export function abweichendeWoerter(
  fassung: Pick<OnlineFassung, 'loesungen'>,
  einheit: Pick<Einheit, 'felder' | 'loesung'>,
  antworten: Antworten
): { feld: string; wort: string; antwort: string }[] | null {
  const aus: { feld: string; wort: string; antwort: string }[] = []
  for (const feld of einheit.felder) {
    const l = fassung.loesungen[einheit.loesung ?? feld]
    if (!l) continue
    const a = antworten[feld] ?? ''
    if (l.art === 'genau') {
      const v = vergleiche(a, l.werte, l.artikelFrei)
      if (v === 'leer') return null
      if (v !== 'richtig') {
        const wort = normalisiere(l.werte[0] ?? '')
        if (!wort) return null
        aus.push({ feld, wort, antwort: normalisiere(a).slice(0, 200) })
      }
    } else if (l.art === 'auswahl') {
      if (a !== l.wert) return null
    } else return null
  }
  return aus
}

/** Eine akzeptierte Antwort merken (Anzahl +1) */
export function merken(liste: AkzeptiertListe, wort: string, antwort: string, datum = new Date().toISOString()): AkzeptiertListe {
  const k = akzeptiertSchluessel(wort)
  const ak = akzeptiertSchluessel(antwort)
  if (!k || !ak || ak === k) return liste
  const eintrag = liste[k] ?? { wort: normalisiere(wort), alternativen: [] }
  const da = eintrag.alternativen.find((x) => akzeptiertSchluessel(x.text) === ak)
  const alternativen = da
    ? eintrag.alternativen.map((x) => (x === da ? { ...x, anzahl: x.anzahl + 1, zuletzt: datum } : x))
    : [...eintrag.alternativen, { text: normalisiere(antwort), anzahl: 1, zuletzt: datum }]
  return { ...liste, [k]: { ...eintrag, alternativen } }
}

/** Umentschieden (doch nicht akzeptiert): Anzahl −1, bei 0 entfernt */
export function zuruecknehmen(liste: AkzeptiertListe, wort: string, antwort: string): AkzeptiertListe {
  const k = akzeptiertSchluessel(wort)
  const ak = akzeptiertSchluessel(antwort)
  const eintrag = liste[k]
  if (!eintrag) return liste
  const alternativen = eintrag.alternativen
    .map((x) => (akzeptiertSchluessel(x.text) === ak ? { ...x, anzahl: x.anzahl - 1 } : x))
    .filter((x) => x.anzahl > 0)
  return mitEintrag(liste, k, { ...eintrag, alternativen })
}

/** Von der Lehrkraft entfernt (×): ganz vergessen */
export function entfernen(liste: AkzeptiertListe, wort: string, antwort: string): AkzeptiertListe {
  const k = akzeptiertSchluessel(wort)
  const ak = akzeptiertSchluessel(antwort)
  const eintrag = liste[k]
  if (!eintrag) return liste
  return mitEintrag(liste, k, { ...eintrag, alternativen: eintrag.alternativen.filter((x) => akzeptiertSchluessel(x.text) !== ak) })
}

function mitEintrag(liste: AkzeptiertListe, k: string, eintrag: AkzeptiertListe[string]): AkzeptiertListe {
  const neu = { ...liste }
  if (eintrag.alternativen.length) neu[k] = eintrag
  else delete neu[k]
  return neu
}

/** Schon einmal akzeptiert? */
export function treffer(liste: AkzeptiertListe, wort: string, antwort: string): AkzeptierteAlternative | undefined {
  const ak = akzeptiertSchluessel(antwort)
  return liste[akzeptiertSchluessel(wort)]?.alternativen.find((x) => akzeptiertSchluessel(x.text) === ak)
}

/**
 * Für das Lösungsblatt: die akzeptierten Alternativen zu einer Lösung – ohne die, die ohnehin schon als richtig gelten
 * (Lösung selbst, „auch richtig").
 */
export function alternativenFuerLoesung(liste: AkzeptiertListe | undefined, loesung: string, schonRichtig: string[] = []): string[] {
  if (!liste || !loesung.trim()) return []
  const eintrag = liste[akzeptiertSchluessel(loesung)]
  if (!eintrag) return []
  return eintrag.alternativen
    .filter((x) => vergleiche(x.text, [loesung, ...schonRichtig], true) === 'falsch')
    .sort((a, b) => b.anzahl - a.anzahl || a.text.localeCompare(b.text))
    .map((x) => x.text)
}

/**
 * Nach der Abgabe: Automatisch falsche Einheiten, deren abweichende Wörter alle schon einmal akzeptiert wurden, kommen nach
 * „Zu entscheiden" (0 Punkte bis zur Entscheidung, die KI fragt dafür nicht mehr).
 */
export function schonAkzeptiertMarkieren(
  fassung: Pick<OnlineFassung, 'einheiten' | 'loesungen'>,
  antworten: Antworten,
  bewertung: Bewertung,
  liste: AkzeptiertListe
): Bewertung {
  if (!Object.keys(liste).length) return bewertung
  const out: Bewertung = { ...bewertung }
  for (const e of fassung.einheiten) {
    const b = out[e.id]
    if (!b || b.status !== 'falsch' || b.quelle !== 'auto' || b.pruefen) continue
    const abw = abweichendeWoerter(fassung, e, antworten)
    if (!abw?.length) continue
    const t = abw.map((x) => treffer(liste, x.wort, x.antwort))
    if (t.some((x) => !x)) continue
    const n = Math.min(...t.map((x) => x!.anzahl))
    out[e.id] = {
      ...b,
      pruefen: 'sinnvoll',
      kiGeprueft: true,
      fehlerGruppe: 'wortwahl',
      fehlerArt: SCHON_AKZEPTIERT_ART,
      schonAkzeptiert: n,
      hinweis: [b.hinweis, schonAkzeptiertVermerk(n)].filter(Boolean).join('; ')
    } satisfies EinheitBewertung
  }
  return out
}
