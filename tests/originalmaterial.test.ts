import { describe, expect, it } from 'vitest'
import type { GeladeneQuelle, Quellentreffer } from '../src/shared/types'
import type { OriginalMaterialAblage, Sheet, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import {
  beschaffeOriginalmaterial,
  materialBausteine,
  materialSprache,
  netzAuftrag,
  quellenangabeMitAbruf,
  quellentypen,
  setzeMaterialEin,
  type MaterialDienste,
  type MaterialWunsch
} from '../src/renderer/src/modules/arbeitsblatt/generation/originalmaterial'

/*
 * Wunsch der Lehrkraft (24.09.2026): Die App soll im Hintergrund nach Originalmaterialien
 * suchen und sie auf die Längenvorgabe kürzen dürfen. Findet sich nichts, darf ein
 * ARBEITSBLATT auf einen gekennzeichneten Autorentext ausweichen – eine KLAUSUR nicht.
 *
 * Getestet wird mit nachgebildeter KI und nachgebildeten Archiven: Der Ablauf muss auch dann
 * richtig entscheiden, wenn die KI etwas Unsinniges zurückgibt – und das tut sie irgendwann.
 */
/*
 * Die Meta einer ÜBUNGSKLAUSUR. Die Tests gaben der Funktion frueher einen Schalter mit –
 * und uebersahen damit, dass der Erzeugungsweg der App ihn gar nicht setzte. Seitdem leitet
 * die Funktion die Reihenfolge aus DIESEN Angaben ab, und die Tests geben sie so mit, wie
 * die App sie hat.
 */
const klausurMeta = (subjectId: string): Pick<WorksheetMeta, 'subjectId' | 'abitur'> => ({
  subjectId,
  abitur: { an: true, niveau: 'eA', aufgabenart: 'analyse', klausur: true }
})

const ORIGINAL = Array.from(
  { length: 12 },
  (_, i) =>
    `Absatz ${i + 1}: Die Versammlung beriet über den Antrag, und die Meinungen gingen weit auseinander, weil jeder Redner andere Erfahrungen zugrunde legte.`
).join(' ')

const treffer = (over: Partial<Quellentreffer> = {}): Quellentreffer => ({
  titel: 'Rede vor der Versammlung',
  urheber: 'Anna Berg',
  url: 'https://de.wikisource.org/wiki/Rede',
  herkunft: 'wikisource',
  auszug: 'Die Versammlung beriet …',
  ...over
})

const dienste = (over: Partial<MaterialDienste> = {}): MaterialDienste => ({
  suche: async () => [treffer()],
  laden: async (url): Promise<GeladeneQuelle> => ({
    url,
    titel: 'Rede',
    text: ORIGINAL,
    wortzahl: 264
  }),
  ...over
})

const wunsch = (over: Partial<MaterialWunsch> = {}): MaterialWunsch => ({
  thema: 'Meinungsbildung',
  fach: 'Politik-Wirtschaft',
  fachId: 'politik',
  sprache: 'de',
  jahrgang: 12,
  zielWortzahl: 120,
  pruefung: false,
  ...over
})

/** Nachgebildete KI: liefert Suchbegriffe und danach den Kürzungsauftrag. */
const ki =
  (kuerzung: Record<string, unknown>) =>
  async <T>(req: { schemaName?: string }): Promise<T> =>
    (req.schemaName === 'material_suche' ? { begriffe: ['Anna Berg Rede'], gesucht: 'eine Rede' } : kuerzung) as T

const SAUBER = {
  nummer: 0,
  begruendung: 'passt',
  gekuerzt: `Absatz 1: Die Versammlung beriet über den Antrag, und die Meinungen gingen weit auseinander, weil jeder Redner andere Erfahrungen zugrunde legte. [...] Absatz 12: Die Versammlung beriet über den Antrag, und die Meinungen gingen weit auseinander, weil jeder Redner andere Erfahrungen zugrunde legte.`,
  quellenangabe: 'Anna Berg: Rede vor der Versammlung, 1920.',
  vorbemerkung: ''
}

describe('Originalmaterial beschaffen', () => {
  it('liefert den gekürzten Text mit Quellenangabe und Protokoll', async () => {
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch(),
      dienste: dienste(),
      ai: ki(SAUBER)
    })
    expect(e.art).toBe('gefunden')
    if (e.art !== 'gefunden') return
    expect(e.material.text).toContain('[...]')
    expect(e.material.pruefung.ok).toBe(true)
    expect(e.material.hinweis).toContain('gekürzt')
    expect(e.material.protokoll.join(' ')).toContain('Auslassung 1')
  })

  it('ergänzt Fundort und Abrufdatum in der Quellenangabe', async () => {
    /*
     * § 63 UrhG verlangt eine deutliche Quellenangabe. Bei Internetquellen gehört das
     * Abrufdatum dazu – die KI kennt das heutige Datum nicht zuverlässig, die App schon.
     */
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch(),
      dienste: dienste(),
      ai: ki(SAUBER)
    })
    if (e.art !== 'gefunden') throw new Error('kein Material')
    expect(e.material.quellenangabe).toContain('https://de.wikisource.org/wiki/Rede')
    expect(e.material.quellenangabe).toMatch(/abgerufen am \d{2}\.\d{2}\.\d{4}/)
  })

  it('meldet einen umgeschriebenen Satz, statt ihn durchzulassen', async () => {
    /*
     * Der gefährlichste Fall: Die KI „glättet" beim Kürzen. Auf dem Blatt steht das dann mit
     * Quellenangabe und liest sich wie ein Zitat.
     */
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch(),
      dienste: dienste(),
      ai: ki({
        ...SAUBER,
        gekuerzt: 'Absatz 1: Die Versammlung stritt über den Antrag, und die Meinungen gingen auseinander.'
      })
    })
    if (e.art !== 'gefunden') throw new Error('kein Material')
    expect(e.material.pruefung.ok).toBe(false)
    expect(e.material.protokoll.join(' ')).toContain('ACHTUNG')
  })
})

