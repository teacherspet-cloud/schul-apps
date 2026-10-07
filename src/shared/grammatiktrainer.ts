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

export type AufgabenArt = 'luecke' | 'auswahl' | 'umformen' | 'fehler' | 'satzbau' | 'bestimmen' | 'mehrfach' | 'tabelle' | 'uebersetzen'

/*
 * Aufgabenarten für Latein (07.10.2026, abgestimmt mit der Lehrkraft nach Recherche – KC Niedersachsen 2017,
 * Pontes/Campus/prima, Navigium):
 *  - bestimmen: eine Form nach Merkmalen bestimmen (Kasus/Numerus/Genus bzw. Person/Numerus/Tempus/Modus/Genus verbi).
 *    Einzelne Form: ALLE Lesarten verlangt (rosae = Gen. Sg./Dat. Sg./Nom. Pl.), Teilpunkte je richtiger Lesart; steht
 *    die Form in einem Satz, gilt nur die eine passende Lesart.
 *  - mehrfach: Auswahl mit mehreren richtigen Möglichkeiten.
 *  - tabelle: Paradigma bzw. Formentabelle ausfüllen (vorgegebene Zellen stehen schon da).
 *  - uebersetzen: Übersetzung (z. B. mit Kasusfunktion) – stimmt sie nicht wörtlich mit einer Musterlösung überein,
 *    vergleichen die Lernenden selbst mit der Musterlösung (die Lernenden lösen keine KI-Anfragen aus).
 * Längenzeichen (ā ē ī ō ū) zählen bei Antworten nicht – angezeigt werden sie trotzdem.
 */

/** Eine Lesart: je Merkmal ein Wert, in der Reihenfolge von `merkmale` */
export type Lesart = string[]

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
  /** bestimmen: die Form (steht sie im `satz`, gilt nur die Lesart im Satz) */
  form?: string
  /** bestimmen: Merkmale in Reihenfolge, z. B. ["Kasus", "Numerus", "Genus"] */
  merkmale?: string[]
  /** bestimmen: wählbare Werte je Merkmal (gleiche Reihenfolge wie `merkmale`) */
  werte?: string[][]
  /** bestimmen: alle richtigen Lesarten */
  lesarten?: Lesart[]
  /** tabelle: Spaltenköpfe (ohne die erste Spalte mit den Zeilennamen), z. B. ["Singular", "Plural"] */
  spalten?: string[]
  /** tabelle: Zeilen mit Namen (z. B. „Nom."), Lösungen je Spalte und vorgegebenen Zellen */
  zeilen?: { name: string; loesungen: string[]; vorgabe?: boolean[] }[]
}

export interface GrammatikPaket {
  thema: string
  regeln: GrammatikRegel[]
  aufgaben: GrammatikAufgabe[]
}

