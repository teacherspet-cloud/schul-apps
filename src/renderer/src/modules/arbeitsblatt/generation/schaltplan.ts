/**
 * Schaltpläne entstehen gezeichnet, nicht gesucht (30.09.2026).
 *
 * Befund der Lehrkraft am Blatt „Wann leuchtet die Lampe?": Im Schaltplan M1 zeigten Linien mit
 * Punkten „ins Nirgendwo", und Aufgabe 1 bot für dieselben Namen zusätzlich nummerierte
 * Schreiblinien. Die Punkte hatte die Text-KI für ein Bild geschätzt, das erst danach im Archiv
 * gefunden wurde – ein fremder Schaltplan mit Widerstand und Messgerät, auf dem kein Punkt traf.
 *
 * Jetzt: Beschreibt ein Bild-Baustein einen Schaltplan, bringt die Text-KI ihn in Daten
 * (Quelle, Bauteile, Zweige, Beschriftungen) – gezeichnet wird er von der App
 * (render/schaltplanSvg.ts), und jede Beschriftung ankert rechnerisch am Bauteil.
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
import { SCHALT_ARTEN, SCHALT_NAMEN, sanitizeSchaltplan, schaltplanDataUrl, schaltplanZeichnen, type SchaltplanSpec } from '../render/schaltplanSvg'

/** Beschreibungen, die einen Schaltplan meinen – ein Foto eines Versuchsaufbaus nicht */
export function istSchaltplan(b: Pick<ImageBlock, 'description' | 'caption'>): boolean {
  const t = `${b.caption} ${b.description}`
  if (/schaltplan|schaltbild|schaltskizze|schaltzeichen|circuit diagram|schematic/i.test(t)) return true
  return /stromkreis|schaltkreis|reihenschaltung|parallelschaltung|\bcircuit\b/i.test(t) && !/\bfoto|fotografie|photo|realbild|versuchsaufbau|experimentierkasten|steckbrett/i.test(t)
}

const BAUTEIL = obj({
  art: enumOf([...SCHALT_ARTEN]),
  beschriftung: str('Text am Bauteil oder leer (dann keine Beschriftung)'),
  leer: bool('true = die Lernenden tragen die Beschriftung selbst ein')
})

