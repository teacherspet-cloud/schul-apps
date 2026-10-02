/**
 * „Useful vocabulary" zu Hörtexten und Videos (02.10.2026).
 *
 * Wunsch der Lehrkraft: Zu Videos und Hörtexten in Fremdsprachen bei den Useful phrases auch
 * Wörter angeben, die man zum Verstehen braucht und die vermutlich noch unbekannt sind.
 * Recherche (recherche/hoervokabular-2026-10-02 – Zusammenfassung hier):
 *
 * BELEGT
 *  - Field (2008, Listening in the Language Classroom, S. 17): vor dem Hören nur „critical words",
 *    ohne die der Text unverständlich bliebe – „at most, four or five".
 *  - Lexikalische Abdeckung: Hören ≈ 95 % bekannter Wörter (van Zeeland & Schmitt 2013), Video
 *    ≈ 90 %, weil das Bild trägt (Durbahn, Rodgers & Peters 2020).
 *  - Zu viel Vorentlastung schadet: 48 Wörter → Lernende hören nur noch auf die Wörter (Chang &
 *    Read 2006); KMK-Standards verlangen das Erschließen unbekannter Wörter.
 *  - Prüfungen: höchstens wenige, einsprachige Annotationen (NRW Berufliches Gymnasium 2023:
 *    „abode – a place of residence"; Berlin-Brandenburg 2015: „in Ausnahmefällen für
 *    sinntragende Begriffe …, die für das Lösen der Aufgabe unerlässlich sind").
 * FAUSTREGELN DER APP (nicht belegt)
 *  - Umfang: Sek I 4–8, Sek II 2–5 Einträge; Prüfung höchstens 3, nur wenn unverzichtbar.
 *  - Nicht aufnehmen: Kognaten/Internationalismen, durchsichtige Wortbildung, was im Video zu sehen
 *    ist, Eigennamen, schon bekannte Lehrwerkwörter, Wörter, deren Erklärung eine Lösung verrät.
 *  - Erklärung nach Niveau (Entscheidung der Lehrkraft): unterhalb B1+ deutsch, darüber
 *    einsprachig (didactics/phraseRules.ts `worterklaerung`); in Prüfungen einsprachig.
 *  - Eintrag mit Wortart/Genus, Aussprachehilfe (nur bei abweichendem Lautbild) und Kontextsatz
 *    aus dem Text (Entscheidung der Lehrkraft).
 *
 * Ablage (Entscheidung der Lehrkraft): als eigene Gruppe IM Useful-phrases-Kasten des Blattes;
 * gibt es keinen, entsteht einer direkt nach dem Hörtext bzw. Video. Verstehenswortschatz und
 * Redemittel überschneiden sich nicht – die vorhandenen Wendungen gehen als Ausschluss mit.
 */
import type { StructuredRequest } from '@shared/types'
import { arr, obj, str } from '../../../shared/aiSchema'
import { knownVocabRulesDe } from '../../../shared/knownVocab'
import { newId } from '../../vokabeltest/model/random'
import { worterklaerung } from '../didactics/phraseRules'
import { subjectById } from '../model/subjects'
import type { AudioBlock, PhrasesBlock, Sheet, Stars, TaskBlock, VideoBlock, Worksheet, WorksheetMeta, WsBlock } from '../model/types'
import { describeBlock } from './describe'

export type AiCall = <T>(req: StructuredRequest) => Promise<T>

/** 'blatt' = Arbeitsblatt (Vorentlastung); 'pruefung' = Klassenarbeit/LZK (sparsame Annotationen) */
export type VokabelModus = 'blatt' | 'pruefung'

export interface VokabelEintrag {
  /** Das Wort bzw. der Chunk in der Grundform (wie im Wörterbuch) */
  wort: string
  /** Wortart bzw. Genus/Artikel, z. B. „n.", „v.", „la (f)" – leer, wo unnötig */
  wortart: string
  /** Aussprachehilfe (IPA) nur bei abweichendem Lautbild, sonst leer */
  aussprache: string
  /** Satz(teil) aus dem Hörtext/Video, in dem das Wort vorkommt */
  kontext: string
  /** Bedeutung: deutsch oder einsprachig (Niveau) */
  erklaerung: string
}

