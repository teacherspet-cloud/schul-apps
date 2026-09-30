/**
 * Lernziele des Tafelbilds vorschlagen (Wunsch der Lehrkraft, 30.09.2026): „Vor der Erstellung kann
 * man die Lernziele des Tafelbilds nicht wie bei Arbeitsblättern z. B. von einer KI generieren lassen."
 *
 * Dieselbe Grundlage wie „Kompetenz vorschlagen" im Arbeitsblatt – nicht kopiert, sondern genutzt:
 * Kompetenzbereiche des Fachs (competences.ts), Lehrplanart des Landes und AFB-Mischung aus dem
 * Lerngruppen-Profil (profile.ts), Bereinigung und Anhängen der Zeilen (lernziele.ts,
 * competences.ts), die Operatoren aus der Liste des Landes (shared/operatoren). Anders als im
 * Arbeitsblatt kommen MEHRERE Vorschläge auf einmal: Die Lehrkraft wählt per Klick, welche gelten.
 *
 * Die gewählten Ziele stehen im Feld `meta.lernziel` (eins je Zeile). Sie steuern die Erzeugung
 * (prompt.ts: Merksatz und Sicherung sichern genau diese Ziele) und die Prüfung (lernzielBefunde).
 */
import type { StructuredRequest } from '@shared/types'
import { operatorenAuswahl } from '@shared/operatoren/zugriff'
import { arr, enumOf, obj, str } from '../../shared/aiSchema'
import { buildLearnerProfile } from '../arbeitsblatt/didactics/profile'
import { stateInfo } from '../arbeitsblatt/didactics/states'
import { appendCompetence, competenceAreas } from '../arbeitsblatt/generation/competences'
import { bereinigeLernziele } from '../arbeitsblatt/generation/lernziele'
import type { TafelbildMeta, TbInhalt } from './model'

export interface LernzielVorschlag {
  /** Satz ohne die Einleitung „Die Schülerinnen und Schüler …", beginnend mit dem Gegenstand */
  text: string
  operator: string
  afb: 1 | 2 | 3
  bereich: string
}

export interface LernzielOperator {
  name: string
  afb: 1 | 2 | 3
}

const AFB_ZAHL: Record<string, 1 | 2 | 3> = { I: 1, 'I–II': 1, II: 2, 'II–III': 2, III: 3, 'I–III': 2 }

/** Operatoren der Landesliste für Fach, Stufe und Schulform (wie im Einrichten-Schritt) */
export function lernzielOperatoren(m: Pick<TafelbildMeta, 'stateId' | 'subjectId' | 'grade' | 'schoolTypeId'>): { operatoren: LernzielOperator[]; quelle: string } {
  const a = operatorenAuswahl({ stateId: m.stateId, fach: m.subjectId, stufe: m.grade >= 11 ? 'sek2' : 'sek1', schulform: m.schoolTypeId })
  if (!a) return { operatoren: [], quelle: '' }
  const operatoren = a.operatoren.filter((o) => o.definition.trim() && o.afb).map((o) => ({ name: o.operator, afb: AFB_ZAHL[o.afb!] ?? 2 }))
  return { operatoren, quelle: a.quelle }
}

/** Lerngruppen-Profil wie im Arbeitsblatt: Lehrplanart des Landes und AFB-Mischung */
export function lernzielProfil(m: TafelbildMeta): { lehrplan: string; afb: { I: number; II: number; III: number } } {
  const p = buildLearnerProfile({
    stateId: m.stateId,
    schoolTypeId: m.schoolTypeId,
    schoolTypeName: m.schoolTypeName,
    grade: m.grade,
    courseLevel: 'mixed',
    subjectId: m.subjectId,
    subjectLabel: m.subjectLabel,
    languageMode: m.regler.sprache === 'einfach' ? 'simple' : 'standard'
  })
  return { lehrplan: p.curriculumName, afb: p.afbMix }
}

const SCHEMA = obj({
  vorschlaege: arr(
    obj({
      text: str('Lernziel OHNE „Die Schülerinnen und Schüler": Gegenstand, Bedingung und Operator am Ende im Infinitiv, z. B. „die Ursachen der Hyperinflation 1923 anhand des Tafelbilds erläutern"'),
      operator: str('der Operator aus der Liste, genau so geschrieben'),
      afb: enumOf(['I', 'II', 'III']),
      bereich: str('Kompetenzbereich des Fachs')
    })
  )
})

