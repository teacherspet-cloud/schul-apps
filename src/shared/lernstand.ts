/**
 * Lernstand der Lernenden für die Startseite (06.10.2026, abgestimmt mit der Lehrkraft; Recherche
 * recherche/schueler-startseite-lerntipps-2026-10-06.md, Abschnitt 4).
 *
 * Reine Logik ohne Server und Oberfläche – damit sie geprüft werden kann (tests/lernstand.test.ts):
 *  - Jahrgang aus der Klasse („7a" → 7, „Q1" → 12), daraus die Altersstufe (1–4, 5–6, 7–10, 11–13)
 *  - zwei getrennte Achsen: Fleiß (Übungstage der letzten 7–14 Tage) und Leistung (individueller
 *    Stand und Trend gegenüber früher – nie gegen andere)
 *  - daraus der Zustand der Begrüßung (erfolgreich + fleißig, fleißig, erfolgreich + wenig aktiv,
 *    länger inaktiv, neu, sonst neutral)
 *  - Wochenserie statt Tagesserie: eine Woche zählt, wenn das eigene Wochenziel erreicht ist; eine
 *    Woche Pause (Ferien, Krankheit) unterbricht die Serie nicht
 *  - feste Lerntipps aus einer Regel-Liste (ohne KI) und die Prüfung von KI-Tipps
 */

export type Stufe = 'grund' | 'unter' | 'mittel' | 'ober' | 'neutral'
export type Zustand = 'erfolgreich_fleissig' | 'fleissig' | 'erfolgreich' | 'inaktiv' | 'neu' | 'neutral'
export type Strategie = 'abruf' | 'verteilen' | 'interleaving' | 'selbsterklaerung' | 'elaboration' | 'fehleranalyse' | 'planung'

export const TAG_MS = 86_400_000

/** Jahrgang aus einem Klassen- oder Gruppennamen: „7a", „Klasse 10b", „5.2", „Q1" (→ 12), „EF" (→ 11); sonst null */
export function jahrgangAus(text: string | null | undefined): number | null {
  const t = (text ?? '').trim()
  if (!t) return null
  // Oberstufe nach Kursjahren (NRW, Niedersachsen u. a.)
  const q = /(?:^|[^a-z])(?:q|qp)\s?([12])(?![0-9])/i.exec(t)
  if (q) return q[1] === '1' ? 12 : 13
  if (/(?:^|[^a-z])(?:ef|e[12]|ep)(?![a-z0-9])/i.test(t)) return 11
  const m = /(?:^|\D)(\d{1,2})(?!\d)/.exec(t)
  if (!m) return null
  const j = Number(m[1])
  return j >= 1 && j <= 13 ? j : null
}

export function stufeVon(jahrgang: number | null | undefined): Stufe {
  if (!jahrgang) return 'neutral'
  if (jahrgang <= 4) return 'grund'
  if (jahrgang <= 6) return 'unter'
  if (jahrgang <= 10) return 'mittel'
  return 'ober'
}

// ---------------------------------------------------------------- Fleiß

export interface Fleiss {
  /** Übungstage in den letzten 7 bzw. 14 Tagen (heute eingeschlossen) */
  tage7: number
  tage14: number
  /** Tage seit der letzten Übung (0 = heute); null = noch nie */
  seitTagen: number | null
  fleissig: boolean
}

const tagNr = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / TAG_MS)
const heuteNr = (jetzt: number): number => Math.floor(jetzt / TAG_MS)

/** Übungstage als ISO-Daten („2026-10-06", in UTC wie im Kasten gespeichert) → Fleiß */
export function fleissAus(tage: string[], jetzt: number, wochenziel = 3): Fleiss {
  const h = heuteNr(jetzt)
  const nr = [...new Set(tage)].map(tagNr).filter((n) => Number.isFinite(n) && n <= h)
  const tage7 = nr.filter((n) => h - n < 7).length
  const tage14 = nr.filter((n) => h - n < 14).length
  const letzte = nr.length ? Math.max(...nr) : null
  // Fleißig: das eigene Wochenziel (höchstens 3 Tage verlangt) in den letzten 7 Tagen – oder 5 Tage in zwei Wochen
  const ziel = Math.max(1, Math.min(3, Math.round(wochenziel)))
  return { tage7, tage14, seitTagen: letzte === null ? null : h - letzte, fleissig: tage7 >= ziel || tage14 >= 5 }
}