export const ARTEN: AufgabenArt[] = ['luecke', 'auswahl', 'umformen', 'fehler', 'satzbau', 'bestimmen', 'mehrfach', 'tabelle', 'uebersetzen']
export const ART_NAME: Record<AufgabenArt, string> = {
  luecke: 'Lücke',
  auswahl: 'Auswahl',
  umformen: 'Umformen',
  fehler: 'Fehler finden',
  satzbau: 'Satzbau',
  bestimmen: 'Bestimmen',
  mehrfach: 'Mehrfachauswahl',
  tabelle: 'Tabelle',
  uebersetzen: 'Übersetzen'
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
      regelId: regelIds.has(String(y.regelId)) ? String(y.regelId) : regeln[0]?.id ?? '',
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
    if (art === 'bestimmen') {
      a.form = text(y.form, 80)
      a.merkmale = liste(y.merkmale, 6, 40)
      a.werte = (Array.isArray(y.werte) ? y.werte : []).slice(0, a.merkmale.length).map((w) => liste(w, 12, 40))
      // Lesarten nur mit Werten, die es zur Auswahl gibt; doppelte weg
      const lesarten = (Array.isArray(y.lesarten) ? y.lesarten : [])
        .map((l) => liste(l, 6, 40))
        .filter((l) => l.length === a.merkmale!.length && l.every((w, j) => a.werte![j]?.some((x) => gleich(x, w))))
      a.lesarten = lesarten.filter((l, i) => lesarten.findIndex((m) => lesartGleich(l, m)) === i).slice(0, 8)
      if (!a.form || a.merkmale.length < 1 || a.werte.length !== a.merkmale.length || !a.lesarten.length) continue
      a.loesungen = a.lesarten.map((l) => l.join(' '))
    }
    if (art === 'mehrfach') {
      a.optionen = liste(y.optionen, 8, 120)
      a.loesungen = a.loesungen.filter((l) => a.optionen!.some((o) => gleich(o, l)))
      if (a.optionen.length < 3 || !a.loesungen.length) continue
    }
    if (art === 'tabelle') {
      a.spalten = liste(y.spalten, 6, 40)
      a.zeilen = (Array.isArray(y.zeilen) ? y.zeilen : []).slice(0, 12).map((z) => {
        const q = (z ?? {}) as Record<string, unknown>
        const loes = (Array.isArray(q.loesungen) ? q.loesungen : []).slice(0, a.spalten!.length).map((x) => text(x, 80))
        const vorgabe = Array.isArray(q.vorgabe) ? q.vorgabe.slice(0, a.spalten!.length).map(Boolean) : []
        return { name: text(q.name, 40), loesungen: loes, ...(vorgabe.some(Boolean) ? { vorgabe } : {}) }
      })
      const offen = a.zeilen.flatMap((z) => z.loesungen.filter((l, j) => l && !z.vorgabe?.[j]))
      if (!a.spalten.length || a.zeilen.length < 2 || a.zeilen.some((z) => z.loesungen.length !== a.spalten!.length) || offen.length < 2) continue
      a.loesungen = [offen.join(' | ')]
    }
    if (art === 'uebersetzen' && !a.satz) continue
    if (!a.satz && art !== 'satzbau' && art !== 'bestimmen' && art !== 'tabelle' && art !== 'mehrfach') continue
    if (!a.loesungen.length) continue
    if ((art === 'luecke' || art === 'auswahl') && !a.satz.includes('___')) continue
    if (art === 'auswahl' && (!a.optionen || a.optionen.length < 2 || !a.optionen.some((o) => gleich(o, a.loesungen[0])))) continue
    if (art === 'fehler' && (!a.fehlerWort || !woerterVon(a.satz).some((w) => gleich(w, a.fehlerWort!)))) continue
    if (art === 'satzbau' && (a.teile?.length ?? 0) < 3) continue
    const schluessel = `${art}|${a.satz}|${a.form ?? ''}|${a.loesungen[0]}`.toLowerCase()
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    aufgaben.push(a)
    if (aufgaben.length >= 80) break
  }
  return { thema: text(r.thema, 160) || thema, regeln, aufgaben }
}

/** Längenzeichen (Makron, Breve) weg: „rosā" = „rosa" – zählen bei Antworten nicht (Latein, 07.10.2026) */
export const ohneLaengen = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0304\u0306]/g, '')
    .normalize('NFC')

/** Für den Vergleich: Kleinschreibung, typografische Zeichen vereinheitlicht, Satzzeichen am Ende und Längenzeichen egal */
export function normiert(s: string): string {
  return ohneLaengen(s)
    .normalize('NFC')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s*([.,!?;:])\s*$/g, '')
    .trim()
    .toLowerCase()
}
const gleich = (a: string, b: string): boolean => normiert(a) === normiert(b)
/** Merkmalswerte vergleichen: „Gen." = „Genitiv" = „gen" (Abkürzung oder ausgeschrieben, Punkt egal) */
const KURZ: Record<string, string> = {
  sg: 'singular',
  pl: 'plural',
  m: 'maskulinum',
  f: 'femininum',
  n: 'neutrum',
  akt: 'aktiv',
  pass: 'passiv',
  präs: 'präsens',
  impf: 'imperfekt',
  perf: 'perfekt',
  plusqpf: 'plusquamperfekt',
  fut: 'futur',
  ind: 'indikativ',
  konj: 'konjunktiv',
  imp: 'imperativ',
  nom: 'nominativ',
  gen: 'genitiv',
  dat: 'dativ',
  akk: 'akkusativ',
  abl: 'ablativ',
  vok: 'vokativ'
}
/** Wert ausgeschrieben: „Fut. I" → „futur i", „Sg." → „singular" */
const ausgeschrieben = (s: string): string =>
  normiert(s)
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => KURZ[t] ?? t)
    .join(' ')
const wertGleich = (a: string, b: string): boolean => ausgeschrieben(a) === ausgeschrieben(b)
const lesartGleich = (a: Lesart, b: Lesart): boolean => a.length === b.length && a.every((w, i) => wertGleich(w, b[i]))

/** Antwort einer Bestimmungs-, Mehrfach- oder Tabellenaufgabe aus dem Text (JSON) lesen */
function jsonListe(s: string): unknown[] {
  try {
    const x = JSON.parse(s)
    return Array.isArray(x) ? x : []
  } catch {
    return []
  }
}