/** Anfrage: 5–6 Lernziele zum Tafelbild – operatorisiert, gemischt über die Anforderungsbereiche */
export function lernzielAnfrage(m: TafelbildMeta, material: { name: string; text: string }[], vorhanden: string[] = []): StructuredRequest {
  const { operatoren, quelle } = lernzielOperatoren(m)
  const profil = lernzielProfil(m)
  const land = stateInfo(m.stateId)
  const liste = operatoren.length
    ? operatoren.map((o) => `${o.name} (AFB ${'I'.repeat(o.afb)})`).join(', ')
    : 'nennen, beschreiben, erklären, erläutern, vergleichen, beurteilen, bewerten (gängige Operatoren; keine Landesliste vorhanden)'
  const system = [
    `Du bist Fachdidaktikerin für ${m.subjectLabel} und formulierst die Lernziele einer Stunde, deren Ergebnis ein TAFELBILD sichert.`,
    `Lerngruppe: ${m.schoolTypeName} in ${land.name}, Klasse ${m.grade}.`,
    `Orientiere dich an den KMK-Bildungsstandards und an typischen Inhalten des ${profil.lehrplan}s (${land.name}); zitiere KEINE Lehrplanstellen und erfinde keine Fundstellen.`,
    `Kompetenzbereiche des Fachs: ${competenceAreas(m.subjectId).join(', ')}.`,
    `OPERATOREN (Liste des Landes${quelle ? `: ${quelle}` : ''}) – nur diese verwenden: ${liste}.`,
    '',
    'REGELN:',
    '- 5 bis 6 Vorschläge, jeder ein anderes Ziel; zusammen sollen sie das Thema so abdecken, dass die Lehrkraft 2–3 davon wählen kann.',
    `- Anforderungsbereiche gemischt wie in dieser Lerngruppe üblich: etwa ${profil.afb.I} % AFB I, ${profil.afb.II} % AFB II, ${profil.afb.III} % AFB III – mindestens ein Ziel je Bereich.`,
    '- Jedes Ziel beobachtbar und am Tafelbild prüfbar: ein Operator, ein konkreter Gegenstand des Themas, wo sinnvoll die Bedingung („anhand …", „mithilfe …"). Nicht „verstehen", „kennen", „sich bewusst werden".',
    '- Genau eine Kompetenz je Ziel, keine Aufzählung mit „und/oder", höchstens 22 Wörter, altersgemäß.',
    '- Die Einleitung „Die Schülerinnen und Schüler …" NICHT schreiben; der Operator steht am Ende im Infinitiv.'
  ].join('\n')
  const user = [
    `Thema: ${m.thema.trim() || '(noch offen – aus dem Material ableiten)'}`,
    m.wuensche.trim() ? `Wünsche der Lehrkraft: ${m.wuensche.trim()}` : '',
    vorhanden.length ? `Schon gewählt (nicht wiederholen, andere Ziele vorschlagen):\n${vorhanden.map((z) => `- ${z}`).join('\n')}` : '',
    material.length ? `MATERIAL (die Ziele passen zu dem, was dieses Material hergibt):\n${material.map((x, i) => `[M${i + 1}] ${x.name}\n${x.text.slice(0, 3000)}`).join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
  return { system, user, schemaName: 'tafelbild_lernziele', schema: SCHEMA }
}

const normal = (s: string): string => s.toLocaleLowerCase('de').replace(/\s+/g, ' ').trim()

/**
 * Antwort lesen: bereinigt wie im Arbeitsblatt (keine Dubletten, keine Kompetenzformeln), der
 * Operator muss aus der Landesliste stammen (sonst wird er aus dem Satz erkannt) und bestimmt den AFB.
 */
export function lernzieleAus(d: unknown, operatoren: LernzielOperator[]): LernzielVorschlag[] {
  const roh = ((d as { vorschlaege?: unknown })?.vorschlaege ?? []) as { text?: unknown; operator?: unknown; afb?: unknown; bereich?: unknown }[]
  if (!Array.isArray(roh)) return []
  const texte = bereinigeLernziele(
    roh.map((v) => String(v?.text ?? '').replace(/^die schülerinnen und schüler( können)?\s*/i, '')),
    8
  )
  const aus: LernzielVorschlag[] = []
  for (const text of texte) {
    const v = roh.find((x) => String(x?.text ?? '').includes(text)) ?? {}
    const genannt = String(v.operator ?? '').trim()
    // Operator der Liste: der genannte, sonst der, der im Satz steht (als letztes Wort bzw. irgendwo)
    const op =
      operatoren.find((o) => normal(o.name) === normal(genannt)) ??
      operatoren.find((o) => normal(text).endsWith(normal(o.name))) ??
      operatoren.find((o) => new RegExp(`\\b${normal(o.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normal(text)))
    if (operatoren.length && !op) continue
    const afb = op?.afb ?? AFB_ZAHL[String(v.afb ?? 'II')] ?? 2
    aus.push({ text: text.replace(/[.;]+$/, ''), operator: op?.name ?? genannt, afb, bereich: String(v.bereich ?? '').trim() })
  }
  return aus
}