describe('Wenn nichts Passendes gefunden wird', () => {
  it('weicht beim Arbeitsblatt auf einen Autorentext aus', async () => {
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ pruefung: false }),
      dienste: dienste({ suche: async () => [] }),
      ai: ki(SAUBER)
    })
    expect(e.art).toBe('autorentext')
  })

  it('bricht bei einer Klausur ab', async () => {
    /*
     * Entscheidung der Lehrkraft: In der Prüfung ist die Quellenarbeit der Gegenstand. Ein
     * erfundener „Originaltext" wäre dort nicht nur rechtlich heikel, sondern wertlos.
     */
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ pruefung: true }),
      dienste: dienste({ suche: async () => [] }),
      ai: ki(SAUBER)
    })
    expect(e.art).toBe('abbruch')
    if (e.art === 'abbruch') expect(e.grund).toContain('kein Originaltext')
  })

  it('bricht auch ab, wenn die KI keinen der Texte für geeignet hält', async () => {
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ pruefung: true }),
      dienste: dienste(),
      ai: ki({ ...SAUBER, nummer: -1, begruendung: 'Thema verfehlt' })
    })
    expect(e.art).toBe('abbruch')
    if (e.art === 'abbruch') expect(e.grund).toBe('Thema verfehlt')
  })

  it('verwirft Quellen, die für die Zielwortzahl zu kurz sind', async () => {
    /*
     * Aus 40 Wörtern lassen sich keine 800 machen. Ohne diese Grenze bekäme die Lehrkraft
     * einen Textschnipsel, der die halbe Aufgabe nicht trägt.
     */
    const kurz = dienste({
      laden: async (url) => ({
        url,
        titel: 'Kurz',
        text: 'Nur ein kurzer Satz.',
        wortzahl: 4
      })
    })
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ zielWortzahl: 800, pruefung: true }),
      dienste: kurz,
      ai: ki(SAUBER)
    })
    expect(e.art).toBe('abbruch')
    if (e.art === 'abbruch') expect(e.grund).toContain('zu kurz')
  })

  it('gibt eine nicht ladbare Quelle nicht als Material aus', async () => {
    // Eine Adresse, die es nicht gibt, darf nicht als Fundstelle aufs Blatt
    const kaputt = dienste({
      laden: async (url) => ({
        url,
        titel: '',
        text: '',
        wortzahl: 0,
        fehler: 'nicht erreichbar'
      })
    })
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ pruefung: true }),
      dienste: kaputt,
      ai: ki(SAUBER)
    })
    expect(e.art).toBe('abbruch')
  })
})

describe('Auswahl durch die Lehrkraft (Sek II)', () => {
  it('nimmt genau die gewählte Quelle', async () => {
    const zwei = dienste({
      suche: async () => [treffer({ url: 'https://de.wikisource.org/wiki/A', titel: 'A' }), treffer({ url: 'https://de.wikisource.org/wiki/B', titel: 'B' })]
    })
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch(),
      dienste: zwei,
      ai: ki(SAUBER),
      auswahl: async () => 'https://de.wikisource.org/wiki/B'
    })
    if (e.art !== 'gefunden') throw new Error('kein Material')
    expect(e.material.quelle.titel).toBe('B')
  })

  it('bricht ab, wenn die Lehrkraft keine Quelle übernimmt', async () => {
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ pruefung: true }),
      dienste: dienste(),
      ai: ki(SAUBER),
      auswahl: async () => null
    })
    expect(e.art).toBe('abbruch')
  })

  it('reicht die gefundenen Treffer immer mit heraus', async () => {
    // Auch bei Abbruch: Die Lehrkraft soll sehen, was gefunden wurde, statt nur „nichts gefunden"
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ pruefung: true }),
      dienste: dienste(),
      ai: ki({ ...SAUBER, nummer: -1 })
    })
    expect(e.kandidaten.map((k) => k.titel)).toEqual(['Rede vor der Versammlung'])
  })
})

