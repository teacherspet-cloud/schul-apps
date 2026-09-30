import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { anlageWunsch } from '../src/renderer/src/modules/klassenarbeit/didactics/operatorenliste'
import { schreibGrammatikRegeln } from '../src/renderer/src/modules/klassenarbeit/didactics/schreibGrammatik'
import { translateAids } from '../src/renderer/src/modules/klassenarbeit/model/aids'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import { fachDerArbeit, formatArt, istFremdsprache } from '../src/renderer/src/modules/klassenarbeit/model/faecher'
import { formatById, formatsFor, suggestParts } from '../src/renderer/src/modules/klassenarbeit/model/formats'
import type { Exam, ExamPart, ExamSubjectId } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { examHeadBlock, examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'

/*
 * Klassenarbeit in den neuen Schulfremdsprachen (30.09.2026): Kopf in der Zielsprache mit dem
 * Numerus nach der Zahl, Formatnamen, Wörterbuchhinweise; dazu Sport (Theorie), Darstellendes
 * Spiel, Sachunterricht und DaZ.
 */
const arbeit = (subjectId: ExamSubjectId, over: Partial<Exam['meta']> = {}, parts: ExamPart[] = []): Exam =>
  ({
    version: 1,
    meta: { ...defaultExamMeta('NW', 'gymnasium', 'Gymnasium'), subjectId, subjectLabel: fachDerArbeit(subjectId).label, topic: 'Thema', grade: 8, ...over },
    parts,
    design: presetDesigns()[0],
    createdAt: ''
  }) as unknown as Exam

const aufgabe: TaskBlock = { ...(newBlock('task') as TaskBlock), id: 't1', instruction: 'x', operator: '', parts: [] }
const teil = (formatId: string, points: number, gradeGroup: 'writing' | 'other' = 'other'): ExamPart =>
  ({ id: `p-${formatId}`, formatId, label: formatById(formatId)!.label, competence: 'x', minutes: 20, points, weight: 50, gradeGroup, blocks: [aufgabe] }) as ExamPart

const ueberschriften = (e: Exam, fassung = 0): string[] =>
  examToWorksheet(e, fassung)
    .sheets[0].blocks.filter((b) => b.type === 'divider')
    .map((b) => b.title ?? '')
const kopf = (e: Exam): string => {
  const b = examHeadBlock(e)!
  return b.type === 'infoBox' ? `${b.title}\n${b.body}` : ''
}

const NEU: ExamSubjectId[] = ['niederlaendisch', 'polnisch', 'tschechisch', 'portugiesisch', 'tuerkisch', 'chinesisch']

describe('Neue Schulfremdsprachen', () => {
  it('sind Fremdsprachen mit allen Teilen, Beschriftung in der Zielsprache (nicht deutsch, nicht englisch)', () => {
    for (const f of NEU) {
      expect(istFremdsprache(f), f).toBe(true)
      const p = fachDerArbeit(f).praefix
      for (const art of ['listening', 'reading', 'mediation', 'writing', 'language', 'speaking']) {
        const fmt = formatById(`${p}-${art}`)
        expect(fmt?.subject, `${f} ${art}`).toBe(f)
        expect(formatArt(`${p}-${art}`)).toBe(art)
        expect(fmt!.label, `${f} ${art}`).not.toBe(formatById(`en-${art}`)!.label)
        expect(fmt!.label, `${f} ${art}`).not.toMatch(/^(Hörverstehen|Leseverstehen|Schreiben|Sprachmittlung)/)
      }
      const teile = suggestParts(f, 8, 60, 90)
      expect(teile.find((t) => t.gradeGroup === 'writing')?.formatId).toBe(`${p}-writing`)
      // Italienisch/Russisch-Regel: keine amtliche Operatorenliste in diesen Sprachen
      expect(anlageWunsch(arbeit(f).meta).sprache).toBeUndefined()
    }
    expect(formatById('pl-reading')!.label).toBe('Rozumienie tekstów pisanych')
    expect(formatById('cs-writing')!.label).toBe('Písemný projev')
    expect(formatById('zh-reading')!.label).toBe('阅读理解')
  })

  it('Polnisch: 1 punkt, 2 punkty, 5 punktów, 12 punktów, 22 punkty; Minuten ebenso', () => {
    const e = arbeit('polnisch', { infoBox: true, minutes: 45 } as never, [teil('pl-reading', 1), teil('pl-language', 2), teil('pl-listening', 5), teil('pl-mediation', 22)])
    expect(ueberschriften(e)).toEqual([
      'Część 1: Rozumienie tekstów pisanych (1 punkt)',
      'Część 2: Znajomość środków językowych (2 punkty)',
      'Część 3: Rozumienie ze słuchu (5 punktów)',
      'Część 4: Przetwarzanie tekstu (22 punkty)'
    ])
    expect(kopf(e)).toContain('Czas pracy: 45 minut')
    expect(kopf(arbeit('polnisch', { infoBox: true, minutes: 22 } as never, [teil('pl-reading', 12)]))).toMatch(/Czas pracy: 22 minuty[\s\S]*Razem: 12 punktów/)
    expect(kopf(e)).toContain('Sprawdzian')
  })

  it('Tschechisch: 1 bod, 2 body, 5 bodů, 22 bodů; „Časový limit", Skupina', () => {
    const e = arbeit('tschechisch', { infoBox: true, minutes: 45 } as never, [teil('cs-reading', 1), teil('cs-language', 2), teil('cs-listening', 5), teil('cs-mediation', 22)])
    const t = ueberschriften(e)
    expect(t.slice(-4)).toEqual([
      'Část 1: Čtení s porozuměním (1 bod)',
      'Část 2: Jazykové prostředky (2 body)',
      'Část 3: Poslech s porozuměním (5 bodů)',
      'Část 4: Mediace (22 bodů)'
    ])
    expect(kopf(e)).toContain('Časový limit: 45 minut')
    expect(kopf(e)).toContain('Písemná práce')
  })

  it('Niederländisch und Portugiesisch: Singular bei 1, sonst Plural', () => {
    const nl = arbeit('niederlaendisch', { infoBox: true, minutes: 45 } as never, [teil('nl-reading', 1), teil('nl-listening', 20)])
    expect(ueberschriften(nl)).toEqual(['Deel 1: Leesvaardigheid (1 punt)', 'Deel 2: Luistervaardigheid (20 punten)'])
    expect(kopf(nl)).toMatch(/Proefwerk[\s\S]*Tijdsduur: 45 minuten[\s\S]*Toegestane hulpmiddelen/)
    const pt = arbeit('portugiesisch', { infoBox: true, minutes: 45 } as never, [teil('pt-reading', 1), teil('pt-listening', 20)])
    expect(ueberschriften(pt)).toEqual(['Parte 1: Compreensão escrita (1 ponto)', 'Parte 2: Compreensão oral (20 pontos)'])
    expect(kopf(pt)).toMatch(/Teste[\s\S]*Duração: 45 minutos/)
  })

  it('Türkisch: nach Zahlen Singular (20 puan, 45 dakika), Fassung „A Grubu", Prozent vorangestellt', () => {
    const e = arbeit('tuerkisch', { infoBox: true, minutes: 45 } as never, [teil('tr-reading', 1), teil('tr-listening', 20)])
    expect(ueberschriften(e)).toEqual(['Bölüm 1: Okuma (1 puan)', 'Bölüm 2: Dinleme (20 puan)'])
    expect(kopf(e)).toMatch(/Yazılı Sınav[\s\S]*Süre: 45 dakika[\s\S]*Toplam: 21 puan/)
    const titel = (e: Exam, f: number): string => (examToWorksheet(e, f).sheets[0].blocks[0] as { title?: string }).title ?? ''
    expect(titel(arbeit('tuerkisch', { infoBox: true } as never, [{ ...teil('tr-reading', 10), weitereFassungen: [[aufgabe]] } as ExamPart]), 1)).toBe('Yazılı Sınav – B Grubu')
    expect(titel(arbeit('chinesisch', { infoBox: true } as never, [{ ...teil('zh-reading', 10), weitereFassungen: [[aufgabe]] } as ExamPart]), 0)).toBe('测验 – A卷')
    const zwei = examHeadBlock(arbeit('tuerkisch', { infoBox: true } as never, [teil('tr-reading', 20), teil('tr-writing', 0, 'writing')]))!
    expect(zwei.type === 'infoBox' && zwei.body).toMatch(/içerik %40, dil %60/)
  })

  it('Chinesisch: „第1部分：阅读理解（20分）", Kopf mit vollbreitem Doppelpunkt, Hilfsmittel mit „、"', () => {
    const e = arbeit('chinesisch', { infoBox: true, minutes: 45, aids: 'einsprachiges Wörterbuch, zweisprachiges Wörterbuch' } as never, [teil('zh-reading', 20), teil('zh-listening', 1)])
    expect(ueberschriften(e)).toEqual(['第1部分：阅读理解（20分）', '第2部分：听力理解（1分）'])
    expect(kopf(e)).toContain('考试时间：45分钟')
    expect(kopf(e)).toContain('允许使用：单语词典、双语词典')
    expect(kopf(e)).toContain('总分：21分')
  })

  it('Wörterbuchhinweise in allen neuen Sprachen; Unbekanntes bleibt stehen', () => {
    expect(translateAids('zweisprachiges Wörterbuch', 'nl')).toBe('tweetalig woordenboek')
    expect(translateAids('einsprachiges Wörterbuch', 'pl')).toBe('słownik jednojęzyczny')
    expect(translateAids('zweisprachiges Wörterbuch', 'cs')).toBe('překladový slovník')
    expect(translateAids('ein- und zweisprachiges Wörterbuch', 'pt')).toBe('dicionário monolingue e dicionário bilingue')
    expect(translateAids('zweisprachiges Wörterbuch', 'tr')).toBe('iki dilli sözlük')
    expect(translateAids('keine Hilfsmittel', 'zh')).toMatch(/^无/)
    expect(translateAids('Lupe', 'pl')).toBe('Lupe')
  })

  it('Schreibgrammatik: Muster in der Zielsprache', () => {
    const e = arbeit('polnisch', {}, [{ ...teil('pl-writing', 0, 'writing'), grammatik: { themen: [], frei: 'czas przeszły', modus: 'anzahl', anzahl: 3, bewertung: 'integriert' } } as ExamPart])
    expect(schreibGrammatikRegeln(e, e.parts[0])).toContain('Użyj co najmniej 3 razy tej konstrukcji: czas przeszły.')
  })
})

describe('Sport, Darstellendes Spiel, Sachunterricht, DaZ', () => {
  it('Sport: nur Theorie, Sek I als nicht fachspezifisch belegt gekennzeichnet', () => {
    const f = formatsFor('sport', 8)
    expect(f.map((x) => x.id)).toEqual(['sp-wissen', 'sp-bewegung', 'sp-training'])
    expect(formatById('sp-wissen')!.note).toContain('nicht fachspezifisch belegt')
    expect(formatsFor('sport', 12).some((x) => x.id === 'sp-eroerterung')).toBe(true)
    expect(examToWorksheet(arbeit('sport', {}, [teil('sp-wissen', 10)])).meta.labelLanguage).toBe('de')
  })

  it('Darstellendes Spiel: Formate aus den EPA abgeleitet', () => {
    expect(formatsFor('darstellendes-spiel', 9).length).toBeGreaterThan(2)
    expect(formatsFor('darstellendes-spiel', 9).every((x) => x.note?.includes('nicht fachspezifisch belegt'))).toBe(true)
  })

  it('Sachunterricht: nur Grundschule, kurze Formate', () => {
    expect(formatsFor('sachunterricht', 3).length).toBeGreaterThan(2)
    expect(formatsFor('sachunterricht', 7)).toEqual([])
    const teile = suggestParts('sachunterricht', 3, 20, 30)
    expect(teile.reduce((n, t) => n + t.points, 0)).toBe(20)
  })

  it('DaZ: Teile nach dem DSD I, ohne Sprachmittlung, deutscher Kopf, Schreiben als eigene Teilnote', () => {
    expect(formatById('daz-mediation')).toBeUndefined()
    expect(formatById('daz-writing')!.label).toBe('Schriftliche Kommunikation')
    expect(formatById('daz-reading')!.note).toContain('nicht fachspezifisch belegt')
    expect(formatsFor('daz', 3).length).toBeGreaterThan(2)
    const teile = suggestParts('daz', 9, 60, 90)
    expect(teile.map((t) => t.formatId)).toEqual(['daz-reading', 'daz-writing'])
    const e = arbeit('daz', { infoBox: true, minutes: 45 } as never, [teil('daz-reading', 20), teil('daz-writing', 0, 'writing')])
    expect(kopf(e)).toContain('Bearbeitungszeit: 45 Minuten')
    expect(kopf(e)).toContain('Schreiben:')
    expect(ueberschriften(e)[0]).toBe('Teil 1: Leseverstehen (20 Punkte)')
  })
})
