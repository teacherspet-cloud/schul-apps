/**
 * Arbeitsblatt zur Vorbereitung auf eine Sprechprüfung (01.10.2026, Wunsch der Lehrkraft).
 *
 * Zwei Kompetenzschwerpunkte nach den KMK-Bildungsstandards: „zusammenhängendes Sprechen"
 * (monologisch) und „an Gesprächen teilnehmen" (dialogisch). Das Blatt besteht aus bis zu vier
 * Teilen, die die Lehrkraft wählt:
 *  - Übungskarten im Prüfungsformat (Monolog mit Material, Gespräch mit Rollenkarten für Paare/Gruppen),
 *  - Redemittel und Strategien (Meinung, Zustimmen/Widersprechen, Nachfragen, Zeit gewinnen,
 *    Bilder beschreiben, Prüfungsstrategien),
 *  - Beobachtungsbogen für Mitschülerinnen und Mitschüler und Selbsteinschätzung nach den
 *    Kriterien der Prüfung (shared/sprechen/raster.ts),
 *  - Musterdialog als Hörtext (zwei Stimmen, Vertonung über den Reiter „Hörtexte") mit Aufgaben.
 * Die Kriterien des Landes stehen in shared/sprechen/laender.ts.
 */
import { sprechKompetenzen } from '../../../shared/sprechen/kompetenzen'
import { sprechLand } from '../../../shared/sprechen/laender'
import { SPRECH_KRITERIEN } from '../../../shared/sprechen/raster'
import type { WorksheetMeta } from '../model/types'

export type SprechTeil = 'karten' | 'redemittel' | 'beobachtung' | 'musterdialog'

export const SPRECH_TEILE: { value: SprechTeil; label: string }[] = [
  { value: 'karten', label: 'Übungskarten im Prüfungsformat' },
  { value: 'redemittel', label: 'Redemittel und Strategien' },
  { value: 'beobachtung', label: 'Beobachtungsbogen und Selbsteinschätzung' },
  { value: 'musterdialog', label: 'Musterdialog als Hörtext mit Aufgaben' }
]

export const ALLE_SPRECH_TEILE: SprechTeil[] = SPRECH_TEILE.map((t) => t.value)

/** Ist das Blatt eines zur Sprechprüfung? */
export const istSprechblatt = (meta: Pick<WorksheetMeta, 'skillFocus'>): boolean => meta.skillFocus === 'speaking' || meta.skillFocus === 'interaction'

/** Gewählte Teile (fehlt die Angabe: alle vier) */
export const sprechTeile = (meta: Pick<WorksheetMeta, 'sprechTeile'>): SprechTeil[] => (meta.sprechTeile?.length ? meta.sprechTeile : ALLE_SPRECH_TEILE)

/** Soll die KI vorab einen Musterdialog als Hörtext schreiben? */
export const brauchtMusterdialog = (meta: Pick<WorksheetMeta, 'skillFocus' | 'sprechTeile'>): boolean =>
  istSprechblatt(meta) && sprechTeile(meta).includes('musterdialog')

