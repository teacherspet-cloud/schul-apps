import { describe, expect, it } from 'vitest'
import {
  bereinige,
  mitHoerVokabular,
  vokabelnEinfuegen,
  vokabelnFuerFassungen,
  vokabelQuellen,
  vokabelRegeln,
  vokabelText,
  vokabelUmfang,
  type VokabelEintrag
} from '../src/renderer/src/modules/arbeitsblatt/generation/hoerVokabular'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { AudioBlock, PhrasesBlock, TaskBlock, Worksheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Useful vocabulary zu Hörtexten/Videos (02.10.2026) – Entscheidungen der Lehrkraft: im
 * Useful-phrases-Kasten, Erklärsprache nach Niveau, in Prüfungen sparsam (höchstens 3,
 * einsprachig), Einträge mit Wortart/Genus, Aussprachehilfe und Kontextsatz.
 */
const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 8,
  cefrLevel: 'A2+',
  ...patch
})

const SKRIPT = 'Anna: I moved to a new abode last summer.\nBen: Did the landlord let you keep the cat?\nAnna: Yes, he was very lenient about pets.'

function blatt(): WsBlock[] {
  const audio = { ...(newBlock('audio') as AudioBlock), title: 'Moving house', transcript: SKRIPT }
  const aufgabe = { ...(newBlock('task') as TaskBlock), instruction: 'Listen and answer: Why could Anna keep her cat?', audioId: audio.id }
  return [audio, aufgabe]
}

const EINTRAEGE: VokabelEintrag[] = [
  { wort: 'abode', wortart: 'n.', aussprache: '/əˈbəʊd/', kontext: 'I moved to a new abode last summer.', erklaerung: 'Wohnung, Zuhause' },
  { wort: 'lenient', wortart: 'adj.', aussprache: '', kontext: 'he was very lenient about pets', erklaerung: 'nachsichtig' }
]

describe('Regeln an die KI', () => {
  it('unter B1+: deutsche Bedeutung im Kontext; darüber einsprachig', () => {
    expect(vokabelRegeln(meta(), 'blatt')).toContain('deutsche Bedeutung IM KONTEXT')
    expect(vokabelRegeln(meta({ cefrLevel: 'B2' }), 'blatt')).toContain('einsprachige Erklärung')
  })
  it('Prüfung: höchstens 3, einsprachig, im Zweifel keine', () => {
    const r = vokabelRegeln(meta(), 'pruefung')
    expect(r).toContain('höchstens 3')
    expect(r).toContain('Im Zweifel KEINE')
    expect(r).toContain('einsprachige Erklärung')
  })
  it('Lösungsschutz, keine Kognaten, keine Überschneidung mit Redemitteln, Lautbild', () => {
    const r = vokabelRegeln(meta(), 'blatt')
    expect(r).toContain('Lösung verrät')
    expect(r).toContain('Kognaten')
    expect(r).toContain('Keine Überschneidung')
    expect(r).toContain('IPA')
  })
  it('Französisch/Spanisch: Artikel bzw. Genus', () => {
    expect(vokabelRegeln(meta({ subjectId: 'franzoesisch', subjectLabel: 'Französisch' }), 'blatt')).toContain('Genus')
  })
  it('Umfang: Sek I 4–8, Sek II 2–5, Prüfung höchstens 3', () => {
    expect(vokabelUmfang(meta({ grade: 7 }), 'blatt')).toEqual({ min: 4, max: 8 })
    expect(vokabelUmfang(meta({ grade: 12 }), 'blatt')).toEqual({ min: 2, max: 5 })
    expect(vokabelUmfang(meta(), 'pruefung').max).toBe(3)
  })
})

describe('Bereinigen', () => {
  it('ohne Doppelte, ohne Redemittel, ohne erfundenen Kontext', () => {
    const roh = [
      ...EINTRAEGE,
      { ...EINTRAEGE[0] },
      { wort: 'in my opinion', wortart: '', aussprache: '', kontext: '', erklaerung: 'meiner Meinung nach' },
      { wort: 'cat', wortart: '', aussprache: '', kontext: 'a sentence that is not in the script', erklaerung: 'Katze' }
    ]
    const out = bereinige(roh, { text: SKRIPT }, ['In my opinion'])
    expect(out.map((e) => e.wort)).toEqual(['abode', 'lenient', 'cat'])
    expect(out[2].kontext).toBe('')
    expect(out[0].kontext).toBe('I moved to a new abode last summer.')
  })
  it('Eintragstext: fett, Wortart, Aussprache', () => {
    expect(vokabelText(EINTRAEGE[0])).toBe('**abode** (n.) /əˈbəʊd/')
    expect(vokabelText(EINTRAEGE[1])).toBe('**lenient** (adj.)')
  })
})