describe('Quellenangabe', () => {
  it('lässt eine vollständige Angabe unverändert bis auf das Abrufdatum', () => {
    const a = quellenangabeMitAbruf('Anna Berg: Rede, 1920. Fundort: https://x.de/rede (abgerufen am 01.01.2026)', treffer({ url: 'https://x.de/rede' }))
    expect(a).toBe('Anna Berg: Rede, 1920. Fundort: https://x.de/rede (abgerufen am 01.01.2026)')
  })

  it('springt ein, wenn die KI gar keine Angabe liefert', () => {
    const a = quellenangabeMitAbruf('', treffer(), new Date('2026-09-24T10:00:00'))
    expect(a).toContain('Anna Berg')
    expect(a).toContain('Rede vor der Versammlung')
    expect(a).toContain('abgerufen am 24.09.2026')
  })
})

describe('Den Originaltext ins Blatt setzen', () => {
  let n = 0
  const id = (): string => `b${++n}`
  const ablage = (over: Partial<OriginalMaterialAblage> = {}): OriginalMaterialAblage => ({
    titel: 'Rede vor der Versammlung',
    urheber: 'Anna Berg',
    url: 'https://de.wikisource.org/wiki/Rede',
    text: 'Die Versammlung beriet. [...] Sie beschloss.',
    quellenangabe: 'Anna Berg: Rede, 1920. Fundort: https://de.wikisource.org/wiki/Rede',
    hinweis: 'Der Text wurde für diese Aufgabe gekürzt.',
    protokoll: ['Auslassung 1: 20 Wörter'],
    wortlautGeprueft: true,
    ...over
  })

  it('setzt den Wortlaut unverändert ein', () => {
    /*
     * Die APP setzt den Text ein, nicht die KI. Ein Sprachmodell, das einen Text
     * „übernimmt", ändert dabei Kleinigkeiten – und auf dem Blatt stünde das mit
     * Quellenangabe da wie ein Zitat.
     */
    const bausteine = materialBausteine(ablage(), { subjectId: 'deutsch' }, id)
    const text = bausteine.find((b) => b.type === 'text')
    expect(text?.type === 'text' && text.body).toBe('Die Versammlung beriet. [...] Sie beschloss.')
  })

  it('führt Quellenangabe und Änderungshinweis zusammen', () => {
    // § 62 Abs. 5 UrhG verlangt die sichtbare Kennzeichnung, § 63 die Quellenangabe
    const bausteine = materialBausteine(ablage(), { subjectId: 'deutsch' }, id)
    const text = bausteine.find((b) => b.type === 'text')
    const quelle = text?.type === 'text' ? text.source : ''
    expect(quelle).toContain('Anna Berg')
    expect(quelle).toContain('gekürzt')
  })

  it('gibt dem Quellentext Zeilennummern', () => {
    // Ohne sie lässt sich kein Textbeleg angeben (EPA Geschichte 3.3.3)
    const text = materialBausteine(ablage(), { subjectId: 'geschichte' }, id).find((b) => b.type === 'text')
    expect(text?.type === 'text' && text.lineNumbers).toBe(true)
  })

  it('stellt die Vorbemerkung als eigenen Baustein davor', () => {
    /*
     * Stünde sie im Text, wäre sie Teil des Zitats – und damit genau der Übergangssatz, den
     * das Änderungsverbot des § 62 Abs. 1 UrhG ausschließt.
     */
    const bausteine = materialBausteine(ablage({ vorbemerkung: 'Die Rede hielt Berg 1920 vor dem Stadtrat.' }), { subjectId: 'deutsch' }, id)
    expect(bausteine[0].type).toBe('infoBox')
    expect(bausteine[1].type).toBe('text')
    const text = bausteine[1]
    expect(text.type === 'text' && text.body).not.toContain('Stadtrat')
  })

  it('erfindet im Materialkopf nichts, was die App nicht weiß', () => {
    /*
     * Entstehungsdatum und Textsorte kennt die App nicht. Sie zu erfinden wäre schlimmer als
     * die Lücke: An genau diesen Angaben hängt die Beurteilung der Standortgebundenheit.
     */
    const text = materialBausteine(ablage(), { subjectId: 'geschichte' }, id).find((b) => b.type === 'text')
    const kopf = text?.type === 'text' ? text.sourceHeader : undefined
    expect(kopf?.author).toBe('Anna Berg')
    expect(kopf?.date).toBe('')
    expect(kopf?.textType).toBe('')
  })

  it('setzt das Material hinter die Lernziele', () => {
    const sheet = {
      id: 's',
      label: 'Arbeitsblatt',
      blocks: [
        {
          id: 'lz',
          type: 'learningGoals' as const,
          title: 'Das lernst du',
          goals: ['Ich kann …']
        },
        { id: 'a1', type: 'divider' as const, title: '' }
      ]
    }
    const neu = setzeMaterialEin(sheet, ablage(), { subjectId: 'deutsch' }, id)
    expect(neu.blocks.map((b) => b.type)).toEqual(['learningGoals', 'text', 'divider'])
  })

  it('setzt es an den Anfang, wenn es keine Lernziele gibt', () => {
    const sheet = {
      id: 's',
      label: 'Arbeitsblatt',
      blocks: [{ id: 'a1', type: 'divider' as const, title: '' }]
    }
    const neu = setzeMaterialEin(sheet, ablage(), { subjectId: 'deutsch' }, id)
    expect(neu.blocks.map((b) => b.type)).toEqual(['text', 'divider'])
  })
})

