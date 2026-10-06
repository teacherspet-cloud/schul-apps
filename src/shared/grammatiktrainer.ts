/**
 * Grammatik-Lern-App (06.10.2026, abgestimmt mit der Lehrkraft) – Grundgerüst wie die Vokabel-Lern-App.
 *
 *  - Die Lehrkraft gibt ein Grammatikthema für eine Lerngruppe, Einzelne oder per QR-Code frei. Beim Freigeben erzeugt
 *    die KI (Zugang der Lehrkraft) EINMAL einen geprüften Pool: kurze Regelkarten und rund 40 Aufgaben je Thema und
 *    Niveau. Die Lernenden lösen keine KI-Anfragen aus.
 *  - Jede Aufgabe ist eine Karte im Kasten (fällig / wackelig / sicher) – dieselben Fächer und Abstände wie bei den
 *    Vokabeln (shared/vokabeltrainer.ts `nachAbfrage`, Übung „frei").
 *  - Nach der Tagesration Spiele: Fehler finden, Satzbau-Puzzle, Formen-Blitz, Regel zuordnen (nur eigener Rekord).
 *
 * Hier die reinen Regeln (ohne Oberfläche) für Server, Oberfläche und Tests.
 */
import { abstand, type Urteil } from './vokabeltrainer'

export type AufgabenArt = 'luecke' | 'auswahl' | 'umformen' | 'fehler' | 'satzbau'

export interface GrammatikRegel {
  id: string
  titel: string
  /** Kurze Erklärung auf Deutsch (2–4 Sätze) */
  erklaerung: string
  beispiele: string[]
}

export interface GrammatikAufgabe {
  id: string
  art: AufgabenArt
  regelId: string
  /** Kurze Arbeitsanweisung (deutsch) */
  anweisung: string
  /** luecke: Satz mit „___"; umformen: Ausgangssatz; fehler: Satz mit genau einem Fehler; auswahl: Satz mit „___" */
  satz: string
  /** luecke/umformen: Vorgabe, z. B. Grundform „(to go)" oder „Verneine den Satz." */
  vorgabe?: string
  /** Alle richtigen Antworten (luecke/umformen: Wort bzw. ganzer Satz; fehler: die Korrektur; satzbau: der ganze Satz) */
  loesungen: string[]
  /** auswahl: 3–4 Möglichkeiten (die richtige dabei) */
  optionen?: string[]
  /** fehler: das falsche Wort, wie es im Satz steht */
  fehlerWort?: string
  /** satzbau: die Satzteile in RICHTIGER Reihenfolge */
  teile?: string[]
  /** Warum (kurz, deutsch) – nach der Antwort gezeigt */
  erklaerung?: string
}

export interface GrammatikPaket {
  thema: string
  regeln: GrammatikRegel[]
  aufgaben: GrammatikAufgabe[]
}

export const ARTEN: AufgabenArt[] = ['luecke', 'auswahl', 'umformen', 'fehler', 'satzbau']
export const ART_NAME: Record<AufgabenArt, string> = {
  luecke: 'Lücke',
  auswahl: 'Auswahl',
  umformen: 'Umformen',
  fehler: 'Fehler finden',
  satzbau: 'Satzbau'
}

const text = (x: unknown, n = 400): string =>
  String(x ?? '')
    .trim()
    .slice(0, n)
const liste = (x: unknown, n = 12, m = 200): string[] =>
  Array.isArray(x)
    ? x
        .map((y) => text(y, m))
        .filter(Boolean)
        .slice(0, n)
    : []

/**
 * Paket der KI (oder vom Server gespeichert) bereinigen und unbrauchbare Aufgaben aussortieren: ohne Lösung, Lücke ohne
 * „___", Auswahl ohne die Lösung unter den Möglichkeiten, Fehler-Aufgabe, deren Fehlerwort nicht im Satz steht,
 * Satzbau mit weniger als drei Teilen. Höchstens 80 Aufgaben, 12 Regeln.
 */