/** Montag (Tagesnummer) der Woche eines Tages */
const wochenStart = (n: number): number => n - ((n + 3) % 7)

/** Kennung der Kalenderwoche (Montag als ISO-Datum) – für die wöchentlichen Tipps */
export const wocheVon = (jetzt: number): string => new Date(wochenStart(heuteNr(jetzt)) * TAG_MS).toISOString().slice(0, 10)

/**
 * Wochenserie: Wochen in Folge mit erreichtem Wochenziel. Die laufende Woche zählt erst, wenn das Ziel
 * erreicht ist (sonst ist sie einfach noch offen); eine einzelne Woche ohne Übung wird übersprungen
 * (Ferien, Krankheit) – erst zwei leere Wochen in Folge beenden die Serie, ohne Aufhebens.
 */
export function wochenSerie(tage: string[], jetzt: number, wochenziel = 3): { serie: number; dieseWoche: number; ziel: number } {
  const ziel = Math.max(1, Math.min(7, Math.round(wochenziel)))
  const h = heuteNr(jetzt)
  const jeWoche = new Map<number, number>()
  for (const n of new Set(tage.map(tagNr).filter((x) => Number.isFinite(x) && x <= h))) jeWoche.set(wochenStart(n), (jeWoche.get(wochenStart(n)) ?? 0) + 1)
  const diese = wochenStart(h)
  const dieseWoche = jeWoche.get(diese) ?? 0
  let serie = dieseWoche >= ziel ? 1 : 0
  // Wochen ohne erreichtes Ziel in Folge: eine wird verziehen, die zweite beendet die Serie
  let luecken = 0
  for (let w = diese - 7; w > diese - 7 * 60; w -= 7) {
    if ((jeWoche.get(w) ?? 0) >= ziel) {
      serie++
      luecken = 0
    } else if (++luecken >= 2) break
  }
  return { serie, dieseWoche, ziel }
}

// ---------------------------------------------------------------- Leistung

export interface LeistungsDaten {
  /** Anteil richtiger Abfragen zuletzt (Vokabeln + Grammatik); null bei zu wenigen Abfragen */
  genauigkeit: number | null
  /** Sichere Einträge (Wörter, Grammatikaufgaben) jetzt und vor etwa einer Woche (Schnappschuss) */
  sicherJetzt: number
  sicherVorher: number | null
  gesamt: number
  /** Prozent freigegebener Tests, neueste zuerst */
  tests: number[]
  /** Anteil treffender Aufgaben in Arbeitsblättern mit Feedback je Aufgabe; null = keine */
  blattAnteil: number | null
}

export interface Leistung {
  stand: 'gut' | 'mittel' | 'niedrig' | 'unbekannt'
  trend: 'steigt' | 'gleich' | 'sinkt' | 'unbekannt'
  erfolgreich: boolean
}

export function leistungAus(d: LeistungsDaten): Leistung {
  const punkte: number[] = []
  if (d.genauigkeit !== null) punkte.push(d.genauigkeit >= 0.8 ? 2 : d.genauigkeit >= 0.6 ? 1 : 0)
  const tests = d.tests.slice(0, 2)
  if (tests.length) {
    const s = tests.reduce((a, b) => a + b, 0) / tests.length
    punkte.push(s >= 75 ? 2 : s >= 50 ? 1 : 0)
  }
  if (d.blattAnteil !== null) punkte.push(d.blattAnteil >= 0.7 ? 2 : d.blattAnteil >= 0.4 ? 1 : 0)
  const mittel = punkte.length ? punkte.reduce((a, b) => a + b, 0) / punkte.length : null
  const stand: Leistung['stand'] = mittel === null ? 'unbekannt' : mittel >= 1.5 ? 'gut' : mittel >= 0.75 ? 'mittel' : 'niedrig'
  // Trend nur gegenüber früher (individuelle Bezugsnorm)
  const signale: ('steigt' | 'sinkt' | 'gleich')[] = []
  if (d.sicherVorher !== null) {
    const diff = d.sicherJetzt - d.sicherVorher
    const schwelle = Math.max(3, Math.round(d.gesamt * 0.05))
    signale.push(diff >= schwelle ? 'steigt' : diff <= -schwelle ? 'sinkt' : 'gleich')
  }
  if (d.tests.length >= 2) {
    const diff = d.tests[0] - d.tests[1]
    signale.push(diff >= 10 ? 'steigt' : diff <= -10 ? 'sinkt' : 'gleich')
  }
  const steigt = signale.includes('steigt')
  const sinkt = signale.includes('sinkt')
  const trend: Leistung['trend'] = !signale.length ? 'unbekannt' : steigt && !sinkt ? 'steigt' : sinkt && !steigt ? 'sinkt' : 'gleich'
  return { stand, trend, erfolgreich: stand === 'gut' || (stand === 'mittel' && trend === 'steigt') }
}

