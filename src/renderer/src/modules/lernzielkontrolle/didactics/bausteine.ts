/**
 * Was auf einer Lernzielkontrolle stehen darf – und was nicht.
 *
 * ENTSCHEIDUNG DER LEHRKRAFT (23.09.2026): „keine Erklärungen für Schüler, sondern nur
 * Aufgaben und je nach Aufgabe/Fach Material als Grundlage."
 *
 * Das ist der schärfste Unterschied zum Arbeitsblatt. Ein Arbeitsblatt LEHRT: es hat
 * Merkkästen, Wortspeicher, Tippkarten, Lernzielangaben und Satzanfänge. Eine
 * Lernzielkontrolle PRÜFT – und jede dieser Hilfen prüft mit, ob jemand die Hilfe lesen
 * kann, statt ob er den Stoff beherrscht.
 *
 * Das deckt sich mit dem, was die Länder über das Format sagen: Brandenburg (VV § 9 Abs. 1)
 * und Mecklenburg-Vorpommern (LeistBewVO § 8 Abs. 2) definieren die Lernerfolgskontrolle
 * über „geringeren Umfang" und „geringere Komplexität" gegenüber der Klassenarbeit. Wo
 * Übung hingehört, sagt Brandenburg im selben Satz: „Vor schriftlichen
 * Lernerfolgskontrollen sind hinreichend Übungsphasen vorzusehen" – also VORHER, im
 * Unterricht, nicht auf dem Testblatt.
 *
 * NACHTEILSAUSGLEICH – die einzige Ausnahme (Entscheidung der Lehrkraft, 23.09.2026):
 *
 * Sprachliche Hilfen können ein Nachteilsausgleich sein: ein Wortspeicher für DaZ-Lernende,
 * Satzanfänge im Förderschwerpunkt Lernen. Sie sind deshalb zulässig, wenn die Lehrkraft den
 * Nachteilsausgleich ausdrücklich einschaltet – nicht nebenbei, weil die KI es hilfreich fand.
 *
 * Die Grenze verläuft dort, wo der Nachteilsausgleich seine eigene Definition hat: Er passt
 * die BEDINGUNGEN an, unter denen geprüft wird, und senkt die fachlichen ANFORDERUNGEN
 * nicht. Ein Wortspeicher gibt Zugang zur Aufgabe (Sprache), er nimmt die Sache nicht ab.
 * Eine Tippkarte („So gehst du vor") dagegen nimmt einen Teil der geprüften Leistung vorweg –
 * das wäre keine Anpassung der Bedingungen mehr, sondern eine andere Aufgabe. Tippkarten und
 * gestufte Hilfekarten bleiben deshalb auch mit Nachteilsausgleich gesperrt.
 *
 * (Diese Abgrenzung ist die gängige Definition des Nachteilsausgleichs, nicht eine bestimmte
 * Vorschrift, die in dieser Recherche geprüft worden wäre. Die Regelungen dazu stehen in den
 * Länderverordnungen zur sonderpädagogischen Förderung und sind hier NICHT erhoben.)
 */
import type { WsBlock } from '../../arbeitsblatt/model/types'

/** Bausteine, die eine Lernzielkontrolle tragen darf. */
export const ERLAUBTE_BAUSTEINE = [
  'task', // die Aufgabe selbst
  'text', // Material: Quelle, Textauszug, Hörtextskript für die Lehrkraft
  'image', // Material: Abbildung, Diagramm, Karte
  'table', // Material: Datentabelle, Formelübersicht als GRUNDLAGE einer Aufgabe
  'grid', // Karo-, Millimeterpapier, Koordinatensystem, Klimadiagramm
  'audio', // Hörtext als Grundlage
  'workspace', // freier Platz zum Rechnen
  'divider'
] as const

/**
 * Bausteine, die es auf dem Arbeitsblatt gibt und die hier nicht hingehören,
 * jeweils mit dem Grund, der der Lehrkraft angezeigt wird.
 */
