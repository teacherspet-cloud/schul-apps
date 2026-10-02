/**
 * Die Klassenarbeit als Arbeitsblatt-Datenstruktur.
 *
 * Darstellung, Seitenumbruch, Druck und Word-Export sind im Arbeitsblatt schon gelöst.
 * Statt das alles zu wiederholen, wird die Arbeit in dieselbe Struktur übersetzt: ein Blatt
 * mit einem Kopfbaustein (Zeit, Hilfsmittel, Notenschlüssel), je Teil einer Überschrift und
 * den erzeugten Bausteinen.
 */
import { nachweisFuer } from '../model/nachweise'
import { eigeneTeilnoteLabel, istAlteSprache } from '../model/faecher'
import { fachDerArbeit, inhaltsanteil, zweiterTeil } from '../model/faecher'
import { platziereKopfUndSchluss } from '../../arbeitsblatt/generation/illustrationen'
import { newId } from '../../vokabeltest/model/random'
import type { Sheet, Worksheet, WsBlock } from '../../arbeitsblatt/model/types'
import { upperSecondary, worksheetMetaFor } from '../generation/generateExam'
import { translateAids } from '../model/aids'
import { gradeScaleGroups, scaleLineFuer } from '../model/examRules'
import { notenpunkteFuer } from '../../../shared/notenpunkte'
import { formatById } from '../model/formats'
import type { Exam } from '../model/types'
import { fassungsLabel, fassungsZahl, teileDerFassung } from '../model/fassungen'
import { operatorenBlock } from '../didactics/operatorenliste'
import { examGrades, examPoints } from '../model/types'
import { RU_BALL, RU_MINUTA, russischPlural } from '../../../shared/russischPlural'
import { polnischPlural, tschechischPlural } from '../../../shared/kopfSprache'
import type { Zielsprache } from '../model/faecher'

/** Wortlaute des Kopfkastens in einer Sprache */
interface KopfkastenTexte {
  title: string
  time: (min: number) => string
  aids: (a: string) => string
  points: (n: number) => string
  split: (c: number, l: number) => string
  counts: (w: number) => string
  scale: (line: string) => string
  total: string
  labels: { writing: string; other: string }
}

/**
 * Kopfkasten der neuen Schulfremdsprachen (30.09.2026). Wortlaute nach den Prüfungen der
 * Herkunftsländer, soweit bekannt (CvTE/NL, CKE/PL, CERMAT/CZ, IAVE/PT, ÖSYM/TR, Gaokao/HSK/CN);
 * Quellen und Prüfstand in recherche/sprachtexte-2026-09-30.md – nicht muttersprachlich geprüft.
 * Numerus nach der Zahl: pl 1 punkt / 2 punkty / 5 punktów, cs 1 bod / 2 body / 5 bodů,
 * Türkisch nach Zahlen immer Singular (45 dakika, 20 puan), Prozent vorangestellt (%40).
 */
