/**
 * Schaltpläne entstehen gezeichnet, nicht gesucht (30.09.2026).
 *
 * Befund der Lehrkraft am Blatt „Wann leuchtet die Lampe?": Im Schaltplan M1 zeigten Linien mit
 * Punkten „ins Nirgendwo", und Aufgabe 1 bot für dieselben Namen zusätzlich nummerierte
 * Schreiblinien. Die Punkte hatte die Text-KI für ein Bild geschätzt, das erst danach im Archiv
 * gefunden wurde – ein fremder Schaltplan mit Widerstand und Messgerät, auf dem kein Punkt traf.
 *
 * Jetzt: Beschreibt ein Bild-Baustein einen Schaltplan, bringt die Text-KI ihn in Daten – gezeichnet
 * wird er von der App (render/schaltplanSvg.ts), und jede Beschriftung steht rechnerisch am Bauteil.
 *
 * 2. Fassung (30.09.2026, Rückmeldung „unzuverlässig und zu klein"):
 *  - Die KI liefert eine NETZLISTE (Bauteile mit Anschlussknoten) statt „oben/unten/Zweige" –
 *    damit lassen sich auch Wechselschaltung, UND/ODER, Messgeräte parallel zum Bauteil, Diode,
 *    LED, Klingel und Taster ausdrücken.
 *  - Jede Antwort wird geprüft (render/schaltplanNetz.ts: geschlossener Kreis, jedes Bauteil
 *    verbunden, kein Kurzschluss, Messgeräte richtig, zerlegbar in Reihe/Parallel) und mit der
 *    Beschreibung abgeglichen (genannte Bauteile, Anzahl, Schalterstellung). Mängel gehen als
 *    gezielte Korrekturanfrage zurück an die KI – bis zu zweimal.
 *  - Bleibt der Plan fehlerhaft oder ist die Schaltung zu komplex, gibt es KEIN Bild aus der
 *    Bildersuche (ein fremder Schaltplan zeigt fast nie genau die beschriebenen Bauteile),
 *    sondern einen Platzhalter mit klarer Meldung.
 *  - Das Bild steht in voller Größe (nie neben einer Aufgabe) – siehe `schaltplanBreiteProzent`.
 *
 * Und es gibt EINEN Beschriftungsweg: Lässt eine Aufgabe die Bauteile dieses Bildes über
 * nummerierte Linien benennen (Antwortform „labels"), wandern die Begriffe als leere Linien an
 * die Bauteile – die stärkste Form (Johnson & Mayer 2012) –, und die Aufgabe verzichtet auf die
 * Liste. Lassen sich nicht alle Begriffe einem Bauteil zuordnen, bleibt die Liste der Aufgabe,
 * und das Bild trägt keine Beschriftung.
 */
import { arr, bool, enumOf, obj, str } from '../../../shared/aiSchema'
import type { AiCall } from '../../../shared/imageChoice'
import type { ImageBlock, ImageLabel, TaskBlock, WorksheetMeta, WsBlock } from '../model/types'
import { analysiereKreis, leseSchaltplan, type AnalyseOptionen, type SchaltArt, type SchaltplanSpec } from '../render/schaltplanNetz'
import { SCHALT_ARTEN, SCHALT_NAMEN, schaltplanBreiteProzent, schaltplanDataUrl, schaltplanZeichnen } from '../render/schaltplanSvg'

/** Beschreibungen, die einen Schaltplan meinen – ein Foto eines Versuchsaufbaus nicht */
export function istSchaltplan(b: Pick<ImageBlock, 'description' | 'caption'>): boolean {
  const t = `${b.caption} ${b.description}`
  if (/schaltplan|schaltbild|schaltskizze|schaltzeichen|circuit diagram|schematic/i.test(t)) return true
  return (
    /stromkreis|schaltkreis|reihenschaltung|parallelschaltung|wechselschaltung|und-schaltung|oder-schaltung|\bcircuit\b/i.test(t) &&
    !/\bfoto|fotografie|photo|realbild|versuchsaufbau|experimentierkasten|steckbrett/i.test(t)
  )
}