export const VERBOTENE_BAUSTEINE: Record<string, string> = {
  learningGoals: 'Die Lernziele stehen im Unterricht, nicht auf dem Prüfungsblatt – sonst verrät die Liste, worauf zu achten ist.',
  infoBox: 'Ein Merkkasten erklärt. Eine Lernzielkontrolle prüft, ob ohne Erklärung gewusst wird.',
  scaffold: 'Tippkarten, Wortspeicher und Satzanfänge sind Lernhilfen. Auf dem Testblatt prüfen sie das Lesen der Hilfe statt des Stoffes.',
  selfCheck: 'Die Selbsteinschätzung gehört zur Rückmeldung nach dem Test, nicht auf das Aufgabenblatt.',
  video: 'Ein Erklärvideo ist Unterricht, keine Prüfungsgrundlage.'
}

export const istErlaubt = (typ: string): boolean => (ERLAUBTE_BAUSTEINE as readonly string[]).includes(typ)

/**
 * Hilfen, die als Nachteilsausgleich zulässig sind.
 *
 * Nur die beiden SPRACHLICHEN: Sie geben Zugang zur Aufgabe, ohne die Sache abzunehmen.
 * `tipp` und `hilfekarten` fehlen hier bewusst – sie nehmen einen Teil der geprüften
 * Leistung vorweg und wären damit kein Ausgleich mehr, sondern eine andere Aufgabe.
 */
export const AUSGLEICH_HILFEN = ['wortspeicher', 'satzanfaenge'] as const

export type AusgleichHilfe = (typeof AUSGLEICH_HILFEN)[number]

export interface Nachteilsausgleich {
  /** Muss die Lehrkraft ausdrücklich einschalten – die KI setzt das nie von sich aus */
  aktiv: boolean
  /** Welche Hilfen zugelassen sind */
  hilfen: AusgleichHilfe[]
  /** Für wen, in den Lehrkraft-Hinweisen; steht NIE auf dem Blatt der Lernenden */
  vermerk?: string
}

export const OHNE_AUSGLEICH: Nachteilsausgleich = { aktiv: false, hilfen: [] }

/** Ist diese Hilfe durch den eingeschalteten Nachteilsausgleich gedeckt? */
export function ausgleichDeckt(variant: string, na: Nachteilsausgleich): boolean {
  if (!na.aktiv) return false
  return (na.hilfen as readonly string[]).includes(variant)
}

export interface BausteinWarnung {
  blockId: string
  typ: string
  message: string
}

/**
 * Findet Bausteine, die auf einer Lernzielkontrolle nichts zu suchen haben.
 *
 * Läuft über die BLÖCKE, nicht über den KI-Auftrag: Eine Regel im Auftrag ist eine Bitte,
 * eine Prüfung am fertigen Blatt ist eine Feststellung. Die App braucht beides, weil die KI
 * sich nicht immer an den Auftrag hält.
 */
export function pruefeBausteine(blocks: WsBlock[], na: Nachteilsausgleich = OHNE_AUSGLEICH): BausteinWarnung[] {
  const out: BausteinWarnung[] = []
  for (const b of blocks) {
    const grund = VERBOTENE_BAUSTEINE[b.type]
    if (!grund) continue
    if (b.type === 'scaffold') {
      if (ausgleichDeckt(b.variant, na)) continue
      // Auch bei eingeschaltetem Ausgleich: Tippkarten nehmen die Leistung vorweg
      if (na.aktiv && !(AUSGLEICH_HILFEN as readonly string[]).includes(b.variant)) {
        out.push({
          blockId: b.id,
          typ: b.type,
          message: `„${b.title || b.variant}" ist vom Nachteilsausgleich nicht gedeckt. Der Ausgleich passt die Bedingungen an (Sprache, Zeit), er nimmt die geprüfte Leistung nicht vorweg – und genau das täte eine Tipp- oder Hilfekarte.`
        })
        continue
      }
    }
    out.push({ blockId: b.id, typ: b.type, message: grund })
  }
  return out
}