/** Lernziele im Feld (eins je Zeile) */
export const lernzielZeilen = (feld: string): string[] =>
  feld
    .split('\n')
    .map((z) => z.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean)

/** Vorschlag übernehmen: als eigene Zeile anhängen (wie „Kompetenz vorschlagen" im Arbeitsblatt) */
export const lernzielUebernehmen = (feld: string, v: Pick<LernzielVorschlag, 'text'>): string => appendCompetence(feld, v.text)

/** Vorschlag wieder entfernen */
export const lernzielEntfernen = (feld: string, v: Pick<LernzielVorschlag, 'text'>): string =>
  lernzielZeilen(feld)
    .filter((z) => normal(z) !== normal(v.text))
    .join('\n')

export const lernzielGewaehlt = (feld: string, v: Pick<LernzielVorschlag, 'text'>): boolean => lernzielZeilen(feld).some((z) => normal(z) === normal(v.text))

// ---------- Prüfung: sichert das Tafelbild die Lernziele? ----------

/** Füllwörter und Operatoren, die über den Gegenstand eines Ziels nichts sagen */
const FUELL = new Set(
  'anhand mithilfe hilfe einer eines einem einen eine der die das den dem des und oder sowie ihre ihren ihrer seine seiner sich auf aus bei mit nach von vor zur zum über unter zwischen durch für gegen ohne wie was warum welche welcher welches wesentliche wesentlichen verschiedene verschiedenen mehrere zentrale zentralen tafelbild tafelbilds schülerinnen schüler können'.split(
    ' '
  )
)

/** Inhaltswörter eines Lernziels (ohne Operator, Füllwörter; Wortstamm grob über die ersten 6 Zeichen) */
export function zielWoerter(ziel: string, operatoren: string[] = []): string[] {
  const ops = new Set(operatoren.map(normal))
  return [
    ...new Set(
      normal(ziel)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4 && !FUELL.has(w) && !ops.has(w) && !/^(nenn|beschreib|erklär|erläuter|vergleich|beurteil|bewert|analysier|darstell|stell|erörter|begründ|ordn|zuordn|benenn|skizzier|interpretier|überprüf|entwickl|gestalt|diskutier)/.test(w))
        .map((w) => w.slice(0, 6))
    )
  ]
}

/**
 * Befunde zur Sicherung (Qualitätsprüfung): Jedes gewählte Lernziel muss sich im Tafelbild
 * wiederfinden (mindestens ein Inhaltswort), und der Merksatz muss zu einem Lernziel passen.
 */
export function lernzielBefunde(inhalt: Pick<TbInhalt, 'titel' | 'knoten' | 'merksatz'> | null | undefined, lernziel: string): string[] {
  const ziele = lernzielZeilen(lernziel)
  if (!inhalt || !ziele.length) return []
  const tafel = normal([inhalt.titel, ...inhalt.knoten.flatMap((k) => [k.titel, ...k.punkte]), inhalt.merksatz?.text ?? ''].join(' '))
  const merksatz = normal(inhalt.merksatz?.text ?? '')
  const kommtVor = (w: string, text: string): boolean => text.split(/[^\p{L}\p{N}]+/u).some((x) => x.startsWith(w))
  const aus: string[] = []
  for (const z of ziele) {
    const w = zielWoerter(z)
    if (w.length && !w.some((x) => kommtVor(x, tafel))) aus.push(`Das Lernziel „${z.slice(0, 60)}${z.length > 60 ? ' …' : ''}" wird im Tafelbild nicht gesichert.`)
  }
  if (merksatz && !ziele.some((z) => zielWoerter(z).some((x) => kommtVor(x, merksatz))))
    aus.push('Der Merksatz passt zu keinem der Lernziele – er sollte das Ergebnis zum Lernziel festhalten.')
  return aus
}