/** Auftrag für das Blatt */
export function sprechRegeln(meta: WorksheetMeta): string {
  const k = sprechKompetenzen(meta.stateId, meta.schoolTypeId, meta.grade)
  const dialogisch = meta.skillFocus === 'interaction'
  const teile = sprechTeile(meta)
  const land = sprechLand(meta.stateId)
  const kriterien = land.kriterien.map((g) => SPRECH_KRITERIEN[g.id].label)
  const zeilen: string[] = [
    `SCHWERPUNKT SPRECHEN – ${dialogisch ? k.dialog : k.monolog}: Das Blatt bereitet auf eine Sprechprüfung vor (${
      land.bezeichnung
    }). Es enthält genau diese Teile, in dieser Reihenfolge:`
  ]
  let n = 1
  if (teile.includes('karten')) {
    zeilen.push(
      dialogisch
        ? `${n++}. ÜBUNGSKARTEN (Gespräch): eine Situation als Baustein "infoBox" (variant "regel") und je Person eine Rollenkarte als eigener Baustein "infoBox" (Titel „Partner A", „Partner B" – bei Gruppen auch „Partner C") mit Rolle, Ziel und 3 Gesprächspunkten. Dazu EINE Aufgabe mit socialForm "PA" (oder "GA"), die das Gespräch mit Zeitvorgabe in Prüfungsform verlangt, answer.kind "none".`
        : `${n++}. ÜBUNGSKARTEN (Monolog): zwei Karten als Bausteine "infoBox" (variant "regel", Titel „Karte A", „Karte B") mit Vorbereitungszeit, Aufgabe mit Operator, 3–4 Inhaltspunkten und Sprechzeit; zu jeder Karte ein Material direkt danach (Baustein "image" mit genauer Bildbeschreibung, "table" als kleine Statistik oder "text" als Zitat bzw. Kurztext). Dazu EINE Aufgabe mit socialForm "PA": abwechselnd vortragen, die andere Person stellt danach eine Nachfrage; answer.kind "none".`
    )
  }
  if (teile.includes('redemittel')) {
    zeilen.push(
      `${n++}. REDEMITTEL UND STRATEGIEN: ein Baustein "phrases", gruppiert nach Sprachhandlung: ${
        dialogisch
          ? 'Meinung äußern, zustimmen, widersprechen, nachfragen und um Klärung bitten, Vorschläge machen, sich einigen, Zeit gewinnen'
          : 'Bild bzw. Statistik beschreiben, Vermutungen äußern, Meinung äußern und begründen, gliedern und überleiten, Zeit gewinnen, zum Schluss kommen'
      } – je 3–5 Wendungen mit deutscher Entsprechung. Danach ein Baustein "infoBox" (variant "merke") „Strategien für die Prüfung" mit 4–6 Tipps (Vorbereitungszeit nutzen, Stichpunkte statt Sätze, umschreiben statt abbrechen, Blickkontakt, auf den Partner eingehen).`
    )
  }
  if (teile.includes('beobachtung')) {
    zeilen.push(
      `${n++}. BEOBACHTUNGSBOGEN: ein Baustein "table" mit Titel „Beobachtungsbogen" für Mitschülerinnen und Mitschüler – Spalten „Kriterium", „gelungen", „noch üben", „Beispiel bzw. Tipp"; Zeilen genau diese Kriterien der Prüfung: ${kriterien.join(
        '; '
      )}. Danach ein Baustein "selfCheck" (format "kompetenzraster") mit 4–6 Ich-kann-Sätzen zu denselben Kriterien als Selbsteinschätzung.`
    )
  }
  if (teile.includes('musterdialog')) {
    zeilen.push(
      `${n++}. MUSTER ALS HÖRTEXT: ein Baustein "audio" mit ${
        dialogisch
          ? 'einem Mustergespräch zweier Prüflinge zur Situation der Übungskarten'
          : 'einem Mustervortrag zu einer der Karten, an den sich eine kurze Nachfrage der prüfenden Person anschließt'
      } (ZWEI Sprechende, Zielniveau ${
        meta.cefrLevel
      }, Länge 60–120 Sekunden), danach 2 Aufgaben mit skill = "listening": (a) Redemittel und Strategien im Muster erkennen und ankreuzen bzw. zuordnen, (b) das Muster mit den Kriterien des Beobachtungsbogens bewerten und eine Verbesserung nennen.`
    )
  }
  zeilen.push(
    'Sonst nichts: keine Lernziele als eigener Baustein, keine Lesetexte mit Verständnisfragen, keine Schreibaufgaben. Die Karten und Rollenkarten stehen in der Zielsprache; die Aufgaben folgen der Sprache der Arbeitsanweisungen.'
  )
  return zeilen.join('\n')
}

/** Ergänzung für den Hörtext-Auftrag: Musterdialog bzw. Mustervortrag statt freier Hörtextsorte */
export function musterdialogRegeln(meta: WorksheetMeta): string {
  if (!brauchtMusterdialog(meta)) return ''
  const dialogisch = meta.skillFocus === 'interaction'
  return [
    'DIESER HÖRTEXT IST EIN PRÜFUNGSMUSTER für eine Sprechprüfung:',
    dialogisch
      ? '- Textsorte „Mustergespräch": zwei Prüflinge (Vornamen) führen das Prüfungsgespräch zum Thema – sie äußern und begründen Meinungen, stimmen zu, widersprechen höflich, fragen nach und einigen sich am Ende.'
      : '- Textsorte „Mustervortrag": ein Prüfling (Vorname) beschreibt ein Bild bzw. eine Statistik zum Thema, deutet es und nimmt Stellung; danach stellt die prüfende Person („Examiner" in der Zielsprache) eine Nachfrage, die beantwortet wird.',
    '- GENAU ZWEI Sprechende, damit zwei Stimmen zu hören sind.',
    `- Sprache auf dem Zielniveau ${meta.cefrLevel}, mit typischen Redemitteln und einer erkennbaren Strategie (z. B. Zeit gewinnen, umschreiben) – gut, aber nicht fehlerfrei-künstlich.`
  ].join('\n')
}