const BAUTEIL = obj({
  id: str('Kurzname, eindeutig im Schaltkreis: B1 (Batterie), L1, L2 (Lampen), S1 (Schalter), R1, A1, V1, M1, D1 …'),
  art: enumOf([...SCHALT_ARTEN]),
  von: str('Knoten am 1. Anschluss. Batterie: Pluspol. Diode/LED: Anode. Wechselschalter: Mittelkontakt.'),
  nach: str('Knoten am 2. Anschluss. Batterie: Minuspol. Diode/LED: Kathode. Wechselschalter: Kontakt 1.'),
  nach2: str('Nur Wechselschalter: Knoten an Kontakt 2 – sonst leer'),
  stellung: enumOf(['', '1', '2']),
  beschriftung: str('Text am Bauteil oder leer (dann keine Beschriftung)'),
  leer: bool('true = die Lernenden tragen die Beschriftung selbst ein')
})

export const SCHALTPLAN_SCHEMA = obj({
  nichtDarstellbar: str('Leer, wenn sich der Schaltplan mit diesen Bauteilarten zeichnen lässt; sonst kurzer Grund (z. B. Bauteil, das es nicht gibt)'),
  kreise: arr(
    obj({
      titel: str('Kurzer Name unter dem Schaltkreis, z. B. „A: Schalter offen" – bei nur einem Schaltkreis leer'),
      bauteile: arr(BAUTEIL, 'Netzliste: alle Bauteile mit ihren Anschlussknoten, die Batterie zuerst')
    }),
    '1 oder 2 Schaltkreise'
  )
})