describe('Filtern und Ranken vor der Anzeige', () => {
  /*
   * Wunsch der Lehrkraft (24.09.2026): „um gefundenes Material zu filtern und zu ranken
   * bevor es den Nutzern gezeigt wird."
   *
   * Eine Archivsuche liefert zuverlässig auch Registerseiten und Scans. Bekäme die Lehrkraft
   * die ungefiltert vorgelegt, müsste sie jeden Treffer selbst öffnen – und genau die Arbeit
   * soll ihr die Suche abnehmen.
   */
  /*
   * Abwechslungsreich, nicht ein Satz dreissig Mal: Die Pruefung verwirft Texte mit vielen
   * woertlichen Wiederholungen (C4-Deduplizierung) – und zwar zu Recht.
   */
  const satz = (i: number): string =>
    `Am ${i + 1}. Tag beriet der Rat über die Lage der Stadt, und die Bürger verlangten, dass man ihnen die Gründe für den Beschluss nenne. `
  const absaetze = (n: number): string => Array.from({ length: n }, (_, i) => satz(i)).join('')
  const guterText = absaetze(30)
  const kurzerText = absaetze(6)
  const register = Array.from({ length: 60 }, (_, i) => `Müller, Anton ${100 + i}`).join('\n')

  const dreiTreffer = (): Quellentreffer[] => [
    treffer({ url: 'https://x.de/register', titel: 'Register' }),
    treffer({ url: 'https://x.de/kurz', titel: 'Kurzer Text' }),
    treffer({ url: 'https://x.de/gut', titel: 'Guter Text' })
  ]
  const texte: Record<string, string> = {
    'https://x.de/register': register,
    'https://x.de/kurz': kurzerText,
    'https://x.de/gut': guterText
  }
  const archiv = (): MaterialDienste => ({
    suche: async () => dreiTreffer(),
    laden: async (url) => ({
      url,
      titel: '',
      text: texte[url] ?? '',
      wortzahl: (texte[url] ?? '').split(/\s+/).length
    })
  })

  it('zeigt der Lehrkraft nur die brauchbaren Funde', async () => {
    let gezeigt: string[] = []
    await beschaffeOriginalmaterial({
      wunsch: wunsch({ zielWortzahl: 400, jahrgang: 12 }),
      dienste: archiv(),
      ai: ki(SAUBER),
      auswahl: async (t) => {
        gezeigt = t.map((x) => x.treffer.titel)
        return t[0]?.treffer.url ?? null
      }
    })
    expect(gezeigt).toContain('Guter Text')
    expect(gezeigt, 'Ein Register ist kein Unterrichtsmaterial').not.toContain('Register')
    expect(gezeigt, 'Zu kurz für 400 Wörter').not.toContain('Kurzer Text')
  })

  it('stellt den am besten passenden Fund nach vorn', async () => {
    let erster = ''
    await beschaffeOriginalmaterial({
      wunsch: wunsch({ zielWortzahl: 400, jahrgang: 12 }),
      dienste: archiv(),
      ai: ki(SAUBER),
      auswahl: async (t) => {
        erster = t[0]?.treffer.titel ?? ''
        return t[0]?.treffer.url ?? null
      }
    })
    expect(erster).toBe('Guter Text')
  })

  it('gibt der Lehrkraft zu jedem Fund einen messbaren Befund', async () => {
    // Die Reihenfolge muss nachvollziehbar sein – sonst kann man ihr nicht widersprechen
    let befunde: string[] = []
    await beschaffeOriginalmaterial({
      wunsch: wunsch({ zielWortzahl: 400, jahrgang: 12 }),
      dienste: archiv(),
      ai: ki(SAUBER),
      auswahl: async (t) => {
        befunde = t.map((x) => x.befund)
        return t[0]?.treffer.url ?? null
      }
    })
    expect(befunde[0]).toContain('Wörter')
    expect(befunde[0]).toMatch(/leicht|passend|anspruchsvoll/)
  })

  it('sagt beim Abbruch, was geprüft und warum verworfen wurde', async () => {
    /*
     * „Nichts gefunden" allein wäre für die Lehrkraft nicht von einem Programmfehler zu
     * unterscheiden.
     */
    const nurRegister = (): MaterialDienste => ({
      suche: async () => [treffer({ url: 'https://x.de/register', titel: 'Register' })],
      laden: async (url) => ({ url, titel: '', text: register, wortzahl: 120 })
    })
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ pruefung: true }),
      dienste: nurRegister(),
      ai: ki(SAUBER)
    })
    expect(e.art).toBe('abbruch')
    if (e.art === 'abbruch') {
      expect(e.grund).toContain('Register')
      expect(e.grund).toMatch(/Verzeichnis|Listenzeilen|zu kurz/)
    }
  })
})