/**
 * Bestimmung bewerten (Teilpunkte): Anteil der richtigen Lesarten, falsche ziehen ab.
 * 1 = alle Lesarten und keine falsche; 0 = keine richtige.
 */
export function bestimmungsAnteil(a: GrammatikAufgabe, angegeben: Lesart[]): { anteil: number; richtig: number; falsch: number; gesamt: number } {
  const soll = a.lesarten ?? []
  const eindeutig = angegeben.filter((l, i) => angegeben.findIndex((m) => lesartGleich(l, m)) === i)
  const richtig = soll.filter((s) => eindeutig.some((l) => lesartGleich(l, s))).length
  const falsch = eindeutig.filter((l) => !soll.some((s) => lesartGleich(l, s))).length
  const anteil = soll.length ? Math.max(0, (richtig - falsch) / soll.length) : 0
  return { anteil, richtig, falsch, gesamt: soll.length }
}

/** Tabelle bewerten: Anteil der richtig gefüllten offenen Zellen (Längenzeichen egal, Varianten mit „/") */
export function tabellenAnteil(a: GrammatikAufgabe, zellen: string[][]): number {
  let n = 0
  let ok = 0
  for (const [i, z] of (a.zeilen ?? []).entries())
    for (const [j, l] of z.loesungen.entries()) {
      if (!l || z.vorgabe?.[j]) continue
      n++
      const ant = String(zellen[i]?.[j] ?? '')
      if (l.split('/').some((v) => gleich(v, ant))) ok++
    }
  return n ? ok / n : 0
}

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
export function pruefeGrammatik(a: GrammatikAufgabe, antwort: string, gewaehltesWort?: string, selbst?: Urteil): { urteil: Urteil; richtig: string } {
  const richtig = a.loesungen[0] ?? ''
  if (a.art === 'bestimmen') {
    const angegeben = jsonListe(antwort)
      .filter(Array.isArray)
      .map((l) => (l as unknown[]).map((w) => String(w ?? '')))
    const b = bestimmungsAnteil(a, angegeben)
    const alle = (a.lesarten ?? []).map((l) => l.join(' ')).join(' / ')
    return { urteil: b.anteil >= 1 ? 'richtig' : b.richtig > 0 ? 'fast' : 'falsch', richtig: alle }
  }
  if (a.art === 'mehrfach') {
    const gewaehlt = jsonListe(antwort).map(String)
    const soll = a.loesungen
    const treffer = soll.filter((s) => gewaehlt.some((g) => gleich(g, s))).length
    const falsch = gewaehlt.filter((g) => !soll.some((s) => gleich(g, s))).length
    return { urteil: treffer === soll.length && !falsch ? 'richtig' : treffer > falsch ? 'fast' : 'falsch', richtig: soll.join(' / ') }
  }
  if (a.art === 'tabelle') {
    const zellen = jsonListe(antwort).map((z) => (Array.isArray(z) ? z.map((w) => String(w ?? '')) : []))
    const anteil = tabellenAnteil(a, zellen)
    return { urteil: anteil >= 1 ? 'richtig' : anteil >= 0.75 ? 'fast' : 'falsch', richtig }
  }
  if (a.art === 'uebersetzen') {
    // Wörtlich wie eine Musterlösung = richtig; sonst entscheidet der Vergleich der Lernenden (`selbst`)
    if (a.loesungen.some((l) => gleich(l, antwort))) return { urteil: 'richtig', richtig }
    return { urteil: selbst ?? 'falsch', richtig }
  }
  if (a.art === 'fehler' && gewaehltesWort !== undefined && a.fehlerWort && !gleich(gewaehltesWort, a.fehlerWort)) return { urteil: 'falsch', richtig }
  const ant = normiert(antwort)
  if (!ant) return { urteil: 'falsch', richtig }
  if (a.loesungen.some((l) => normiert(l) === ant)) return { urteil: 'richtig', richtig }
  if (a.art === 'umformen' && ant.length > 12 && a.loesungen.some((l) => abstand(normiert(l), ant) === 1)) return { urteil: 'fast', richtig }
  return { urteil: 'falsch', richtig }
}

/** Ids der Aufgaben als „Vokabeln" – damit Übersicht und Tagesration des Vokabeltrainers sie verwalten können */
export const alsKarten = (aufgaben: GrammatikAufgabe[]): { id: string; term: string; translation: string }[] =>
  aufgaben.map((a) => ({ id: a.id, term: a.satz || a.form || a.anweisung || a.loesungen[0], translation: a.loesungen[0] }))

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