/**
 * Zustand der Begrüßung (Recherche 4.3). Unsichere Daten → neutral (Rückfall-Hierarchie).
 * „Fleißig, noch nicht erfolgreich" nur, wenn die Leistung bekannt ist – sonst wäre das eine Behauptung.
 */
export function zustandAus(f: Fleiss, l: Leistung): Zustand {
  if (f.seitTagen === null) return 'neu'
  if (f.seitTagen >= 14) return 'inaktiv'
  if (f.fleissig && l.erfolgreich) return 'erfolgreich_fleissig'
  if (f.fleissig && l.stand !== 'unbekannt') return 'fleissig'
  if (!f.fleissig && l.erfolgreich) return 'erfolgreich'
  return 'neutral'
}

// ---------------------------------------------------------------- Antwort des Servers (GET /s/api/lernstand)

export interface LernstandAntwort {
  jahrgang: number | null
  stufe: Stufe
  zustand: Zustand
  fleiss: Fleiss
  leistung: Leistung
  serie: { serie: number; dieseWoche: number; ziel: number }
  /** Übungstage der letzten 14 Tage (für die Wochenleiste) */
  tage: string[]
  zahlen: {
    sicher: number
    gesamt: number
    /** Zuwachs sicherer Einträge seit dem letzten Wochen-Schnappschuss */
    sicherNeu: number | null
    faellig: number
    tests: number
    testsZuletzt: number | null
  }
  /** Stand je Bereich: Stufen neu / in Arbeit / sicher (bei Blättern: offen / angefangen / bearbeitet) */
  bereiche: Bereich[]
  tipp: Tipp | null
  /** Tipp ist der Wochenrückblick der KI */
  wochenrueckblick: boolean
  tippsAn: boolean
}

export interface Bereich {
  art: 'vokabeln' | 'grammatik' | 'blaetter'
  titel: string
  fach: string
  href: string
  neu: number
  inArbeit: number
  sicher: number
  gesamt: number
  faellig: number
}

// ---------------------------------------------------------------- Tipps

export interface Tipp {
  text: string
  knopf: { text: string; href: string } | null
  strategie: Strategie
  quelle: 'regel' | 'ki'
  /** Regel-Kennung (gegen Wiederholung) */
  regel?: string
}

/** Was die Regeln (und die KI) über die Person wissen – nur Zahlen und Titel, keine Namen */
export interface TippDaten {
  stufe: Stufe
  fleiss: Fleiss
  leistung: Leistung
  /** Vokabeln/Grammatik; `faellig` = heute dran (fällige Wiederholungen und neue Einträge der Tagesrunde) */
  vokabeln?: { id: string; titel: string; faellig: number; wackelig: number; testInTagen: number | null; href: string }[]
  grammatik?: { id: string; titel: string; faellig: number; href: string }[]
  blatt?: { titel: string; href: string } | null
  reihe?: { titel: string; href: string } | null
}

const nachStufe = (s: Stufe, t: { grund: string; unter: string; mittel: string; ober: string }): string =>
  s === 'grund' ? t.grund : s === 'unter' ? t.unter : s === 'ober' ? t.ober : t.mittel