/**
 * Findet Erklärtexte, die als „Material" getarnt sind.
 *
 * Der häufigere Fall als ein verbotener Bausteintyp: Die KI schreibt einen Textbaustein mit
 * der Überschrift „Das musst du wissen" und erklärt darin die Potenzgesetze, die sie gleich
 * abfragt. Formal ein erlaubter Baustein, inhaltlich genau das, was nicht sein soll.
 */
const ERKLAER_MUSTER =
  /\b(merke|das musst du wissen|zur erinnerung|wiederholung|erinnerung|tipp|hinweis zur lösung|so gehst du vor|vorgehen|regel(n)?:|wichtig:|beispiel zur erklärung)\b/i

export function pruefeMaterialtexte(blocks: WsBlock[]): BausteinWarnung[] {
  const out: BausteinWarnung[] = []
  for (const b of blocks) {
    if (b.type !== 'text') continue
    const treffer = ERKLAER_MUSTER.exec(`${b.title}\n${b.body}`)
    if (treffer) {
      out.push({
        blockId: b.id,
        typ: 'text',
        message: `„${b.title || 'Der Materialtext'}" liest sich wie eine Erklärung („${treffer[0]}"). Material ist die GRUNDLAGE einer Aufgabe – eine Quelle, ein Diagramm, ein Datensatz –, nicht die Wiederholung des Stoffes, der gleich geprüft wird.`
      })
    }
  }
  return out
}

/**
 * Der Regelteil für den KI-Auftrag.
 *
 * Bewusst knapp und in Verboten formuliert. Bei früheren Aufträgen hat sich gezeigt, dass
 * eine positive Aufzählung („erzeuge Aufgaben und Material") die KI nicht davon abhält,
 * zusätzlich einen hilfreichen Merkkasten beizulegen.
 */
export function bausteinRegeln(na: Nachteilsausgleich = OHNE_AUSGLEICH): string {
  const zeilen = [
    'AUFBAU DER LERNZIELKONTROLLE:',
    '- Das Blatt enthält AUSSCHLIESSLICH Aufgaben und – wo die Aufgabe es braucht – Material als Grundlage.',
    '- KEINE Lernzielliste, KEIN Merkkasten, KEINE Tippkarten, KEIN Wortspeicher, KEINE Satzanfänge, KEINE Selbsteinschätzung.',
    '- Material ist die GRUNDLAGE einer Aufgabe: eine Quelle, ein Text, ein Diagramm, eine Karte, ein Datensatz, eine Formelübersicht. Material ist NICHT die Wiederholung des Stoffes und enthält keine Lösungshinweise.',
    '- Schreibe keinen Text, der erklärt, wie die Aufgabe zu lösen ist. Der Stoff wurde im Unterricht geübt.',
    '- Erwartungshorizont und Notenschlüssel gehören auf das Lösungsblatt für die Lehrkraft, nicht auf das Blatt der Lernenden.'
  ]
  if (!na.aktiv || !na.hilfen.length) return zeilen.join('\n')
  const namen = na.hilfen.map((h) => (h === 'wortspeicher' ? 'ein Wortspeicher' : 'Satzanfänge')).join(' und ')
  return [
    ...zeilen,
    '',
    'AUSNAHME – NACHTEILSAUSGLEICH:',
    `- Für dieses Blatt ist ausdrücklich ${namen} zugelassen.`,
    '- Die Hilfe gibt Zugang zur SPRACHE der Aufgabe. Sie darf die fachliche Leistung nicht vorwegnehmen: keine Lösungswörter, keine Rechenschritte, keine Fachbegriffe, nach denen gefragt wird.',
    '- Die fachlichen Anforderungen bleiben unverändert. Die Aufgaben sind dieselben wie ohne Ausgleich.'
  ].join('\n')
}