const NEUE_SPRACHEN: Partial<Record<Zielsprache, KopfkastenTexte>> = {
  nl: {
    title: 'Proefwerk',
    time: (min) => `Tijdsduur: ${min} ${min === 1 ? 'minuut' : 'minuten'}`,
    aids: (a) => `Toegestane hulpmiddelen: ${a || 'geen'}`,
    points: (n) => `${n} ${n === 1 ? 'punt' : 'punten'}`,
    split: (c, l) => `${c} % inhoud, ${l} % taal`,
    counts: (w) => `telt voor ${w} % mee`,
    scale: (line) => `Normering: ${line}`,
    total: 'Totaal',
    labels: { writing: 'Schrijfvaardigheid', other: 'Overige vaardigheden' }
  },
  pl: {
    title: 'Sprawdzian',
    time: (min) => `Czas pracy: ${min} ${polnischPlural(min, ['minuta', 'minuty', 'minut'])}`,
    aids: (a) => `Dozwolone materiały pomocnicze: ${a || 'brak'}`,
    points: (n) => `${n} ${polnischPlural(n, ['punkt', 'punkty', 'punktów'])}`,
    split: (c, l) => `treść ${c} %, środki językowe ${l} %`,
    counts: (w) => `stanowi ${w} % oceny`,
    scale: (line) => `Skala ocen: ${line}`,
    total: 'Razem',
    labels: { writing: 'Wypowiedź pisemna', other: 'Pozostałe umiejętności' }
  },
  cs: {
    title: 'Písemná práce',
    time: (min) => `Časový limit: ${min} ${tschechischPlural(min, ['minuta', 'minuty', 'minut'])}`,
    aids: (a) => `Povolené pomůcky: ${a || 'žádné'}`,
    points: (n) => `${n} ${tschechischPlural(n, ['bod', 'body', 'bodů'])}`,
    split: (c, l) => `obsah ${c} %, jazykové prostředky ${l} %`,
    counts: (w) => `tvoří ${w} % známky`,
    scale: (line) => `Klasifikační stupnice: ${line}`,
    total: 'Celkem',
    labels: { writing: 'Písemný projev', other: 'Ostatní dovednosti' }
  },
  pt: {
    title: 'Teste',
    time: (min) => `Duração: ${min} ${min === 1 ? 'minuto' : 'minutos'}`,
    aids: (a) => `Material permitido: ${a || 'nenhum'}`,
    points: (n) => `${n} ${n === 1 ? 'ponto' : 'pontos'}`,
    split: (c, l) => `${c} % conteúdo, ${l} % língua`,
    counts: (w) => `vale ${w} %`,
    scale: (line) => `Escala de classificação: ${line}`,
    total: 'Total',
    labels: { writing: 'Produção escrita', other: 'Outras competências' }
  },
  tr: {
    title: 'Yazılı Sınav',
    time: (min) => `Süre: ${min} dakika`,
    aids: (a) => `İzin verilen araç gereçler: ${a || 'yok'}`,
    points: (n) => `${n} puan`,
    split: (c, l) => `içerik %${c}, dil %${l}`,
    counts: (w) => `ağırlık: %${w}`,
    scale: (line) => `Puan–not karşılığı: ${line}`,
    total: 'Toplam',
    labels: { writing: 'Yazma', other: 'Diğer beceriler' }
  },
  zh: {
    title: '测验',
    time: (min) => `考试时间：${min}分钟`,
    aids: (a) => `允许使用：${a || '无'}`,
    points: (n) => `${n}分`,
    split: (c, l) => `内容${c}%，语言${l}%`,
    counts: (w) => `占总成绩的${w}%`,
    scale: (line) => `分数与等级对照：${line}`,
    total: '总分',
    labels: { writing: '写作', other: '其他能力' }
  }
}

/**
 * Kopfkasten der Arbeit: Zeit, Hilfsmittel und Bewertung.
 * In den Fremdsprachen steht er in der Zielsprache, damit die Arbeit einsprachig bleibt.
 * Ein Notenschlüssel erscheint nur, wenn es EINE Note gibt – bei getrennten Teilnoten
 * gälte er nur für einen Teil und würde eher verwirren.
 */