export interface VokabelQuelle {
  id: string
  art: 'audio' | 'video'
  titel: string
  /** Skript bzw. Zusammenfassung/Abschnitt des Videos */
  text: string
  /** Die Aufgaben dazu (Text) – zum Schutz der Lösungen */
  aufgaben: string
}

/** Die Gruppe im Phrases-Kasten erkennt man an `art` */
export const VOKABEL_GRUPPE = 'vokabeln' as const

const UEBERSCHRIFT: Record<string, { blatt: string; pruefung: string }> = {
  en: { blatt: 'Useful vocabulary', pruefung: 'Annotations' },
  fr: { blatt: 'Vocabulaire utile', pruefung: 'Annotations' },
  es: { blatt: 'Vocabulario útil', pruefung: 'Anotaciones' },
  it: { blatt: 'Vocabolario utile', pruefung: 'Annotazioni' },
  nl: { blatt: 'Nuttige woorden', pruefung: 'Woordverklaringen' },
  pl: { blatt: 'Przydatne słownictwo', pruefung: 'Objaśnienia' },
  ru: { blatt: 'Полезная лексика', pruefung: 'Пояснения' },
  pt: { blatt: 'Vocabulário útil', pruefung: 'Anotações' },
  tr: { blatt: 'Faydalı kelimeler', pruefung: 'Açıklamalar' }
}

export const vokabelUeberschrift = (sprache: string | undefined, modus: VokabelModus): string =>
  (UEBERSCHRIFT[sprache ?? 'en'] ?? UEBERSCHRIFT.en)[modus]

/** Fremdsprache mit Hör-/Hörsehverstehen? (Latein und Griechisch: nein) */
export const hatHoerVokabular = (meta: Pick<WorksheetMeta, 'subjectId'>): boolean => Boolean(subjectById(meta.subjectId).foreignLanguage)

/** Wie viele Einträge höchstens (Faustregel, siehe Kopf) */
export function vokabelUmfang(meta: Pick<WorksheetMeta, 'grade'>, modus: VokabelModus): { min: number; max: number } {
  if (modus === 'pruefung') return { min: 0, max: 3 }
  return meta.grade >= 11 ? { min: 2, max: 5 } : { min: 4, max: 8 }
}