describe('Suche im offenen Netz', () => {
  const SATZ = (i: number): string => `Am ${i + 1}. Tag beriet der Rat über die Lage der Stadt, und die Bürger verlangten eine Begründung des Beschlusses. `
  const langerText = Array.from({ length: 30 }, (_, i) => SATZ(i)).join('')

  it('nimmt Netzfunde zusätzlich zu den Archiven auf', async () => {
    /*
     * Die Archive enthalten fast nur Älteres. Für eine Sprachmittlung braucht es einen
     * heutigen Gebrauchstext, und für Politik oder Erdkunde eine Datenbasis, die „so zeitnah
     * wie möglich" ist (EPA Geographie 3.3).
     */
    let gezeigt: string[] = []
    await beschaffeOriginalmaterial({
      wunsch: wunsch({ zielWortzahl: 300, jahrgang: 12 }),
      dienste: {
        suche: async () => [],
        netzsuche: async () => [
          treffer({
            url: 'https://zeitung.de/kommentar',
            titel: 'Kommentar',
            herkunft: 'netz'
          })
        ],
        laden: async (url) => ({
          url,
          titel: 'Kommentar',
          text: langerText,
          wortzahl: 540
        })
      },
      ai: ki(SAUBER),
      auswahl: async (t) => {
        gezeigt = t.map((x) => x.treffer.titel)
        return t[0]?.treffer.url ?? null
      }
    })
    expect(gezeigt).toEqual(['Kommentar'])
  })

  it('kommt ohne Netzsuche aus', async () => {
    /*
     * Nicht jeder KI-Anbieter kann im Netz suchen. Fehlt die Fähigkeit, bleibt es bei den
     * Archiven – weniger Auswahl, aber kein Fehler.
     */
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ zielWortzahl: 300 }),
      dienste: {
        suche: async () => [treffer()],
        laden: async (url) => ({
          url,
          titel: '',
          text: langerText,
          wortzahl: 540
        })
      },
      ai: ki(SAUBER)
    })
    expect(e.art).toBe('gefunden')
  })

  it('lässt sich von einer scheiternden Netzsuche nicht aufhalten', async () => {
    // Eine fremde Suche, die ausfällt, darf nicht die ganze Beschaffung mitreißen
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ zielWortzahl: 300 }),
      dienste: {
        suche: async () => [treffer()],
        netzsuche: async () => {
          throw new Error('Anbieter antwortet nicht')
        },
        laden: async (url) => ({
          url,
          titel: '',
          text: langerText,
          wortzahl: 540
        })
      },
      ai: ki(SAUBER)
    })
    expect(e.art).toBe('gefunden')
  })

  it('verwirft eine erfundene Adresse, weil sie sich nicht laden lässt', async () => {
    /*
     * Der eigentliche Grund, warum die App jede Fundstelle SELBST öffnet: Ein Sprachmodell
     * erfindet eine Adresse ebenso flüssig wie ein Zitat. Auf dem Blatt sähe beides echt aus.
     */
    const e = await beschaffeOriginalmaterial({
      wunsch: wunsch({ pruefung: true }),
      dienste: {
        suche: async () => [],
        netzsuche: async () => [
          treffer({
            url: 'https://gibtesnicht.example/artikel',
            titel: 'Erfunden',
            herkunft: 'netz'
          })
        ],
        laden: async (url) => ({
          url,
          titel: '',
          text: '',
          wortzahl: 0,
          fehler: 'Die Quelle ist nicht erreichbar (404).'
        })
      },
      ai: ki(SAUBER)
    })
    expect(e.art).toBe('abbruch')
    if (e.art === 'abbruch') expect(e.grund).toContain('nicht erreichbar')
  })

  it('schreibt den Auftrag an die Websuche in Worten, nicht als Suchmaschinenanfrage', () => {
    const auftrag = netzAuftrag(wunsch({ zielWortzahl: 700, jahrgang: 12, pruefung: true }), ['Anna Berg Rede'])
    expect(auftrag).toContain('700 Wörter')
    expect(auftrag).toContain('Anna Berg Rede')
    // Für eine Klausur gilt zusätzlich: nicht im Unterricht behandelt (EPA Geschichte 3.3.3)
    expect(auftrag).toContain('Klausur')
  })
})