export function examHeadBlock(exam: Exam): WsBlock | null {
  const m = exam.meta
  if (!m.infoBox) return null
  const fach = fachDerArbeit(m.subjectId)
  const english = fach.sprache === 'en'
  const grades = examGrades(exam)
  const t: KopfkastenTexte =
    NEUE_SPRACHEN[fach.sprache] ??
    (fach.sprache === 'fr'
      ? {
          title: 'Contrôle',
          time: (min: number) => `Durée : ${min} minutes`,
          aids: (a: string) => `Documents autorisés : ${a || 'aucun'}`,
          points: (n: number) => `${n} points`,
          split: (c: number, l: number) => `${c} % contenu, ${l} % langue`,
          counts: (w: number) => `compte pour ${w} %`,
          scale: (line: string) => `Barème : ${line}`,
          total: 'Total',
          labels: { writing: 'Production écrite', other: 'Autres compétences' }
        }
      : fach.sprache === 'it'
        ? {
            // Wortlaut nach der Esame di Stato („Durata massima della prova") und der Maturità des RIC
            // („Materiali e sussidi consentiti:", „per un totale di 45 punti"); Notenschlüssel als „Griglia di valutazione"
            // wie im Liceo Montale Roma (Punkte → Note)
            title: 'Verifica',
            time: (min: number) => `Durata: ${min} ${min === 1 ? 'minuto' : 'minuti'}`,
            aids: (a: string) => `Materiali e sussidi consentiti: ${a || 'nessuno'}`,
            points: (n: number) => `${n} ${n === 1 ? 'punto' : 'punti'}`,
            split: (c: number, l: number) => `${c} % contenuto, ${l} % lingua`,
            counts: (w: number) => `vale il ${w} %`,
            scale: (line: string) => `Griglia di valutazione: ${line}`,
            total: 'Totale',
            labels: {
              writing: 'Produzione scritta',
              other: 'Altre competenze'
            }
          }
        : fach.sprache === 'ru'
          ? {
              // Wortlaut nach den FIPI-Demoversionen ЕГЭ/ОГЭ 2026 und FIPI „Шкала перевода баллов в отметки“; Numerus nach der Zahl (russischPlural)
              title: 'Контрольная работа',
              time: (min: number) => `Время выполнения: ${min} ${russischPlural(min, RU_MINUTA)}`,
              aids: (a: string) => `Дополнительные материалы: ${a || 'не разрешены'}`,
              points: (n: number) => `${n} ${russischPlural(n, RU_BALL)}`,
              split: (c: number, l: number) => `содержание ${c} %, языковое оформление ${l} %`,
              counts: (w: number) => `${w} % итоговой отметки`,
              scale: (line: string) => `Шкала перевода баллов в отметки: ${line}`,
              total: 'Всего',
              labels: { writing: 'Письменная речь', other: 'Остальные разделы' }
            }
          : fach.sprache === 'es'
            ? {
                title: 'Examen',
                time: (min: number) => `Tiempo: ${min} minutos`,
                aids: (a: string) => `Material permitido: ${a || 'ninguno'}`,
                points: (n: number) => `${n} puntos`,
                split: (c: number, l: number) => `${c} % contenido, ${l} % lengua`,
                counts: (w: number) => `cuenta ${w} %`,
                scale: (line: string) => `Notas: ${line}`,
                total: 'Total',
                labels: {
                  writing: 'Expresión escrita',
                  other: 'Otras competencias'
                }
              }
            : english
              ? {
                  title: 'Test',
                  time: (min: number) => `Time: ${min} minutes`,
                  aids: (a: string) => `You may use: ${a || 'nothing'}`,
                  points: (n: number) => `${n} points`,
                  split: (c: number, l: number) => `${c} % content, ${l} % language`,
                  counts: (w: number) => `counts ${w} %`,
                  scale: (line: string) => `Marks: ${line}`,
                  total: 'Total',
                  labels: { writing: 'Writing', other: 'Other skills' }
                }
              : {
                  title: 'Klassenarbeit',
                  time: (min: number) => `Bearbeitungszeit: ${min} Minuten`,
                  aids: (a: string) => `Erlaubte Hilfsmittel: ${a || 'keine'}`,
                  points: (n: number) => `${n} Punkte`,
                  split: (c: number, l: number) => `${c} % Inhalt, ${l} % ${zweiterTeil(m.subjectId)}`,
                  counts: (w: number) => `zählt ${w} %`,
                  scale: (line: string) => `Notenschlüssel: ${line}`,
                  total: 'Gesamt',
                  labels: {
                    writing: eigeneTeilnoteLabel(m.subjectId),
                    other: istAlteSprache(m.subjectId) ? 'Begleitaufgaben' : 'Weitere Kompetenzen'
                  }
                })
  // Chinesisch: Doppelpunkt in voller Breite ohne Leerzeichen („总分：60分")
  const doppelpunkt = fach.sprache === 'zh' ? '：' : ': '
  const lines = [
    t.time(m.minutes),
    t.aids(translateAids(m.aids, fach.sprache)),
    ...grades.map((g) => {
      const value = g.points > 0 ? t.points(g.points) : t.split(inhaltsanteil(m.subjectId), 100 - inhaltsanteil(m.subjectId))
      // Eine einzige Note (Deutsch, Sachfächer): „Gesamt: 60 Punkte" statt „Weitere Kompetenzen … zählt 100 %"
      if (grades.length === 1) return `${t.total}${doppelpunkt}${value}`
      const label = g.group === 'writing' ? t.labels.writing : t.labels.other
      return `${label}${doppelpunkt}${value} – ${t.counts(g.weight)}`
    }),
    // Nur bei einer einzigen Note sinnvoll
    // Nur auf ausdrücklichen Wunsch: Der Schlüssel steht sonst allein im Erwartungshorizont
    ...(m.gradeScale ? gradeScaleGroups(exam).map((g) => t.scale(`${g.label ? `${g.label}: ` : ''}${scaleLineFuer(m, g.points)}`)) : [])
  ]
  return {
    id: 'exam-head',
    type: 'infoBox',
    variant: 'wissen',
    title: m.title || t.title,
    // Von Hand geänderter Wortlaut hat Vorrang (27.09.2026); leer = aus den Angaben berechnet
    body: m.kopfText?.trim() ? m.kopfText : lines.map((l) => `- ${l}`).join('\n')
  }
}