export function paketBereinigt(roh: unknown, thema = ''): GrammatikPaket {
  const r = (roh ?? {}) as Record<string, unknown>
  const regeln: GrammatikRegel[] = (Array.isArray(r.regeln) ? r.regeln : [])
    .slice(0, 12)
    .map((x, i) => {
      const y = (x ?? {}) as Record<string, unknown>
      return {
        id: /^[a-z0-9-]{1,30}$/i.test(String(y.id ?? '')) ? String(y.id) : `r${i + 1}`,
        titel: text(y.titel, 120),
        erklaerung: text(y.erklaerung, 900),
        beispiele: liste(y.beispiele, 6, 240)
      }
    })
    .filter((x) => x.titel && x.erklaerung)
  const regelIds = new Set(regeln.map((x) => x.id))
  const gesehen = new Set<string>()
  const aufgaben: GrammatikAufgabe[] = []
  for (const [i, x] of (Array.isArray(r.aufgaben) ? r.aufgaben : []).slice(0, 120).entries()) {
    const y = (x ?? {}) as Record<string, unknown>
    const art = String(y.art ?? '') as AufgabenArt
    if (!ARTEN.includes(art)) continue
    const a: GrammatikAufgabe = {
      id: `a${i + 1}`,
      art,
      regelId: regelIds.has(String(y.regelId)) ? String(y.regelId) : (regeln[0]?.id ?? ''),
      anweisung: text(y.anweisung, 200),
      satz: text(y.satz, 400),
      ...(text(y.vorgabe, 200) ? { vorgabe: text(y.vorgabe, 200) } : {}),
      loesungen: liste(y.loesungen, 6, 400),
      ...(art === 'auswahl' ? { optionen: liste(y.optionen, 5, 120) } : {}),
      ...(art === 'fehler' && text(y.fehlerWort, 80) ? { fehlerWort: text(y.fehlerWort, 80) } : {}),
      ...(art === 'satzbau' ? { teile: liste(y.teile, 16, 80) } : {}),
      ...(text(y.erklaerung, 400) ? { erklaerung: text(y.erklaerung, 400) } : {})
    }
    if (art === 'satzbau' && !a.loesungen.length && a.teile?.length) a.loesungen = [a.teile.join(' ')]
    if (!a.satz && art !== 'satzbau') continue
    if (!a.loesungen.length) continue
    if ((art === 'luecke' || art === 'auswahl') && !a.satz.includes('___')) continue
    if (art === 'auswahl' && (!a.optionen || a.optionen.length < 2 || !a.optionen.some((o) => gleich(o, a.loesungen[0])))) continue
    if (art === 'fehler' && (!a.fehlerWort || !woerterVon(a.satz).some((w) => gleich(w, a.fehlerWort!)))) continue
    if (art === 'satzbau' && (a.teile?.length ?? 0) < 3) continue
    const schluessel = `${art}|${a.satz}|${a.loesungen[0]}`.toLowerCase()
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    aufgaben.push(a)
    if (aufgaben.length >= 80) break
  }
  return { thema: text(r.thema, 160) || thema, regeln, aufgaben }
}

/** Für den Vergleich: Kleinschreibung, typografische Zeichen vereinheitlicht, Satzzeichen am Ende egal */
export function normiert(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s*([.,!?;:])\s*$/g, '')
    .trim()
    .toLowerCase()
}
const gleich = (a: string, b: string): boolean => normiert(a) === normiert(b)

/** Wörter eines Satzes (Satzzeichen ab) – für „Fehler finden" */
export function woerterVon(satz: string): string[] {
  return satz
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ''))
    .filter(Boolean)
}