describe('Sprache des gesuchten Materials', () => {
  /*
   * Vorgabe der Lehrkraft (24.09.2026): „stell sicher, dass für sprachmittlungsaufgaben
   * (mediation) texte in der muttersprache der schüler in der sek ii gesucht werden als
   * originalmaterial."
   *
   * Das ist keine Feinheit, sondern die Aufgabe selbst: Bei der Sprachmittlung geben die
   * Lernenden einen DEUTSCHEN Ausgangstext sinngemäß in der Fremdsprache wieder. Ein
   * englischer Ausgangstext machte daraus eine Zusammenfassung – die geprüfte Leistung, das
   * Überbrücken zwischen zwei Sprachen, fiele weg.
   */
  it('sucht für die Sprachmittlung auf Deutsch, auch im Fremdsprachenunterricht', () => {
    expect(materialSprache({ id: 'englisch', foreignLanguage: 'en' }, true)).toBe('de')
    expect(materialSprache({ id: 'franzoesisch', foreignLanguage: 'fr' }, true)).toBe('de')
  })

  it('sucht sonst in der Zielsprache des Faches', () => {
    expect(materialSprache({ id: 'englisch', foreignLanguage: 'en' }, false)).toBe('en')
    expect(materialSprache({ id: 'spanisch', foreignLanguage: 'es' }, false)).toBe('es')
    expect(materialSprache({ id: 'latein' }, false)).toBe('la')
  })

  it('sucht in den übrigen Fächern auf Deutsch', () => {
    expect(materialSprache({ id: 'geschichte' }, false)).toBe('de')
    expect(materialSprache({ id: 'politik' }, false)).toBe('de')
  })
})

describe('Suchstrategie', () => {
  /*
   * Vorgabe der Lehrkraft (24.09.2026): „suche allgemein nach material, nur gezielt nach
   * autor, titel etc., wenn dies erfolgsversprechend ist."
   *
   * Das trifft die Sache: Zu „Migration" gibt es kein bestimmtes Werk, und eine Suche nach
   * Urheber und Titel geht dort ins Leere. Zu „Loreley" gibt es eines, und nur die gezielte
   * Suche findet es.
   */
  it('lässt die KI zuerst allgemein nach dem Thema suchen', async () => {
    let auftrag = ''
    const ki = async <T>(req: { user?: string; schemaName?: string }): Promise<T> => {
      if (req.schemaName === 'material_suche') auftrag = req.user ?? ''
      return (req.schemaName === 'material_suche' ? { begriffe: ['x'], gesucht: '' } : SAUBER) as T
    }
    await beschaffeOriginalmaterial({
      wunsch: wunsch(),
      dienste: dienste({ suche: async () => [] }),
      ai: ki
    })
    expect(auftrag).toContain('SUCHE ZUERST ALLGEMEIN NACH MATERIAL ZUM THEMA')
    expect(auftrag).toContain('Textsorte')
  })

  it('erlaubt die gezielte Suche nur, wo sie Aussicht auf Erfolg hat', async () => {
    let auftrag = ''
    const ki = async <T>(req: { user?: string; schemaName?: string }): Promise<T> => {
      if (req.schemaName === 'material_suche') auftrag = req.user ?? ''
      return (req.schemaName === 'material_suche' ? { begriffe: ['x'], gesucht: '' } : SAUBER) as T
    }
    await beschaffeOriginalmaterial({
      wunsch: wunsch(),
      dienste: dienste({ suche: async () => [] }),
      ai: ki
    })
    expect(auftrag).toContain('NUR DANN, WENN DAS AUSSICHT AUF ERFOLG HAT')
    // Der Gegenfall muss ausdrücklich dastehen, sonst sucht die KI trotzdem nach einem Titel
    expect(auftrag).toContain('suche NICHT nach einem Werktitel')
  })

  it('gibt der Websuche dieselbe Linie mit', () => {
    const a = netzAuftrag(wunsch(), ['Migration Kommentar'])
    expect(a).toContain('Suche zuerst allgemein nach Material zum Thema')
    expect(a).toContain('bei einem Sachthema gibt es keinen Titel')
  })
})