export const SCHALTPLAN_SCHEMA = obj({
  kreise: arr(
    obj({
      titel: str('Kurzer Name unter dem Schaltkreis, z. B. „A: Schalter offen" – bei nur einem Schaltkreis leer'),
      quelle: obj({ beschriftung: str('Text an der Batterie oder leer'), leer: bool() }),
      oben: arr(BAUTEIL, 'Bauteile in Reihe auf der oberen Leitung, von links nach rechts (höchstens 4)'),
      unten: arr(BAUTEIL, 'Bauteile in Reihe auf der unteren Leitung (höchstens 4), oft leer'),
      zweige: arr(
        obj({ bauteile: arr(BAUTEIL) }),
        'Senkrechte Zweige rechts: einer = rechte Seite des Stromkreises; mehrere = Parallelschaltung (je Zweig 1–3 Bauteile); leer = rechte Seite ist nur Leitung'
      )
    }),
    '1 oder 2 Schaltkreise nebeneinander'
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

/** Aus der Bildbeschreibung ein Schaltplan als Daten – null, wenn nichts Brauchbares kommt */
export async function schaltplanAusBeschreibung(
  bild: Pick<ImageBlock, 'description' | 'caption' | 'labels'>,
  meta: Pick<WorksheetMeta, 'subjectLabel' | 'grade' | 'topic'>,
  ai: AiCall,
  begriffe: string[] = []
): Promise<SchaltplanSpec | null> {
  const vorhanden = (bild.labels ?? []).map((l) => `${l.text}${l.blank ? ' (Lernende tragen ein)' : ''}`)
  const data = await ai<unknown>({
    system: [
      `Du bereitest einen Schaltplan für ein Arbeitsblatt (${meta.subjectLabel}, Klasse ${meta.grade}, Thema „${meta.topic}") als Daten auf. Gezeichnet wird er vom Programm nach DIN – rechtwinklige Leitungen, Batterie immer links.`,
      `Bauteile: ${SCHALT_ARTEN.map((a) => `${a} (${SCHALT_NAMEN[a]})`).join(', ')}. „leitung" setzt nur einen Beschriftungspunkt auf eine Leitung.`,
      'Regeln:',
      '- Genau die Bauteile der Beschreibung – nichts dazuerfinden (kein Widerstand, kein Messgerät, wenn die Beschreibung keines nennt).',
      '- Vergleicht die Beschreibung zwei Schaltungen (z. B. offen/geschlossen), liefere zwei Schaltkreise mit kurzem Titel; sonst einen ohne Titel.',
      '- Reihenschaltung: Bauteile auf „oben" (und ggf. „unten"). Parallelschaltung: je parallelem Bauteil ein Zweig.',
      '- Beschriftung nur, wo die Beschreibung, die bisherigen Bildbeschriftungen oder die Begriffsliste es verlangen. Jeden Begriff nur EINMAL setzen – bei zwei gleichen Schaltkreisen im ersten, außer er meint gerade den Unterschied (z. B. „Unterbrechung" am offenen Schalter).',
      begriffe.length
        ? `- Diese Begriffe sollen die Lernenden an den Bauteilen eintragen – setze jeden wörtlich als Beschriftung mit leer=true an das passende Bauteil (Leitungen an ein Bauteil „leitung", eine Unterbrechung an den offenen Schalter): ${begriffe.map((b) => `„${b}"`).join(', ')}.`
        : '- Sollen die Lernenden selbst beschriften, setze leer=true.'
    ].join('\n'),
    user: [`Bildunterschrift: ${bild.caption || '–'}`, `Beschreibung: ${bild.description}`, vorhanden.length ? `Bisherige Bildbeschriftungen: ${vorhanden.join('; ')}` : ''].filter(Boolean).join('\n'),
    schemaName: 'schaltplan',
    schema: SCHALTPLAN_SCHEMA
  })
  return sanitizeSchaltplan(data)
}

/** Bild und Beschriftungen eines gezeichneten Schaltplans */
export function schaltplanBild(spec: SchaltplanSpec, ohneBeschriftung = false): { dataUrl: string; labels: ImageLabel[] } {
  const z = schaltplanZeichnen(spec, { ohneBeschriftung })
  return { dataUrl: schaltplanDataUrl(z.svg), labels: z.labels }
}

const warn = (b: WsBlock, text: string): void => {
  b.warnings = [...(b.warnings ?? []).filter((w) => !w.startsWith('Bild:') && !w.startsWith('Bildquelle:')), text]
}

/**
 * Zeichnet den Schaltplan in alle Bausteine einer Gruppe (gleiches Motiv in mehreren
 * Niveaufassungen) und löst die doppelte Beschriftung auf. Liefert false, wenn die KI keinen
 * brauchbaren Plan liefert – dann läuft die gewöhnliche Bildsuche.
 */
export async function zeichneSchaltplan(gruppe: ImageBlock[], blocks: WsBlock[], meta: WorksheetMeta, ai: AiCall): Promise<boolean> {
  const rep = gruppe[0]
  const aufgaben = beschriftungsAufgaben(gruppe, blocks)
  const begriffe = begriffeAus(aufgaben)
  const spec = await schaltplanAusBeschreibung(rep, meta, ai, begriffe)
  if (!spec) return false

  const mit = schaltplanZeichnen(spec)
  // Deckt die Zeichnung jeden Begriff der Aufgabe mit einer leeren Linie am Bauteil ab?
  const gedeckt = begriffe.length > 0 && begriffe.every((bg) => mit.labels.some((l) => l.blank && gleich(l.text, bg)))
  const ohneBild = begriffe.length > 0 && !gedeckt
  const { dataUrl, labels } = schaltplanBild(spec, ohneBild)

  if (gedeckt) {
    // Ein Weg: Die Aufgabe verweist auf die Linien am Bild statt eigene Nummern zu führen
    for (const t of aufgaben) {
      const ref = gruppe.find((g) => g.ref && aufgabenText(t).includes(`M{${g.ref}}`))?.ref
      if (t.answer?.kind === 'labels') t.answer = { ...t.answer, kind: 'none', count: 0 }
      for (const p of t.parts) if (p.answer?.kind === 'labels') p.answer = { ...p.answer, kind: 'none', count: 0 }
      if (ref && !t.instruction.includes('Linien an')) t.instruction = `${t.instruction.trim()} (Linien an M{${ref}})`
    }
  }

  for (const b of gruppe) {
    b.image = { dataUrl, source: 'own' }
    b.schaltplan = spec
    b.labels = labels.map((l) => ({ ...l, ...(l.route ? { route: l.route.map((p) => ({ ...p })) } : {}) }))
    if (!b.labels.length) delete b.labels
    b.autoPicked = true
    warn(
      b,
      gedeckt
        ? 'Bild: Schaltplan nach DIN gezeichnet; die Begriffe der Aufgabe stehen als Linien direkt an den Bauteilen – bitte kurz prüfen.'
        : ohneBild
          ? 'Bild: Schaltplan nach DIN gezeichnet, ohne Beschriftung – die Aufgabe bietet die Schreiblinien. Bitte kurz prüfen.'
          : 'Bild: Schaltplan nach DIN gezeichnet (Bauteile aus der Bildbeschreibung) – bitte kurz prüfen.'
    )
  }
  return true
}