/** Die Regeln für die KI – getrennt testbar */
export function vokabelRegeln(meta: WorksheetMeta, modus: VokabelModus, stars?: Stars): string {
  const { min, max } = vokabelUmfang(meta, modus)
  const sprache = subjectById(meta.subjectId).foreignLanguage ?? 'en'
  const erklaerung = modus === 'pruefung' ? 'zielsprachlich' : worterklaerung(meta, stars)
  const romanisch = ['fr', 'es', 'it', 'pt'].includes(sprache)
  return [
    `Du wählst den VERSTEHENSWORTSCHATZ zu Hörtexten bzw. Videos für ein Blatt im Fach ${meta.subjectLabel}, Klasse ${meta.grade}, Niveau ${meta.cefrLevel}.`,
    modus === 'pruefung'
      ? `PRÜFUNG (Klassenarbeit/Lernzielkontrolle): höchstens ${max} Annotationen je Text – und nur, wenn ein Wort für das Lösen einer Aufgabe unerlässlich ist und die Lerngruppe es nicht kennen kann. Im Zweifel KEINE Annotation; eine leere Liste ist richtig, wenn alles erschließbar ist.`
      : `VORENTLASTUNG: ${min}–${max} Einträge je Text, nur Wörter, ohne die der Text für diese Lerngruppe unverständlich bliebe (Field 2008: „critical words") – nicht jedes schwierige Wort.`,
    '- NICHT aufnehmen: Kognaten und Internationalismen (dem Deutschen ähnlich), durchsichtige Wortbildungen, Eigennamen, Zahlen, alles, was im Video ohnehin zu sehen ist, und Wörter des bekannten Wortschatzes.',
    '- NICHT aufnehmen, was eine Lösung verrät: Prüfe jeden Eintrag gegen die Aufgaben. Würde die Erklärung eine Antwort vorwegnehmen, lass das Wort weg oder erkläre es neutral ohne den Inhalt der Lösung.',
    '- Keine Überschneidung mit den schon vorhandenen Redemitteln (Useful phrases); diese Liste dient dem VERSTEHEN, nicht dem Sprechen.',
    '- Chunks, Phrasal Verbs und feste Wendungen als Ganzes angeben, wenn sie so im Text vorkommen.',
    '- wort: Grundform (Infinitiv, Singular), so wie im Wörterbuch.',
    romanisch
      ? '- wortart: bei Nomen Artikel bzw. Genus (z. B. „la (f)", „el (m)"), bei anderen Wortarten nur wenn nötig (v., adj.).'
      : '- wortart: kurz (n., v., adj., adv., phr.), nur wo es dem Verstehen hilft – sonst leer.',
    '- aussprache: IPA in Schrägstrichen NUR, wenn die Aussprache deutlich von der Schreibung abweicht oder das Wort beim Hören sonst nicht wiedererkannt würde – sonst leer. Beim Hören zählt das Lautbild.',
    '- kontext: der kurze Satz bzw. Satzteil aus dem Text, in dem das Wort vorkommt (wörtlich, höchstens 12 Wörter), ohne eine Lösung zu verraten; sonst leer.',
    erklaerung === 'deutsch'
      ? '- erklaerung: die deutsche Bedeutung IM KONTEXT des Textes (nicht die erste Wörterbuchbedeutung), kurz.'
      : `- erklaerung: kurze einsprachige Erklärung in der Zielsprache (Synonym oder Definition mit einfachem Wortschatz, unter dem Niveau ${meta.cefrLevel}), Bedeutung IM KONTEXT, z. B. „abode – a place where someone lives".`,
    knownVocabRulesDe(meta.knownVocab)
  ]
    .filter(Boolean)
    .join('\n')
}

const SCHEMA = obj({
  texte: arr(
    obj({
      id: str('Kennung des Textes, wie angegeben'),
      eintraege: arr(
        obj({
          wort: str(),
          wortart: str(),
          aussprache: str(),
          kontext: str(),
          erklaerung: str()
        })
      )
    })
  )
})