describe('Quelle gegen Aussage über die Quelle', () => {
  it('weist die KI darauf hin, dass eine Analyse nicht der Text ist', async () => {
    /*
     * Nachgemessen am 24.09.2026: Auf „Heine, Die Lore-Ley" lieferte die Websuche unter
     * anderem einen Blogbeitrag mit einer ANALYSE des Gedichts. Sprachlich einwandfrei, jede
     * maschinelle Prüfung bestanden – nur ist er nicht die Quelle, sondern eine Aussage
     * darüber. Auf dem Blatt stünde eine fremde Deutung da, wo die Lernenden selbst deuten
     * sollen.
     */
    let auftrag = ''
    const ki = async <T>(req: { user?: string; schemaName?: string }): Promise<T> => {
      if (req.schemaName === 'material_kuerzung') auftrag = req.user ?? ''
      return (req.schemaName === 'material_suche' ? { begriffe: ['x'], gesucht: '' } : SAUBER) as T
    }
    await beschaffeOriginalmaterial({
      wunsch: wunsch(),
      dienste: dienste(),
      ai: ki
    })
    expect(auftrag).toContain('ist NICHT der Text selbst')
  })
})

describe('Quellentypen je Fach', () => {
  /*
   * Vorgabe der Lehrkraft (24.09.2026): „denk auch an zeitungsseiten, nachrichtenseiten,
   * wissenschaftliche quellen usw."
   *
   * Fachabhängig, weil es sonst nicht stimmt: Für Politik ist der Zeitungskommentar die
   * Kernquelle, für Biologie die Fachgesellschaft und das Statistikamt, für Deutsch der
   * literarische Text.
   */
  it('nennt für alle Fächer Zeitungen, Nachrichten und amtliche Veröffentlichungen', () => {
    for (const fach of ['politik', 'biologie', 'deutsch', 'englisch']) {
      const t = quellentypen(fach).join(' ')
      expect(t, fach).toContain('Tageszeitungen')
      expect(t, fach).toContain('öffentlich-rechtlichen Rundfunks')
      expect(t, fach).toContain('Statistikämter')
    }
  })

  it('nennt in den Naturwissenschaften wissenschaftliche Quellen', () => {
    const t = quellentypen('biologie').join(' ')
    expect(t).toContain('Open Access')
    expect(t).toContain('Fachgesellschaften')
    expect(t).toContain('Datensätze')
  })

  it('nennt in den Gesellschaftswissenschaften Reden, Archive und Forschungsinstitute', () => {
    const t = quellentypen('geschichte').join(' ')
    expect(t).toContain('Archiven')
    expect(t).toContain('Forschungsinstituten')
  })

  it('nennt in den Sprachen literarische und Gebrauchstexte', () => {
    const t = quellentypen('deutsch').join(' ')
    expect(t).toContain('literarische Texte')
    expect(t).toContain('Gebrauchstexte')
  })

  it('schickt die Liste an die Websuche mit', () => {
    const a = netzAuftrag(wunsch({ fachId: 'biologie' }), [])
    expect(a).toContain('GEEIGNETE FUNDORTE')
    expect(a).toContain('Open Access')
    // Die Archive durchsucht die App selbst – doppelt zu suchen waere verschwendete Zeit
    expect(a).toContain('durchsucht die App bereits selbst')
  })
})