/** Normalform für Vergleiche von Begriffen („die Batterie" = „Batterie") */
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/^(der|die|das|ein|eine)\s+/, '')
    .replace(/[^a-zäöüß0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const gleich = (a: string, b: string): boolean => {
  const x = norm(a)
  const y = norm(b)
  return Boolean(x && y) && (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `))
}

/** Text einer Aufgabe, in dem ein Materialverweis stehen kann */
const aufgabenText = (t: TaskBlock): string => [t.instruction ?? '', ...t.parts.map((p) => p.instruction ?? '')].join(' ')

/** Aufgaben, die dieses Bild über nummerierte Beschriftungslinien benennen lassen */
export function beschriftungsAufgaben(bilder: ImageBlock[], blocks: WsBlock[]): TaskBlock[] {
  const refs = bilder.map((b) => b.ref).filter((r): r is string => Boolean(r))
  return blocks.filter((b): b is TaskBlock => {
    if (b.type !== 'task') return false
    const hatListe = b.answer?.kind === 'labels' || b.parts.some((p) => p.answer?.kind === 'labels')
    if (!hatListe) return false
    const text = aufgabenText(b)
    return refs.some((r) => text.includes(`M{${r}}`))
  })
}

/** Die Begriffe, die eine Aufgabe benennen lässt (Lösungen der nummerierten Linien) */
function begriffeAus(aufgaben: TaskBlock[]): string[] {
  const alle = aufgaben.flatMap((t) => [t.answer, ...t.parts.map((p) => p.answer)].filter((a) => a?.kind === 'labels').flatMap((a) => a.labels ?? []))
  const out: string[] = []
  for (const b of alle.map((s) => s.trim()).filter(Boolean)) if (!out.some((o) => gleich(o, b))) out.push(b)
  return out
}

// ---------- Abgleich mit der Beschreibung ----------

/** Was die Beschreibung zulässt: absichtlicher Kurzschluss bzw. absichtlich falsch angeschlossenes Messgerät */
export function erlaubtAus(text: string): AnalyseOptionen {
  const t = text.toLowerCase()
  return {
    ...(/kurzschluss|kurzgeschlossen|überbrück/.test(t) ? { kurzschlussErlaubt: true } : {}),
    ...(/falsch\w* (angeschlossen|geschaltet|eingebaut)|fehler\w* schaltung|fehlschaltung/.test(t) ? { fehlschaltungErlaubt: true } : {})
  }
}

const ZAHLWORT: Record<string, number> = { zwei: 2, beide: 2, beiden: 2, drei: 3, vier: 4, '2': 2, '3': 3, '4': 4 }

/** Bauteilarten, die eine Beschreibung ausdrücklich nennt – mit Mindestanzahl */
const GENANNT: { name: string; muster: RegExp; arten: SchaltArt[] }[] = [
  { name: 'Lampe', muster: /(?<![a-zäöü])(glüh)?lampen?\b|glühbirnen?|glühlampen?/, arten: ['lampe'] },
  { name: 'LED', muster: /\bleds?\b|leuchtdioden?/, arten: ['led'] },
  { name: 'Diode', muster: /(?<![a-zäöü])dioden?\b/, arten: ['diode', 'led'] },
  { name: 'Motor', muster: /(?<![a-zäöü])(elektro)?motor(en)?\b/, arten: ['motor'] },
  { name: 'Klingel', muster: /klingel(?!knopf|taster)|(?<![a-zäöü])glocke/, arten: ['klingel'] },
  { name: 'Taster', muster: /(?<![a-zäöü])taster\b|klingelknopf|druckknopf/, arten: ['taster'] },
  { name: 'Widerstand', muster: /widerst(and|ände)/, arten: ['widerstand'] },
  { name: 'Strommessgerät', muster: /amperemeter|strommess(gerät|geräte|er)\b/, arten: ['amperemeter'] },
  { name: 'Spannungsmessgerät', muster: /voltmeter|spannungsmess(gerät|geräte|er)\b/, arten: ['voltmeter'] },
  { name: 'Wechselschalter', muster: /wechselschalt|treppenhausschaltung/, arten: ['wechselschalter'] },
  { name: 'Sicherung', muster: /(?<![a-zäöü])sicherung/, arten: ['sicherung'] },
  { name: 'Schalter', muster: /(?<![a-zäöü])schalter\b/, arten: ['schalter_offen', 'schalter_geschlossen', 'wechselschalter', 'taster'] }
]

const verneint = (t: string, index: number): boolean => /\b(ohne|kein|keine|keinen|keiner)\s+([a-zäöüß-]+\s+)?$/.test(t.slice(Math.max(0, index - 30), index))
const bedingt = (t: string, index: number): boolean => /\b(wenn|falls|sobald|solange)\b[^.,;:]*$/.test(t.slice(Math.max(0, index - 60), index))

/** Hat dieser Schaltkreis eine Unterbrechung (offener Schalter, Taster, Wechselschaltung „aus")? */
function hatUnterbrechung(spec: SchaltplanSpec, kreis: number): boolean {
  const a = analysiereKreis(spec.kreise[kreis], { kurzschlussErlaubt: true, fehlschaltungErlaubt: true })
  if (a.baum) {
    const offen = (b: NonNullable<typeof a.baum>): boolean =>
      b.t === 'teil' ? ['schalter_offen', 'taster'].includes(b.b.art) : b.t === 'wechsel' ? b.reihe1 !== b.reihe2 : b.k.some(offen)
    return offen(a.baum)
  }
  return spec.kreise[kreis].bauteile.some((b) => b.art === 'schalter_offen' || b.art === 'taster')
}

/**
 * Stimmt der Plan mit der Beschreibung überein? Geprüft wird nur, was die Beschreibung
 * ausdrücklich sagt: genannte Bauteile (mit Anzahl), Schalterstellung, Titel der Schaltkreise.
 */
export function abgleichMitBeschreibung(spec: SchaltplanSpec, text: string): string[] {
  const t = text.toLowerCase()
  const out: string[] = []
  const alle = spec.kreise.flatMap((k) => k.bauteile)
  const zaehle = (arten: SchaltArt[]): number => Math.max(...spec.kreise.map((k) => k.bauteile.filter((b) => arten.includes(b.art)).length))
  for (const g of GENANNT) {
    let noetig = 0
    for (const m of t.matchAll(new RegExp(g.muster.source, 'g'))) {
      if (verneint(t, m.index ?? 0)) continue
      // Zahlwort direkt davor oder mit einem Wort dazwischen („zwei Lampen", „zwei gleiche Lampen")
      const davor = t.slice(Math.max(0, (m.index ?? 0) - 25), m.index).trim().split(/\s+/).slice(-2)
      noetig = Math.max(noetig, ...davor.map((w) => ZAHLWORT[w] ?? 1))
    }
    if (!noetig) continue
    const da = zaehle(g.arten)
    if (!alle.some((b) => g.arten.includes(b.art)))
      out.push(`Die Beschreibung nennt ${g.name}, der Plan enthält keines dieser Bauteile (${g.arten.map((a) => a).join('/')}).`)
    else if (da < noetig) out.push(`Die Beschreibung nennt ${noetig} × ${g.name}, ein Schaltkreis des Plans enthält höchstens ${da}.`)
  }
  // Schalterstellung, wo die Beschreibung sie als Zustand nennt (nicht als Bedingung „wenn …")
  const offen = /(offene[nmrs]?|geöffnete[nmrs]?|unterbrochene[nmrs]?)\s+(schalter|stromkreis)|schalter\s+(ist\s+)?(offen|geöffnet)\b/g
  const zu = /geschlossene[nmrs]?\s+(schalter|stromkreis)|schalter\s+(ist\s+)?geschlossen\b/g
  const nenntZustand = (re: RegExp): boolean => [...t.matchAll(re)].some((m) => !bedingt(t, m.index ?? 0) && !verneint(t, m.index ?? 0))
  const kreise = spec.kreise.map((_, i) => i)
  if (nenntZustand(offen) && !kreise.some((i) => hatUnterbrechung(spec, i)))
    out.push('Die Beschreibung nennt einen offenen Schalter bzw. offenen Stromkreis – im Plan ist kein Schalter geöffnet (schalter_offen).')
  if (nenntZustand(zu) && !kreise.some((i) => !hatUnterbrechung(spec, i)))
    out.push('Die Beschreibung nennt einen geschlossenen Schalter bzw. geschlossenen Stromkreis – im Plan ist jeder Schaltkreis unterbrochen.')
  spec.kreise.forEach((k, i) => {
    const titel = (k.titel ?? '').toLowerCase()
    if (/offen|geöffnet|unterbrochen/.test(titel) && !hatUnterbrechung(spec, i)) out.push(`Schaltkreis ${i + 1} heißt „${k.titel}", hat aber keinen geöffneten Schalter.`)
    if (/geschlossen/.test(titel) && hatUnterbrechung(spec, i)) out.push(`Schaltkreis ${i + 1} heißt „${k.titel}", ist aber unterbrochen.`)
  })
  return out
}

// ---------- KI-Anfrage mit Prüfung und Korrektur ----------

export type SchaltplanErgebnis =
  | { ok: true; spec: SchaltplanSpec; /** Kleinere Abweichungen, die auch nach Korrektur blieben */ hinweise: string[] }
  | { ok: false; fehler: string[]; zuKomplex: boolean }

/** Wie oft die KI nachbessern darf */
const KORREKTUREN = 2

const SYSTEM = (meta: Pick<WorksheetMeta, 'subjectLabel' | 'grade' | 'topic'>, begriffe: string[]): string =>
  [
    `Du bereitest einen Schaltplan für ein Arbeitsblatt (${meta.subjectLabel}, Klasse ${meta.grade}, Thema „${meta.topic}") als Daten auf. Gezeichnet wird er vom Programm nach DIN EN 60617 – rechtwinklig, Batterie links.`,
    '',
    'Jeder Schaltkreis ist eine NETZLISTE: Knoten sind Verbindungspunkte mit frei gewählten Namen (z. B. „plus", „k1", „minus"). Jedes Bauteil verbindet zwei Knoten (von, nach).',
    `Bauteilarten: ${SCHALT_ARTEN.map((a) => `${a} (${SCHALT_NAMEN[a]})`).join(', ')}.`,
    '',
    'Regeln:',
    '- Genau die Bauteile der Beschreibung – nichts dazuerfinden, nichts weglassen. Gibt es ein Bauteil nicht in der Liste, „nichtDarstellbar" mit Grund füllen.',
    '- Batterie zuerst: von = Pluspol, nach = Minuspol.',
    '- Reihenschaltung: Bauteile hintereinander, je zwei teilen einen Knoten. Parallelschaltung: Bauteile an DENSELBEN zwei Knoten.',
    '- Leitungen sind keine Bauteile: zwei Anschlüsse am selben Knoten sind verbunden. Die Art „leitung" nur, wenn eine Leitung beschriftet werden soll.',
    '- Jeder Stromkreis ist geschlossen: An jedem Knoten liegen mindestens zwei Anschlüsse, kein freies Ende. Jedes Bauteil ist mit der Batterie verbunden.',
    '- Schalterstellung wie beschrieben: schalter_offen oder schalter_geschlossen. UND-Schaltung = zwei Schalter in Reihe; ODER-Schaltung = zwei Schalter parallel (an denselben Knoten).',
    '- Wechselschaltung: zwei Bauteile „wechselschalter"; von = Mittelkontakt; Kontakt 1 (nach) des einen und Kontakt 1 des anderen am selben Knoten, ebenso Kontakt 2 (nach2); stellung 1 oder 2 (gleiche Stellung = Lampe an).',
    '- Strommessgerät (amperemeter) in Reihe; Spannungsmessgerät (voltmeter) parallel zum gemessenen Bauteil – an dieselben zwei Knoten.',
    '- Diode/LED: von = Anode, nach = Kathode; in Durchlassrichtung zeigt die Anode zum Pluspol.',
    '- Kein Kurzschluss (kein Zweig nur aus Leitung/geschlossenem Schalter parallel zu einem Verbraucher) – außer die Beschreibung will genau das zeigen.',
    '- Vergleicht die Beschreibung zwei Schaltungen (z. B. offen/geschlossen), liefere zwei Schaltkreise mit kurzem Titel; sonst einen ohne Titel. Höchstens 12 Bauteile je Schaltkreis.',
    '- Beschriftung nur, wo die Beschreibung, die bisherigen Bildbeschriftungen oder die Begriffsliste es verlangen. Jeden Begriff nur EINMAL setzen – bei zwei gleichen Schaltkreisen im ersten, außer er meint gerade den Unterschied (z. B. „Unterbrechung" am offenen Schalter).',
    begriffe.length
      ? `- Diese Begriffe sollen die Lernenden an den Bauteilen eintragen – setze jeden wörtlich als Beschriftung mit leer=true an das passende Bauteil (Leitungen an ein Bauteil „leitung", eine Unterbrechung an den offenen Schalter): ${begriffe.map((b) => `„${b}"`).join(', ')}.`
      : '- Sollen die Lernenden selbst beschriften, setze leer=true.',
    '',
    'Beispiel Parallelschaltung mit Schalter: B1 batterie plus→minus; S1 schalter_geschlossen plus→k1; L1 lampe k1→minus; L2 lampe k1→minus.'
  ].join('\n')

/** Begriffe der Aufgabe, die an keinem Bauteil als Beschriftung stehen */
const fehlendeBegriffe = (spec: SchaltplanSpec, begriffe: string[]): string[] =>
  begriffe.filter((bg) => !spec.kreise.some((k) => k.bauteile.some((b) => b.beschriftung && gleich(b.beschriftung, bg))))

/**
 * Aus der Bildbeschreibung ein geprüfter Schaltplan: KI-Antwort lesen, elektrisch prüfen, mit der
 * Beschreibung abgleichen – bei Mängeln gezielt nachfragen (höchstens zweimal).
 */
export async function schaltplanAusBeschreibung(
  bild: Pick<ImageBlock, 'description' | 'caption' | 'labels'>,
  meta: Pick<WorksheetMeta, 'subjectLabel' | 'grade' | 'topic'>,
  ai: AiCall,
  begriffe: string[] = []
): Promise<SchaltplanErgebnis> {
  const vorhanden = (bild.labels ?? []).map((l) => `${l.text}${l.blank ? ' (Lernende tragen ein)' : ''}`)
  const beschreibung = `${bild.caption} ${bild.description}`
  const erlaubt = erlaubtAus(beschreibung)
  const auftrag = [`Bildunterschrift: ${bild.caption || '–'}`, `Beschreibung: ${bild.description}`, vorhanden.length ? `Bisherige Bildbeschriftungen: ${vorhanden.join('; ')}` : '']
    .filter(Boolean)
    .join('\n')
  let user = auftrag
  let letzte: { spec: SchaltplanSpec | null; hart: string[]; weich: string[]; zuKomplex: boolean } | null = null

  for (let versuch = 0; versuch <= KORREKTUREN; versuch++) {
    let data: unknown
    try {
      data = await ai<unknown>({ system: SYSTEM(meta, begriffe), user, schemaName: 'schaltplan', schema: SCHALTPLAN_SCHEMA })
    } catch (e) {
      letzte = { spec: null, hart: [`Die KI hat nicht geantwortet (${String((e as Error)?.message ?? e).slice(0, 120)}).`], weich: [], zuKomplex: false }
      continue
    }
    const grund = String((data as { nichtDarstellbar?: unknown })?.nichtDarstellbar ?? '').trim()
    if (grund) return { ok: false, fehler: [grund], zuKomplex: true }

    const gelesen = leseSchaltplan(data)
    const spec = gelesen.spec ? { ...gelesen.spec, ...(Object.keys(erlaubt).length ? { erlaubt } : {}) } : null
    const hart = [...gelesen.fehler]
    const weich: string[] = []
    let zuKomplex = false
    if (spec) {
      const z = schaltplanZeichnen(spec)
      hart.push(...z.fehler)
      zuKomplex = z.zuKomplex
      weich.push(...abgleichMitBeschreibung(spec, beschreibung))
      const fehlt = fehlendeBegriffe(spec, begriffe)
      if (fehlt.length) weich.push(`Diese Begriffe stehen an keinem Bauteil: ${fehlt.map((b) => `„${b}"`).join(', ')}.`)
    }
    letzte = { spec, hart, weich, zuKomplex }
    if (spec && !hart.length && !weich.length) return { ok: true, spec, hinweise: [] }

    // Gezielte Korrekturanfrage: die eigene Antwort und die gefundenen Mängel
    user = [
      auftrag,
      '',
      'Deine bisherige Antwort:',
      JSON.stringify(data).slice(0, 6000),
      '',
      'Diese Mängel hat die Prüfung gefunden:',
      ...[...hart, ...weich].map((f) => `- ${f}`),
      '',
      'Liefere die vollständige, korrigierte Netzliste. Ist die Schaltung mit diesen Bauteilarten nicht darstellbar, fülle „nichtDarstellbar".'
    ].join('\n')
  }
  if (letzte?.spec && !letzte.hart.length) return { ok: true, spec: letzte.spec, hinweise: letzte.weich }
  return { ok: false, fehler: letzte?.hart.length ? letzte.hart : ['Die KI hat keinen Schaltplan geliefert.'], zuKomplex: Boolean(letzte?.zuKomplex) }
}

/** Bild und Beschriftungen eines gezeichneten Schaltplans (null: nicht zeichenbar) */
export function schaltplanBild(spec: SchaltplanSpec, ohneBeschriftung = false): { dataUrl: string; labels: ImageLabel[]; widthPercent: number } | null {
  const z = schaltplanZeichnen(spec, { ohneBeschriftung })
  if (!z.svg) return null
  return { dataUrl: schaltplanDataUrl(z.svg), labels: z.labels, widthPercent: schaltplanBreiteProzent(z) }
}

const warn = (b: WsBlock, text: string): void => {
  b.warnings = [...(b.warnings ?? []).filter((w) => !w.startsWith('Bild:') && !w.startsWith('Bildquelle:')), text]
}

const kurz = (fehler: string[]): string => {
  const t = fehler.slice(0, 3).join(' ')
  return fehler.length > 3 ? `${t} (und ${fehler.length - 3} weitere)` : t
}

/**
 * Zeichnet den Schaltplan in alle Bausteine einer Gruppe (gleiches Motiv in mehreren
 * Niveaufassungen) und löst die doppelte Beschriftung auf.
 * 'abgelehnt': kein stimmiger Plan – die Bausteine bleiben ohne Bild, mit Meldung (keine Bildsuche).
 */
export async function zeichneSchaltplan(gruppe: ImageBlock[], blocks: WsBlock[], meta: WorksheetMeta, ai: AiCall): Promise<'gezeichnet' | 'abgelehnt'> {
  const rep = gruppe[0]
  const aufgaben = beschriftungsAufgaben(gruppe, blocks)
  const begriffe = begriffeAus(aufgaben)
  const erg = await schaltplanAusBeschreibung(rep, meta, ai, begriffe)

  if (!erg.ok) {
    for (const b of gruppe) {
      delete b.image
      delete b.schaltplan
      // Geschätzte Punkte gehören zu keinem Bild
      delete b.labels
      b.autoPicked = true
      warn(
        b,
        erg.zuKomplex
          ? `Bild: Schaltplan nicht gezeichnet – die Schaltung ist für die automatische Zeichnung zu komplex. ${kurz(erg.fehler)} Abhilfe: Beschreibung vereinfachen (höchstens zwei Schaltkreise, Reihen- und Parallelschaltungen) und das Bild neu erzeugen oder ein eigenes Bild einsetzen.`
          : `Bild: Schaltplan nicht gezeichnet – auch nach Korrektur blieb der Plan fehlerhaft: ${kurz(erg.fehler)} Ein falsches Bild wäre schlimmer als keines. Abhilfe: Beschreibung präzisieren und das Bild neu erzeugen oder ein eigenes Bild einsetzen.`
      )
    }
    return 'abgelehnt'
  }

  const { spec, hinweise } = erg
  const mit = schaltplanZeichnen(spec)
  // Deckt die Zeichnung jeden Begriff der Aufgabe mit einer leeren Linie am Bauteil ab?
  const gedeckt = begriffe.length > 0 && begriffe.every((bg) => mit.labels.some((l) => l.blank && gleich(l.text, bg)))
  const ohneBild = begriffe.length > 0 && !gedeckt
  const bild = schaltplanBild(spec, ohneBild)!

  if (gedeckt) {
    // Ein Weg: Die Aufgabe verweist auf die Linien am Bild statt eigene Nummern zu führen
    for (const t of aufgaben) {
      const ref = gruppe.find((g) => g.ref && aufgabenText(t).includes(`M{${g.ref}}`))?.ref
      if (t.answer?.kind === 'labels') t.answer = { ...t.answer, kind: 'none', count: 0 }
      for (const p of t.parts) if (p.answer?.kind === 'labels') p.answer = { ...p.answer, kind: 'none', count: 0 }
      if (ref && !t.instruction.includes('Linien an')) t.instruction = `${t.instruction.trim()} (Linien an M{${ref}})`
    }
  }

  // Fehlende Begriffe erledigt schon der Rückfall auf die Schreiblinien der Aufgabe
  const abweichungen = hinweise.filter((h) => !h.startsWith('Diese Begriffe'))
  const pruefen = abweichungen.length ? ` Abweichungen von der Beschreibung: ${kurz(abweichungen)}` : ''
  for (const b of gruppe) {
    b.image = { dataUrl: bild.dataUrl, source: 'own' }
    b.schaltplan = spec
    b.labels = bild.labels.map((l) => ({ ...l }))
    if (!b.labels.length) delete b.labels
    // In Originalgröße und über die volle Breite – nie verkleinert neben einer Aufgabe
    b.widthPercent = bild.widthPercent
    b.side = 'none'
    b.autoPicked = true
    warn(
      b,
      (gedeckt
        ? 'Bild: Schaltplan nach DIN gezeichnet und elektrisch geprüft; die Begriffe der Aufgabe stehen als Linien direkt an den Bauteilen – bitte kurz prüfen.'
        : ohneBild
          ? 'Bild: Schaltplan nach DIN gezeichnet und elektrisch geprüft, ohne Beschriftung – die Aufgabe bietet die Schreiblinien. Bitte kurz prüfen.'
          : 'Bild: Schaltplan nach DIN gezeichnet und elektrisch geprüft (Bauteile aus der Bildbeschreibung) – bitte kurz prüfen.') + pruefen
    )
  }
  return 'gezeichnet'
}