describe('Ins Blatt', () => {
  it('ohne Phrases-Kasten: neuer Kasten direkt nach dem Hörtext', () => {
    const b = blatt()
    const q = vokabelQuellen(b)
    expect(q[0].aufgaben).toContain('Why could Anna keep her cat')
    const out = vokabelnEinfuegen(b, new Map([[b[0].id, EINTRAEGE]]), q, 'en', 'blatt')
    expect(out.map((x) => x.type)).toEqual(['audio', 'phrases', 'task'])
    const k = out[1] as PhrasesBlock
    expect(k.title).toBe('Useful vocabulary')
    expect(k.groups[0].art).toBe('vokabeln')
    expect(k.groups[0].items[0]).toEqual({ text: '**abode** (n.) /əˈbəʊd/', german: 'Wohnung, Zuhause', kontext: 'I moved to a new abode last summer.' })
  })
  it('mit Phrases-Kasten: als erste Gruppe darin; neu erzeugen ersetzt statt zu verdoppeln', () => {
    const phrasen = { ...(newBlock('phrases') as PhrasesBlock), groups: [{ label: 'Giving reasons', items: [{ text: 'That is why …', german: '' }] }] }
    const b = [...blatt(), phrasen]
    const q = vokabelQuellen(b)
    const einmal = vokabelnEinfuegen(b, new Map([[b[0].id, EINTRAEGE]]), q, 'en', 'blatt')
    const zweimal = vokabelnEinfuegen(einmal, new Map([[b[0].id, EINTRAEGE.slice(0, 1)]]), q, 'en', 'blatt')
    const k = zweimal.find((x) => x.type === 'phrases') as PhrasesBlock
    expect(zweimal.filter((x) => x.type === 'phrases')).toHaveLength(1)
    expect(k.groups.map((g) => g.label)).toEqual(['Useful vocabulary', 'Giving reasons'])
    expect(k.groups[0].items).toHaveLength(1)
  })
  it('Prüfung: Überschrift Annotations', () => {
    const b = blatt()
    const out = vokabelnEinfuegen(b, new Map([[b[0].id, EINTRAEGE]]), vokabelQuellen(b), 'en', 'pruefung')
    expect((out[1] as PhrasesBlock).title).toBe('Annotations')
  })
})

describe('Ablauf mit Test-KI', () => {
  const ki = (eintraege: VokabelEintrag[]): { fn: <T>(req: { system: string; user: string }) => Promise<T>; aufrufe: { system: string; user: string }[] } => {
    const aufrufe: { system: string; user: string }[] = []
    const fn = async <T,>(req: { system: string; user: string }): Promise<T> => {
      aufrufe.push(req)
      const id = /TEXT (\S+)/.exec(req.user)?.[1] ?? ''
      return { texte: [{ id, eintraege }] } as T
    }
    return { fn, aufrufe }
  }
  it('eine Anfrage für alle Niveaustufen; jede Stufe bekommt die Wörter', async () => {
    const a = blatt()
    const b = blatt()
    const ws = { meta: meta(), sheets: [{ id: 's1', label: '★', blocks: a }, { id: 's2', label: '★★', blocks: b }] } as unknown as Worksheet
    const { fn, aufrufe } = ki(EINTRAEGE)
    const out = await mitHoerVokabular(ws, fn)
    expect(aufrufe).toHaveLength(1)
    for (const s of out.sheets) expect(s.blocks.some((x) => x.type === 'phrases')).toBe(true)
  })
  it('Prüfung kürzt auf 3; Latein bekommt nichts (kein Hörverstehen)', async () => {
    const viele = Array.from({ length: 6 }, (_, i) => ({ ...EINTRAEGE[1], wort: `word${'abcdef'[i]}`, kontext: '' }))
    const [fassung] = await vokabelnFuerFassungen(meta(), [blatt()], 'pruefung', ki(viele).fn)
    expect((fassung.find((x) => x.type === 'phrases') as PhrasesBlock).groups[0].items).toHaveLength(3)
    const latein = ki(EINTRAEGE)
    await vokabelnFuerFassungen(meta({ subjectId: 'latein', subjectLabel: 'Latein' }), [blatt()], 'blatt', latein.fn)
    expect(latein.aufrufe).toHaveLength(0)
  })
  it('scheitert die KI, bleibt das Blatt unverändert', async () => {
    const b = blatt()
    const [out] = await vokabelnFuerFassungen(meta(), [b], 'blatt', async () => {
      throw new Error('kaputt')
    })
    expect(out).toBe(b)
  })
})