/**
 * Übersetzt die Arbeit in ein Arbeitsblatt, das sich anzeigen und exportieren lässt.
 *
 * `fassung` wählt bei A/B-Arbeiten die Fassung (0 = A). Sie steht dann oben auf dem Blatt –
 * im Titel des Kopfkastens bzw., ohne Kopfkasten, als eigene Zeile –, damit jedes Blatt
 * sagt, welche Fassung es ist.
 */
/** Arbeiten bekommen nur Kopf und Schluss eine Figur (26.09.2026) */
export function examToWorksheet(exam: Exam, fassung = 0): Worksheet {
  return platziereKopfUndSchluss(examToWorksheetOhneIllustration(exam, fassung))
}

function examToWorksheetOhneIllustration(exam: Exam, fassung = 0): Worksheet {
  const meta = worksheetMetaFor(exam)
  const kopfText = fachDerArbeit(exam.meta.subjectId).kopf
  const gesamt = fassungsZahl(exam)
  const f = Math.min(Math.max(0, fassung), gesamt - 1)
  const label = fassungsLabel(f, gesamt)
  // Türkisch „A Grubu", Chinesisch „A卷" – sonst „Gruppe A"
  const gruppe = label ? (kopfText.gruppenName?.(label) ?? `${kopfText.gruppe} ${label}`) : ''
  const head = examHeadBlock(exam)
  const kopf: WsBlock[] = head ? [gruppe && head.type === 'infoBox' ? { ...head, title: `${head.title} – ${gruppe}` } : head] : []
  if (!head && gruppe) kopf.push({ id: 'exam-gruppe', type: 'divider', title: gruppe })
  const blocks: WsBlock[] = kopf
  teileDerFassung(exam, f).forEach((part, i) => {
    const format = formatById(part.formatId)
    // Überschrift der Teile in der Sprache des Faches
    // Russisch: 1 балл / 2 балла / 5 баллов; Italienisch: 1 punto / 2 punti; Polnisch, Tschechisch, Niederländisch,
    // Portugiesisch über `punkteWort`; Chinesisch mit eigener Überschrift („第1部分：阅读理解（20分）")
    const sprache = fachDerArbeit(exam.meta.subjectId).sprache
    const punkteWort =
      sprache === 'ru' ? russischPlural(part.points, RU_BALL) : sprache === 'it' && part.points === 1 ? 'punto' : (kopfText.punkteWort?.(part.points) ?? kopfText.punkte)
    const points = part.points > 0 ? ` (${part.points} ${punkteWort})` : ''
    const formatName = format?.label ?? part.label
    blocks.push({
      id: `part-${part.id}`,
      type: 'divider',
      title: kopfText.teilUeberschrift?.(i + 1, formatName, part.points) ?? `${kopfText.teil} ${i + 1}: ${formatName}${points}`
    })
    blocks.push(...part.blocks.map((b) => ({ ...b, id: b.id || newId() })))
  })
  /*
   * Oberstufe: keine Schreiblinien unter Schreibaufgaben (Befund der Lehrkraft vom 27.09.2026) –
   * geschrieben wird auf eigenem Papier, und die Auffüllung bis zum Seitenende entfällt damit.
   */
  const bloecke: WsBlock[] = upperSecondary(exam.meta)
    ? blocks.map((b) => (b.type === 'task' && b.answer.kind === 'lines' ? { ...b, answer: { ...b.answer, kind: 'none' as const } } : b))
    : blocks
  /*
   * Operatorenliste (27.09.2026) – seit 01.10.2026 (später) auf der ERSTEN AUFGABENSEITE statt als
   * Anhang am Ende (Entscheidung der Lehrkraft); die ganze Liste, zweispaltig. Wo genau, regelt
   * `operatorenStelle`: nie zwischen einer Aufgabe und ihrem Material.
   */
  const operatoren = operatorenBlock(exam)
  if (operatoren) {
    // Von Hand verschoben (01.10.2026): hinter den gewählten Baustein, sonst die vorgesehene Stelle
    const nach = exam.meta.operatorenNach ? bloecke.findIndex((b) => b.id === exam.meta.operatorenNach) : -1
    bloecke.splice(nach >= 0 ? nach + 1 : operatorenStelle(bloecke), 0, operatoren)
  }
  // Fassung A behält die bisherige Blattkennung – so bleibt alles gültig, was sich darauf bezieht
  const sheet: Sheet = {
    id: f === 0 ? 'exam' : `exam-${label.toLowerCase()}`,
    label: label ? `Fassung ${label}` : 'Klassenarbeit',
    blocks: bloecke
  }
  return {
    version: 1,
    meta: {
      ...meta,
      // Kopf in der Sprache des Faches
      // Deutschsprachige Arbeiten heißen nach der Art des Leistungsnachweises (Schulaufgabe, Lernkontrolle …, model/nachweise.ts)
      title: exam.meta.title || (fachDerArbeit(exam.meta.subjectId).sprache === 'de' ? grossAnfang(`${exam.meta.nachweis ?? nachweisFuer(exam.meta).bezeichnung} ${fachDerArbeit(exam.meta.subjectId).label}`) : kopfText.titel),
      subjectLabel: fachDerArbeit(exam.meta.subjectId).art === 'fremdsprache' ? kopfText.fach : exam.meta.subjectLabel,
      labelLanguage: fachDerArbeit(exam.meta.subjectId).sprache,
      // Der Lösungsteil einer Klassenarbeit ist der Erwartungshorizont – auch im Kopf
      loesungsBegriff: 'Erwartungshorizont',
      // Fachfarbe oder Vorlagenfarbe – gilt für Arbeit und Erwartungshorizont gleichermaßen
      vorlagenfarbe: exam.meta.vorlagenfarbe,
      // Überthema im Kopf (Paket 11) – den Themenbereich setzt der Editor beim Anzeigen ein
      ueberthema: exam.meta.ueberthema,
      ueberthemaAus: exam.meta.ueberthemaAus,
      pages: Math.max(1, Math.ceil(blocks.length / 6)),
      // Im Erwartungshorizont steht der Schlüssel immer – aber nur für Teile mit Punkten
      gradeScale: {
        thresholds: exam.meta.gradeScaleThresholds,
        groups: gradeScaleGroups(exam),
        // Sekundarstufe II: Notenpunkte 0–15 nach dem Raster des Landes (26.09.2026)
        ...((r) => (r ? { punkte: { schwellen: r.schwellen, hinweis: r.hinweis } } : {}))(notenpunkteFuer(exam.meta))
      }
    },
    // Auf einer Klassenarbeit tragen die Lernenden Name, Klasse und Datum ein
    design: {
      ...exam.design,
      header: {
        ...exam.design.header,
        fields: { name: true, class: true, date: true }
      }
    },
    outline: null,
    sheets: [sheet],
    sources: [],
    createdAt: exam.createdAt
  }
}