describe('Reihenfolge von Aufgaben und Material', () => {
  let n = 0
  const id = (): string => `m${++n}`
  const ablage = (): OriginalMaterialAblage => ({
    titel: 'Rede',
    url: 'https://x.de/rede',
    text: 'Die Versammlung beriet.',
    quellenangabe: 'Anna Berg: Rede, 1920.',
    hinweis: '',
    protokoll: [],
    wortlautGeprueft: true
  })
  const blatt = (): Sheet => ({
    id: 's',
    label: 'Arbeitsblatt',
    blocks: [
      {
        id: 'lz',
        type: 'learningGoals',
        title: 'Das lernst du',
        goals: ['Ich kann …']
      },
      { id: 'a1', type: 'divider', title: '' }
    ]
  })

  it('setzt das Material auf dem Arbeitsblatt VOR die Aufgaben', () => {
    // So liest man ein Arbeitsblatt: erst das Material, dann die Aufgaben dazu
    const neu = setzeMaterialEin(blatt(), ablage(), { subjectId: 'deutsch' }, id)
    expect(neu.blocks.map((b) => b.type)).toEqual(['learningGoals', 'text', 'divider'])
  })

  it('setzt es in der Übungsklausur HINTER die Aufgaben', () => {
    /*
     * Wunsch der Lehrkraft (24.09.2026): „füge bei übungsklausuren die aufgabenstellungen
     * außerdem an den anfang auf eine eigene seite und das material auf nachfolgende seiten."
     *
     * So ist es auch in der Prüfung: Wer die Aufgaben vorher gelesen hat, weiß beim Lesen des
     * Materials, worauf er achten muss.
     */
    const neu = setzeMaterialEin(blatt(), ablage(), klausurMeta('deutsch'), id)
    expect(neu.blocks.map((b) => b.type)).toEqual(['learningGoals', 'divider', 'text'])
  })

  it('lässt das Material in der Klausur auf einer neuen Seite beginnen', () => {
    const neu = setzeMaterialEin(blatt(), ablage(), klausurMeta('deutsch'), id)
    const material = neu.blocks.find((b) => b.type === 'text')
    expect(material?.pageBreakBefore).toBe(true)
  })

  it('erzwingt auf dem Arbeitsblatt keinen Umbruch', () => {
    // Dort soll das Material oben stehen, nicht auf einer eigenen Seite
    const neu = setzeMaterialEin(blatt(), ablage(), { subjectId: 'deutsch' }, id)
    expect(neu.blocks.find((b) => b.type === 'text')?.pageBreakBefore).toBeUndefined()
  })
})

describe('Schreibraum in der Übungsklausur', () => {
  /*
   * Gemeldet von der Lehrkraft (24.09.2026): „Die Aufgabe soll für die Übungsklausuren vor dem
   * Material stehen (Also Aufgabenstellung, dann Material, dann Linien zum Schreiben)."
   *
   * Der Schreibraum gehört normalerweise ZUR Aufgabe und stünde damit vor dem Material. Für
   * die Klausur wird er herausgelöst und ans Ende gesetzt.
   */
  let n = 0
  const id = (): string => `k${++n}`
  const ablage = (): OriginalMaterialAblage => ({
    titel: 'Rede',
    url: 'https://x.de/rede',
    text: 'Die Versammlung beriet.',
    quellenangabe: 'Anna Berg: Rede, 1920.',
    hinweis: '',
    protokoll: [],
    wortlautGeprueft: true
  })
  const mitAufgabe = (): Sheet => ({
    id: 's',
    label: 'Klausur',
    blocks: [
      {
        id: 't1',
        type: 'task',
        instruction: 'Write an article based on M1.',
        operator: 'write',
        afb: 'II',
        afbReason: '',
        socialForm: 'EA',
        minutes: 60,
        points: 0,
        solution: '',
        answer: { ...emptyAnswer('lines'), count: 30 },
        parts: []
      }
    ]
  })

  it('stellt Aufgabe, Material und Schreibraum in diese Reihenfolge', () => {
    const neu = setzeMaterialEin(mitAufgabe(), ablage(), klausurMeta('englisch'), id)
    expect(neu.blocks.map((b) => b.type)).toEqual(['task', 'text', 'workspace'])
  })

  it('nimmt der Aufgabe die Linien weg', () => {
    // Sonst stünden sie VOR dem Material – genau das war die Beschwerde
    const neu = setzeMaterialEin(mitAufgabe(), ablage(), klausurMeta('englisch'), id)
    const aufgabe = neu.blocks.find((b) => b.type === 'task')
    expect(aufgabe?.type === 'task' && aufgabe.answer.kind).toBe('none')
  })

  it('gibt dem Schreibraum den Platz, den die Linien gebraucht hätten', () => {
    const neu = setzeMaterialEin(mitAufgabe(), ablage(), klausurMeta('englisch'), id)
    const raum = neu.blocks.find((b) => b.type === 'workspace')
    // 30 Linien à rund 8,5 mm
    expect(raum?.type === 'workspace' && raum.heightMm).toBe(255)
  })

  it('lässt die Aufgabe auf dem Arbeitsblatt unangetastet', () => {
    const neu = setzeMaterialEin(mitAufgabe(), ablage(), { subjectId: 'englisch' }, id)
    const aufgabe = neu.blocks.find((b) => b.type === 'task')
    expect(aufgabe?.type === 'task' && aufgabe.answer.kind).toBe('lines')
    expect(neu.blocks.some((b) => b.type === 'workspace')).toBe(false)
  })
})