/** Regel-Tipps in Rangfolge – jede Regel prüft, ob sie passt, und liefert genau einen Tipp mit Knopf */
type RegelTipp = Omit<Tipp, 'quelle'>
const REGELN: { id: string; tipp: (d: TippDaten) => RegelTipp | null }[] = [
  {
    id: 'testbald',
    tipp: (d) => {
      const v = d.vokabeln?.find((x) => x.testInTagen !== null && x.testInTagen >= 1 && x.testInTagen <= 7)
      if (!v) return null
      const n = v.testInTagen!
      return {
        strategie: 'verteilen',
        text: nachStufe(d.stufe, {
          grund: `In ${n} ${n === 1 ? 'Tag' : 'Tagen'} ist der Vokabeltest. Übe heute ein bisschen und morgen wieder ein bisschen. So bleiben die Wörter besser im Kopf.`,
          unter: `Bis zum Vokabeltest sind es noch ${n} ${n === 1 ? 'Tag' : 'Tage'}. Übe lieber an mehreren Tagen kurz als einmal lang – dein Gehirn behält so mehr.`,
          mittel: `Der Vokabeltest ist in ${n} ${n === 1 ? 'Tag' : 'Tagen'}. Verteil die Wiederholung auf mehrere kurze Runden statt einer langen am Vorabend – das hält länger.`,
          ober: `Test in ${n} ${n === 1 ? 'Tag' : 'Tagen'}: Plane bis dahin zwei bis drei kurze Wiederholungen mit Abstand. Verteiltes Wiederholen schlägt Lernen am Stück.`
        }),
        knopf: { text: 'Jetzt eine Runde üben', href: v.href }
      }
    }
  },
  {
    id: 'strategiewechsel',
    tipp: (d) => {
      if (!d.fleiss.fleissig || d.leistung.stand !== 'niedrig') return null
      const v = d.vokabeln?.[0]
      const g = d.grammatik?.[0]
      const href = v?.href ?? g?.href
      if (!href) return null
      return {
        strategie: 'abruf',
        text: nachStufe(d.stufe, {
          grund: 'Du übst so tapfer! Probier heute einen Trick: Deck das Wort zu und sag es dir laut vor, bevor du nachschaust.',
          unter: 'Du bleibst dran – das zählt. Probier einen Trick: erst selbst überlegen, dann nachschauen. Genau dieses Erinnern macht Wörter sicher.',
          mittel: `Du hast an ${d.fleiss.tage14} Tagen geübt. Mehr Wiederholen allein bringt hier weniger: Beantworte erst ohne Hinschauen und prüf danach. Bleibt etwas hängen, zeig es deiner Lehrkraft.`,
          ober: `Hohe Aktivität (${d.fleiss.tage14} Tage), die Treffer steigen noch nicht. Wechsle von Wiederlesen zu Abfragen ohne Vorlage. Hilft das nicht, sprich deine Lehrkraft an.`
        }),
        knopf: { text: 'Abfrage ohne Hinschauen starten', href }
      }
    }
  },
  {
    id: 'wackelig',
    tipp: (d) => {
      const v = d.vokabeln?.find((x) => x.wackelig >= 3)
      if (!v) return null
      return {
        strategie: d.stufe === 'mittel' || d.stufe === 'ober' ? 'fehleranalyse' : 'elaboration',
        text: nachStufe(d.stufe, {
          grund: `${v.wackelig} Wörter sind noch wackelig. Das ist gut zu wissen – genau die übst du als Nächstes.`,
          unter: `Bei ${v.wackelig} Wörtern hakt es noch. Schreib zu drei davon einen eigenen Satz – so merkst du sie dir besser.`,
          mittel: `${v.wackelig} Wörter waren zuletzt falsch. Schau dir an, was genau danebenging (Schreibung? Bedeutung?), und bau jedes in einen eigenen Satz ein.`,
          ober: `${v.wackelig} Einträge sind instabil. Lege dir ein kurzes Fehlerprotokoll an: Was war falsch, warum, wie lautet die Regel? Dann gezielt abfragen.`
        }),
        knopf: { text: 'Wackelige Wörter üben', href: v.href }
      }
    }
  },
  {
    id: 'vokabeln',
    tipp: (d) => {
      const v = d.vokabeln?.find((x) => x.faellig > 0)
      if (!v) return null
      const n = Math.min(10, v.faellig)
      return {
        strategie: 'abruf',
        text: nachStufe(d.stufe, {
          grund: `${v.faellig === 1 ? 'Ein Wort ist' : `${v.faellig} Wörter sind`} heute dran. Sag jedes Wort erst selbst, dann schau nach. Das ist schwer – und genau deshalb hilft es!`,
          unter: `${v.faellig} Vokabeln sind heute dran. Erst selbst erinnern, dann prüfen: Das trainiert dein Gedächtnis viel stärker als nur Durchlesen.`,
          mittel: `${v.faellig} Vokabeln sind heute dran. Abfragen bringt mehr als Durchlesen – auch wenn es sich anstrengender anfühlt.`,
          ober: `${v.faellig} Vokabeln stehen heute an. Kurz abfragen sichert sie, bevor sie verblassen.`
        }),
        knopf: { text: `Jetzt ${n} ${n === 1 ? 'Vokabel' : 'Vokabeln'} abfragen`, href: v.href }
      }
    }
  },
  {
    id: 'grammatik',
    tipp: (d) => {
      const g = d.grammatik?.find((x) => x.faellig > 0)
      if (!g) return null
      return {
        strategie: d.stufe === 'grund' || d.stufe === 'unter' ? 'abruf' : 'selbsterklaerung',
        text: nachStufe(d.stufe, {
          grund: `In „${g.titel}" warten Aufgaben auf dich. Mach eine kleine Runde – fünf Minuten reichen.`,
          unter: `In „${g.titel}" sind Aufgaben fällig. Sag dir bei jeder Aufgabe kurz, welche Regel passt – dann sitzt sie besser.`,
          mittel: `„${g.titel}": Aufgaben sind fällig. Erklär dir bei jeder Antwort in einem Satz, warum sie stimmt – das festigt die Regel.`,
          ober: `„${g.titel}": fällige Aufgaben. Begründe jede Antwort kurz für dich selbst, bevor du weitergehst.`
        }),
        knopf: { text: 'Grammatik üben', href: g.href }
      }
    }
  },
  {
    id: 'mischen',
    tipp: (d) => {
      if (d.stufe === 'grund' || (d.vokabeln?.length ?? 0) + (d.grammatik?.length ?? 0) < 2) return null
      const ziel = d.grammatik?.[0] ?? d.vokabeln?.[0]
      if (!ziel) return null
      return {
        strategie: 'interleaving',
        text: nachStufe(d.stufe, {
          grund: '',
          unter: 'Du hast mehrere Themen offen. Wechsel heute zwischen zwei davon hin und her – das fühlt sich schwerer an, bringt aber mehr.',
          mittel: 'Misch heute zwei Themen statt eines am Stück. Das fühlt sich schwerer an, bringt auf Dauer aber mehr.',
          ober: 'Wechsle in einer Sitzung zwischen zwei Themen (Interleaving). Das erschwert das Üben kurzfristig und verbessert das Behalten.'
        }),
        knopf: { text: 'Mit dem ersten Thema starten', href: ziel.href }
      }
    }
  },
  {
    id: 'blatt',
    tipp: (d) => {
      if (!d.blatt) return null
      return {
        strategie: 'selbsterklaerung',
        text: nachStufe(d.stufe, {
          grund: `„${d.blatt.titel}" wartet auf dich. Lies jede Aufgabe genau und sag dir, was du tun sollst.`,
          unter: `„${d.blatt.titel}" ist offen. Überleg bei jeder Aufgabe kurz: Warum ist meine Antwort richtig?`,
          mittel: `„${d.blatt.titel}" ist offen. Prüf jede Antwort mit der Frage „Warum stimmt das?" – so findest du Lücken selbst.`,
          ober: `„${d.blatt.titel}" ist offen. Begründe jede Antwort kurz für dich; wo du es nicht kannst, liegt die Lücke.`
        }),
        knopf: { text: 'Arbeitsblatt öffnen', href: d.blatt.href }
      }
    }
  },
  {
    id: 'reihe',
    tipp: (d) => {
      if (!d.reihe) return null
      return {
        strategie: 'planung',
        text: nachStufe(d.stufe, {
          grund: `In „${d.reihe.titel}" geht es weiter. Ein Schritt heute ist genug.`,
          unter: `Nimm dir in „${d.reihe.titel}" heute genau einen Schritt vor – kleine Portionen schaffst du sicher.`,
          mittel: `Setz dir für „${d.reihe.titel}" ein Ziel für heute: ein Schritt, ganz fertig. Kleine, klare Ziele helfen beim Dranbleiben.`,
          ober: `„${d.reihe.titel}": Leg fest, welchen Schritt du heute abschließt, und prüf am Ende, ob das Ziel erreicht ist.`
        }),
        knopf: { text: 'Zur Unterrichtsreihe', href: d.reihe.href }
      }
    }
  },
  {
    id: 'planen',
    tipp: (d) => ({
      strategie: 'planung',
      text: nachStufe(d.stufe, {
        grund: 'Kurz üben und dann Pause machen – das hilft deinem Kopf. Such dir zwei Tage in dieser Woche zum Üben aus.',
        unter: 'Plan zwei kurze Übungszeiten für diese Woche – zweimal 10 Minuten an verschiedenen Tagen bringen mehr als einmal 20.',
        mittel: 'Leg dir zwei feste, kurze Übungszeiten für diese Woche fest. Verteiltes Üben hält länger als Lernen am Stück.',
        ober: 'Plane diese Woche zwei kurze Wiederholungen mit ein paar Tagen Abstand – das stabilisiert das Gelernte am besten.'
      }),
      knopf: { text: 'Wochenziel festlegen', href: '/s/einstellungen#lernen' }
    })
  }
]