/**
 * Stelle der Operatorenliste in den Bausteinen der Arbeit (01.10.2026): auf der Seite der ersten Aufgabe.
 *
 * - Folgt auf die Aufgaben des ersten Teils ein Seitenumbruch (Originalmaterial auf eigener Seite),
 *   ein neuer Teil oder nichts mehr, steht die Liste direkt hinter den Aufgaben – unten auf der Aufgabenseite.
 * - Steht vor der ersten Aufgabe schon Material (Text, dann Aufgaben), ebenso hinter den Aufgaben.
 * - Folgt das Material der Aufgabe ohne Umbruch (Sprachmittlung: Aufgabe, dann M1), steht die Liste
 *   VOR der Überschrift des Teils – zwischen Aufgabe und Material wirkte sie wie eine Hilfe zur Aufgabe.
 * Ohne Aufgaben: am Ende.
 */
export function operatorenStelle(bloecke: WsBlock[]): number {
  const erste = bloecke.findIndex((b) => b.type === 'task')
  if (erste < 0) return bloecke.length
  let ende = erste
  while (ende < bloecke.length && bloecke[ende].type === 'task') ende++
  const danach = bloecke[ende]
  if (!danach || danach.type === 'divider' || danach.pageBreakBefore) return ende
  // Beginn des Teils: seine Überschrift (oder der Anfang hinter dem Kopf)
  let beginn = erste
  while (beginn > 0 && bloecke[beginn - 1].type !== 'divider') beginn--
  const materialDavor = bloecke.slice(beginn, erste).some((b) => b.type !== 'divider')
  if (materialDavor) return ende
  return beginn > 0 && bloecke[beginn - 1].id.startsWith('part-') ? beginn - 1 : beginn
}

/**
 * Alle Fassungen in EINEM Dokument – je Fassung ein Blatt (wie `kurztestToWorksheetAlle`).
 * Gedacht zum Ausdrucken in einem Zug; jedes Blatt trägt seinen Gruppenbuchstaben selbst.
 */
export function examToWorksheetAlle(exam: Exam): Worksheet {
  const erste = examToWorksheet(exam, 0)
  const sheets = Array.from({ length: fassungsZahl(exam) }, (_, f) => (f === 0 ? erste.sheets[0] : examToWorksheet(exam, f).sheets[0]))
  return { ...erste, sheets }
}

/** Sind schon Aufgaben erzeugt? */
export const examHasContent = (exam: Exam): boolean => exam.parts.some((p) => p.blocks.length > 0)

/** Punkte der ganzen Arbeit, soweit über Punkte bewertet wird. */
export const examTotalPoints = (exam: Exam): number => examPoints(exam)

/** Titel beginnen groß („schriftliche Lernkontrolle“ → „Schriftliche Lernkontrolle“) */
const grossAnfang = (s: string): string => s.charAt(0).toLocaleUpperCase('de') + s.slice(1)