/** Eine Anfrage für alle Hörtexte/Videos eines Blattes */
export async function hoerVokabularErzeugen(
  meta: WorksheetMeta,
  quellen: VokabelQuelle[],
  phrasen: string[],
  modus: VokabelModus,
  ai: AiCall,
  stars?: Stars
): Promise<Map<string, VokabelEintrag[]>> {
  const out = new Map<string, VokabelEintrag[]>()
  if (!quellen.length) return out
  const user = [
    ...quellen.map((q) =>
      [`TEXT ${q.id} (${q.art === 'audio' ? 'Hörtext' : 'Video – das Bild stützt das Verstehen'}): ${q.titel}`, q.text.slice(0, 9000), q.aufgaben ? `AUFGABEN DAZU (Lösungen nicht verraten):\n${q.aufgaben.slice(0, 3000)}` : '']
        .filter(Boolean)
        .join('\n')
    ),
    phrasen.length ? `SCHON VORHANDENE REDEMITTEL (nicht wiederholen):\n${phrasen.slice(0, 60).join('; ')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
  const antwort = await ai<{ texte: { id: string; eintraege: VokabelEintrag[] }[] }>({
    system: vokabelRegeln(meta, modus, stars),
    user,
    schemaName: 'hoervokabular',
    schema: SCHEMA
  })
  const { max } = vokabelUmfang(meta, modus)
  for (const t of antwort?.texte ?? []) {
    if (!quellen.some((q) => q.id === t.id)) continue
    out.set(t.id, bereinige(t.eintraege ?? [], quellen.find((q) => q.id === t.id)!, phrasen).slice(0, max))
  }
  return out
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Leere, doppelte und schon als Redemittel vorhandene Einträge weg; Kontext nur, wenn er im Text steht */
export function bereinige(liste: VokabelEintrag[], quelle: Pick<VokabelQuelle, 'text'>, phrasen: string[]): VokabelEintrag[] {
  const gesehen = new Set<string>()
  const phr = phrasen.map(norm)
  const text = norm(quelle.text)
  const out: VokabelEintrag[] = []
  for (const e of liste) {
    const wort = String(e?.wort ?? '').trim()
    const erklaerung = String(e?.erklaerung ?? '').trim()
    if (!wort || !erklaerung || norm(wort) === norm(erklaerung)) continue
    const k = norm(wort)
    if (gesehen.has(k) || phr.some((p) => p === k || p.includes(` ${k} `))) continue
    gesehen.add(k)
    const kontext = String(e.kontext ?? '').trim()
    out.push({
      wort,
      wortart: String(e.wortart ?? '').trim(),
      aussprache: String(e.aussprache ?? '').trim(),
      // Ein „Kontext", der so nicht im Text steht, wäre erfunden – dann lieber keiner
      kontext: kontext && text.includes(norm(kontext).slice(0, 40)) ? kontext : '',
      erklaerung
    })
  }
  return out
}

/** Text eines Eintrags im Kasten: „**abode** (n.) /əˈbəʊd/" */
export const vokabelText = (e: Pick<VokabelEintrag, 'wort' | 'wortart' | 'aussprache'>): string =>
  [`**${e.wort}**`, e.wortart ? `(${e.wortart})` : '', e.aussprache].filter(Boolean).join(' ')

/** Die Quellen eines Blattes: Hörtexte (Skript) und Videos (Zusammenfassung, Abschnitt) mit ihren Aufgaben */
export function vokabelQuellen(blocks: WsBlock[]): VokabelQuelle[] {
  const aufgabenZu = (id: string, art: 'audio' | 'video'): string =>
    blocks
      .filter((b): b is TaskBlock => b.type === 'task' && (art === 'audio' ? b.audioId === id : b.videoId === id))
      .map((b) => describeBlock(b))
      .join('\n')
  const out: VokabelQuelle[] = []
  for (const b of blocks) {
    if (b.type === 'audio' && (b as AudioBlock).transcript.trim()) {
      const a = b as AudioBlock
      out.push({ id: a.id, art: 'audio', titel: a.title, text: a.transcript, aufgaben: aufgabenZu(a.id, 'audio') })
    } else if (b.type === 'video') {
      const v = b as VideoBlock
      const text = [v.summary, v.section].filter(Boolean).join('\n')
      if (text.trim()) out.push({ id: v.id, art: 'video', titel: v.title || v.sourceTitle, text, aufgaben: aufgabenZu(v.id, 'video') })
    }
  }
  return out
}

/** Alle Redemittel der Phrases-Kästen (außer schon vorhandenen Vokabelgruppen) */
export const vorhandenePhrasen = (blocks: WsBlock[]): string[] =>
  blocks
    .filter((b): b is PhrasesBlock => b.type === 'phrases')
    .flatMap((b) => b.groups.filter((g) => g.art !== VOKABEL_GRUPPE).flatMap((g) => g.items.map((i) => i.text.replace(/\*\*/g, ''))))

/**
 * Die Einträge ins Blatt: als Gruppe an den Anfang des ERSTEN Phrases-Kastens (vor dem Hören
 * schaut man zuerst dorthin); gibt es keinen, entsteht ein Kasten direkt nach dem Hörtext/Video.
 * Mehrere Texte: je Text eine Gruppe mit dem Titel des Textes. Vorhandene Vokabelgruppen werden
 * ersetzt (neu erzeugen überschreibt, statt zu verdoppeln).
 */
export function vokabelnEinfuegen(blocks: WsBlock[], je: Map<string, VokabelEintrag[]>, quellen: VokabelQuelle[], sprache: string | undefined, modus: VokabelModus): WsBlock[] {
  const ueberschrift = vokabelUeberschrift(sprache, modus)
  const mitEintraegen = quellen.filter((q) => (je.get(q.id) ?? []).length)
  const gruppen: PhrasesBlock['groups'] = mitEintraegen.map((q) => ({
    label: mitEintraegen.length > 1 ? `${ueberschrift}: ${q.titel}` : ueberschrift,
    art: VOKABEL_GRUPPE,
    items: (je.get(q.id) ?? []).map((e) => ({ text: vokabelText(e), german: e.erklaerung, ...(e.kontext ? { kontext: e.kontext } : {}) }))
  }))
  const ohneAlte = blocks.map((b) => (b.type === 'phrases' ? { ...b, groups: b.groups.filter((g) => g.art !== VOKABEL_GRUPPE) } : b))
  if (!gruppen.length) return ohneAlte
  const ersterKasten = ohneAlte.findIndex((b) => b.type === 'phrases')
  if (ersterKasten >= 0) {
    const k = ohneAlte[ersterKasten] as PhrasesBlock
    const out = [...ohneAlte]
    out[ersterKasten] = { ...k, groups: [...gruppen, ...k.groups.filter((g) => g.items.some((i) => i.text.trim()))] }
    return out
  }
  // Kein Kasten: neuer Kasten nach dem ersten Hörtext/Video mit Einträgen
  const nach = ohneAlte.findIndex((b) => b.id === mitEintraegen[0].id)
  const kasten: PhrasesBlock = { id: newId(), type: 'phrases', title: ueberschrift, hint: '', groups: gruppen }
  const out = [...ohneAlte]
  out.splice(nach + 1, 0, kasten)
  return out
}

/**
 * Für mehrere Fassungen desselben Materials (Niveaustufen eines Arbeitsblatts, Fassungen A/B einer
 * Klassenarbeit): EINE Anfrage für die Hörtexte/Videos der ersten Fassung; die anderen bekommen
 * dieselben Wörter, wenn sie denselben Text haben (Titel oder Wortlaut). Scheitert die Anfrage,
 * bleibt alles, wie es ist – die Liste ist eine Hilfe, kein Muss.
 */
export async function vokabelnFuerFassungen(meta: WorksheetMeta, fassungen: WsBlock[][], modus: VokabelModus, ai: AiCall, stars?: Stars): Promise<WsBlock[][]> {
  if (!hatHoerVokabular(meta) || !fassungen.length) return fassungen
  const quellen = vokabelQuellen(fassungen[0])
  if (!quellen.length) return fassungen
  let je: Map<string, VokabelEintrag[]>
  try {
    je = await hoerVokabularErzeugen(meta, quellen, vorhandenePhrasen(fassungen[0]), modus, ai, stars)
  } catch {
    return fassungen
  }
  const sprache = subjectById(meta.subjectId).foreignLanguage
  return fassungen.map((blocks) => {
    const eigene = vokabelQuellen(blocks)
    const zuordnung = new Map<string, VokabelEintrag[]>()
    for (const q of eigene) {
      const vorbild = quellen.find((v) => v.id === q.id || (v.art === q.art && (v.text === q.text || v.titel === q.titel)))
      if (vorbild && je.has(vorbild.id)) zuordnung.set(q.id, je.get(vorbild.id)!)
    }
    return vokabelnEinfuegen(blocks, zuordnung, eigene, sprache, modus)
  })
}

/** Arbeitsblatt (alle Niveaustufen): Vorentlastung; Erklärsprache nach dem Niveau des ersten Blattes */
export async function mitHoerVokabular(ws: Worksheet, ai: AiCall, modus: VokabelModus = 'blatt'): Promise<Worksheet> {
  if (!ws.sheets.length) return ws
  const listen = await vokabelnFuerFassungen(
    ws.meta,
    ws.sheets.map((s) => s.blocks),
    modus,
    ai,
    ws.sheets[0].stars
  )
  return { ...ws, sheets: ws.sheets.map((s: Sheet, i) => ({ ...s, blocks: listen[i] })) }
}