/**
 * Antwort prüfen. Ganz oder gar nicht; „fast" nur bei einem einzelnen Tippfehler in langen Antworten (Umformen),
 * nicht bei kurzen Formen – „goes"/„gos" ist ein Grammatikfehler, kein Tippfehler.
 * `antwort` je Art: luecke/umformen/fehler = Text (bei fehler die Korrektur), auswahl = gewählte Möglichkeit,
 * satzbau = Teile in gelegter Reihenfolge, mit Leerzeichen verbunden.
 */
export function pruefeGrammatik(a: GrammatikAufgabe, antwort: string, gewaehltesWort?: string): { urteil: Urteil; richtig: string } {
  const richtig = a.loesungen[0] ?? ''
  if (a.art === 'fehler' && gewaehltesWort !== undefined && a.fehlerWort && !gleich(gewaehltesWort, a.fehlerWort)) return { urteil: 'falsch', richtig }
  const ant = normiert(antwort)
  if (!ant) return { urteil: 'falsch', richtig }
  if (a.loesungen.some((l) => normiert(l) === ant)) return { urteil: 'richtig', richtig }
  if (a.art === 'umformen' && ant.length > 12 && a.loesungen.some((l) => abstand(normiert(l), ant) === 1)) return { urteil: 'fast', richtig }
  return { urteil: 'falsch', richtig }
}

/** Ids der Aufgaben als „Vokabeln" – damit Übersicht und Tagesration des Vokabeltrainers sie verwalten können */
export const alsKarten = (aufgaben: GrammatikAufgabe[]): { id: string; term: string; translation: string }[] =>
  aufgaben.map((a) => ({ id: a.id, term: a.satz || a.loesungen[0], translation: a.loesungen[0] }))

// ---------------------------------------------------------------- Spiele

export type GrammatikSpielId = 'fehlerjagd' | 'satzbaupuzzle' | 'formenblitz' | 'regelzuordnen'

export const GRAMMATIK_SPIELE: { id: GrammatikSpielId; name: string; einheit: string; kleinerBesser: boolean; beschreibung: string; braucht: AufgabenArt[] }[] =
  [
    {
      id: 'fehlerjagd',
      name: 'Fehler finden',
      einheit: 'richtig',
      kleinerBesser: false,
      beschreibung: 'Das falsche Wort antippen und verbessern.',
      braucht: ['fehler']
    },
    {
      id: 'satzbaupuzzle',
      name: 'Satzbau-Puzzle',
      einheit: 'Sätze',
      kleinerBesser: false,
      beschreibung: 'Die Wörter in die richtige Reihenfolge bringen.',
      braucht: ['satzbau']
    },
    {
      id: 'formenblitz',
      name: 'Formen-Blitz',
      einheit: 'richtig',
      kleinerBesser: false,
      beschreibung: '60 Sekunden – die richtige Form wählen.',
      braucht: ['auswahl']
    },
    {
      id: 'regelzuordnen',
      name: 'Regel zuordnen',
      einheit: 'richtig',
      kleinerBesser: false,
      beschreibung: 'Zum Beispielsatz die passende Regel finden.',
      braucht: []
    }
  ]

export const grammatikRekord = (spiel: GrammatikSpielId, wert: number, bisher: number | undefined): boolean =>
  bisher === undefined || (GRAMMATIK_SPIELE.find((s) => s.id === spiel)?.kleinerBesser ? wert < bisher : wert > bisher)

/** Beispielsätze mit ihrer Regel (für „Regel zuordnen"): Beispiele der Regelkarten und gelöste Lückensätze */
export function regelBeispiele(p: GrammatikPaket): { satz: string; regelId: string }[] {
  const aus = p.regeln.flatMap((r) => r.beispiele.map((b) => ({ satz: b, regelId: r.id })))
  for (const a of p.aufgaben)
    if ((a.art === 'luecke' || a.art === 'auswahl') && a.satz.includes('___')) aus.push({ satz: a.satz.replace('___', a.loesungen[0]), regelId: a.regelId })
  return aus
}