/**
 * Fester Tipp ohne KI: die erste passende Regel – mit täglichem Wechsel unter den passenden, damit nicht
 * jeden Tag derselbe Satz steht. Der Test-Hinweis und der Strategiewechsel haben Vorrang.
 */
export function regelTipp(d: TippDaten, jetzt = Date.now()): Tipp {
  const passend = REGELN.map((r) => ({ id: r.id, t: r.tipp(d) })).filter((x): x is { id: string; t: RegelTipp } => Boolean(x.t && x.t.text))
  const vorrang = passend.find((x) => x.id === 'testbald' || x.id === 'strategiewechsel')
  const auswahl = passend.filter((x) => x.id !== 'planen')
  const wahl = vorrang ?? (auswahl.length ? auswahl[heuteNr(jetzt) % Math.min(3, auswahl.length)] : passend[passend.length - 1])
  return { ...wahl.t, quelle: 'regel', regel: wahl.id }
}

// ---------------------------------------------------------------- KI-Tipp prüfen

/** Höchstlänge eines Tipps je Stufe (Zeichen) – Recherche 4.2: „Nicht mehr als Länge der Stufe" */
export const TIPP_LAENGE: Record<Stufe, number> = { grund: 180, unter: 240, mittel: 280, ober: 300, neutral: 280 }

/** Verbotsliste (Recherche 4.2 „soll nicht") */
const VERBOTEN: { re: RegExp; grund: string }[] = [
  { re: /\b(begabt|unbegabt|talent\w*|klug|schlau|dumm|faul|schwach|intelligen\w*|genie)\b/i, grund: 'Personen- oder Fähigkeitsaussage' },
  { re: /\blern-?typ\w*|\b(visuell|auditiv|haptisch)\w*\s+lern/i, grund: 'Typisierung' },
  {
    re: /\b(\w*durchschnitt\w*|\w*mitschüler\w*|klassenkamerad\w*|andere(n)? (kinder|schüler\w*|lernende\w*)|(besser|schlechter) als (die|deine) (anderen|klasse)|rangliste|rang\b|platz \d|perzentil\w*|bester? der klasse)/i,
    grund: 'Vergleich mit anderen'
  },
  { re: /\b(endlich|schon wieder|leider nur|enttäusch\w*)\b/i, grund: 'Bloßstellen' },
  { re: /\b(streak|verlierst|verloren|weg ist|alles verlieren)\b/i, grund: 'Verlustandrohung' },
  { re: /\bmehr üben!?$|^üb(e)? mehr\b|\bgib nicht auf\b/i, grund: 'Floskel ohne Strategie' },
  {
    re: /\b(note|noten|bestehen|bestanden)\b[^.]{0,40}\b(bekommst|schaffst|garantiert|wirst)\b|\b(bekommst|schaffst|wirst)\b[^.]{0,30}\b(note|noten|eine (1|2|eins|zwei))\b/i,
    grund: 'Zusage über Noten'
  },
  { re: /\b(adhs|ads|legasthen\w*|lrs|dyskalkul\w*|depress\w*|angststörung|krank\w*|therapie\w*|diagnos\w*)\b/i, grund: 'Diagnose' },
  { re: /\[(name|person)[^\]]*\]|\bS\d+\b/i, grund: 'Platzhalter oder Kürzel' },
  { re: /[*#_`]{2,}|^\s*[-*#]\s/m, grund: 'Formatierung' }
]

const EMOJI = /\p{Extended_Pictographic}/gu
/** Wenig wirksame Strategien – nur im Gegensatz erlaubt („Abfragen statt Wiederlesen") */
const SCHWACHE_STRATEGIE = /\b(markier\w*|unterstreich\w*|abschreib\w*|durchlesen|wiederlesen|wieder lesen|nochmal lesen|noch einmal lesen)\b/i
const GEGENSATZ = /\b(statt|anstatt|als|weniger|nicht|kein\w*|von)\b/i

/** Einen (KI-)Tipp prüfen: Verbotsliste, Länge, Emojis je Stufe. Bei Fehler: Rückfall auf den Regel-Tipp. */
export function tippPruefen(text: string, stufe: Stufe): { ok: true } | { ok: false; grund: string } {
  const t = (text ?? '').trim()
  if (t.length < 25) return { ok: false, grund: 'zu kurz' }
  if (t.length > TIPP_LAENGE[stufe]) return { ok: false, grund: 'zu lang' }
  for (const v of VERBOTEN) if (v.re.test(t)) return { ok: false, grund: v.grund }
  for (const satz of t.split(/(?<=[.!?])\s+/))
    if (SCHWACHE_STRATEGIE.test(satz) && !GEGENSATZ.test(satz)) return { ok: false, grund: 'wenig wirksame Strategie' }
  const emojis = t.match(EMOJI)?.length ?? 0
  if (emojis > (stufe === 'grund' || stufe === 'unter' ? 1 : 0)) return { ok: false, grund: 'Emojis' }
  if (/\?\s*$/.test(t) && /\b(was meinst du|sag mir|schreib mir|antworte)\b/i.test(t)) return { ok: false, grund: 'Rückfrage' }
  return { ok: true }
}

/** Stil je Stufe für den Prompt (Recherche 4.1 und 4.2 Punkt 3) */
export const STIL: Record<Stufe, string> = {
  grund:
    'Klasse 1–4: sehr kurze, einfache Sätze (höchstens 2), warm und ermutigend, genau eine Handlung (z. B. zudecken und laut sagen, kurz üben und Pause, morgen wiederholen). Fehler als Hinweis, was man als Nächstes übt.',
  unter:
    'Klasse 5–6: höchstens 3 kurze Sätze, freundlich und klar. Strategien: Abfragen statt Durchlesen, kleine Portionen an verschiedenen Tagen, Fehler sammeln, Wörter in eigene Sätze einbauen.',
  mittel:
    'Klasse 7–10: höchstens 3 Sätze, respektvoll, sachlich, nicht kindlich und nicht belehrend, keine Emojis. Strategien: Selbsttest vor Wiederlesen, Themen mischen, sich erklären warum etwas richtig ist, Fehleranalyse.',
  ober: 'Klasse 11–13: höchstens 3 Sätze, sachlich und datenbezogen, keine Emojis. Strategien: planen–überwachen–bewerten, verteilte Wiederholung, Selbsterklärung, Fehlerprotokoll, gezielte Lückenarbeit.',
  neutral: 'Höchstens 3 Sätze, freundlich und sachlich, keine Emojis.'
}
