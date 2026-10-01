import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { GeladeneQuelle, Quellentreffer, StructuredRequest } from '../src/shared/types'
import {
  erkenneSprache,
  festeRegeln,
  kiEinarbeiten,
  pruefeRelevanz,
  relevanzAuftrag,
  RELEVANZ_SCHWELLE,
  seitenartNachMerkmalen,
  type RelevanzKontext
} from '../src/renderer/src/shared/quellenRelevanz'
import { bewerte } from '../src/renderer/src/modules/arbeitsblatt/generation/textQualitaet'
import { istVerzeichnis } from '../src/main/services/sources/materialSuche'
import {
  beschaffeOriginalmaterial,
  bereinigeSuchbegriffe,
  mischeQuellen,
  type GepruefterTreffer,
  type MaterialDienste,
  type MaterialWunsch
} from '../src/renderer/src/modules/arbeitsblatt/generation/originalmaterial'
import { ablehnen, leereAblehnungen } from '../src/shared/quellenAblehnung'

/*
 * Relevanzprüfung vor dem Vorschlag (01.10.2026).
 *
 * Gemeldet von der Lehrkraft: Für „German Macbeth Adaptations" schlug die Klassenarbeit
 * wiederholt „Die Musikforschung" (Wikisource) und „Friedrich Gundolf" vor. Die Fixture enthält
 * die echten, gekürzten Seitentexte samt Kategorien, wie die MediaWiki-Schnittstelle sie am
 * 01.10.2026 lieferte. Beide müssen jetzt an den festen Regeln scheitern – auch ohne KI.
 */
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'quellen-macbeth.json'), 'utf8')) as Record<
  'musikforschung' | 'gundolf',
  { titel: string; url: string; kategorien: string[]; text: string }
>

const archivTreffer = (k: 'musikforschung' | 'gundolf'): Quellentreffer => ({
  titel: fixture[k].titel,
  url: fixture[k].url,
  herkunft: 'wikisource',
  auszug: fixture[k].text.slice(0, 200),
  kategorien: fixture[k].kategorien
})

/** Ein passender deutscher Sachtext zum Thema (frei formuliert, keine echten Personen) */
const KRITIK = [
  'Macbeth auf deutschen Bühnen: Kaum ein Stück Shakespeares wird an deutschen Theatern so oft neu gedeutet wie Macbeth. Die Tragödie um den schottischen Feldherrn, der aus Ehrgeiz zum Mörder wird, erscheint in jeder Spielzeit an mehreren Häusern.',
  'Die jüngste Inszenierung an einem Stadttheater verlegt die Handlung in ein Großraumbüro. Statt der Hexen flüstern Bildschirme Prophezeiungen, und der Aufstieg Macbeths wird als Karriere in einem Konzern erzählt, die über Leichen geht.',
  'Schon im achtzehnten Jahrhundert haben deutsche Dichter den Stoff bearbeitet. Schillers Fassung für die Weimarer Bühne glättete die Sprache und machte die Hexen zu feierlichen Schicksalsgestalten. Spätere Übersetzungen kehrten zur Härte des Originals zurück.',
  'Heute stehen die deutschen Bearbeitungen von Macbeth meist für eine politische Lesart. Die Regie fragt, wie Macht entsteht und warum Menschen ihr folgen, obwohl sie den Preis kennen. Das Publikum erkennt darin die Gegenwart wieder.',
  'Viele Inszenierungen kürzen den Text stark und ergänzen ihn um neue Szenen. Kritiker streiten darüber, ob das dem Stück schadet oder ob es den Kern freilegt. Sicher ist, dass Macbeth in Deutschland ein lebendiger Stoff geblieben ist, den jede Generation neu befragt.'
].join('\n\n')

const KRITIK_EN = [
  'Macbeth on German stages: Few of Shakespeare plays are reinterpreted as often in German theatres as Macbeth. The tragedy of the Scottish general who becomes a murderer out of ambition appears at several theatres in every season.',
  'The latest production at a municipal theatre moves the action into an open-plan office. Instead of the witches, screens whisper the prophecies, and the rise of Macbeth is told as a career in a company that walks over dead bodies.',
  'German writers adapted the material as early as the eighteenth century. The version that was made for the Weimar stage smoothed the language and turned the witches into solemn figures of fate. Later translations returned to the harshness of the original.',
  'Today the German adaptations of Macbeth mostly stand for a political reading. The directors ask how power is created and why people follow it although they know the price. The audience recognises the present in it.'
].join('\n\n')

const kontext = (over: Partial<RelevanzKontext> = {}): RelevanzKontext => ({
  thema: 'German Macbeth Adaptations',
  fach: 'Englisch',
  jahrgang: 12,
  sprache: 'de',
  mediation: true,
  kernbegriffe: ['Macbeth'],
  pruefung: true,
  ...over
})

describe('Die gemeldeten Fehlvorschläge (Negativfälle)', () => {
  it('scheitern schon an der Formprüfung: Listeneinträge statt Sätze', () => {
    // Vorher bestanden beide die Formprüfung (nachgemessen am 01.10.2026: keine Ausschlussgründe)
    for (const k of ['musikforschung', 'gundolf'] as const) {
      const b = bewerte(fixture[k].text, { zielWortzahl: 500, jahrgang: 12, sprache: 'de' })
      expect(b.ausschluss.join(' '), k).toMatch(/Listeneinträge/)
    }
  })

  it('erkennt „Die Musikforschung" als Zeitschriftenverzeichnis', () => {
    expect(seitenartNachMerkmalen(archivTreffer('musikforschung'), fixture.musikforschung.text)).toBe('verzeichnis')
    expect(istVerzeichnis(fixture.musikforschung.titel, fixture.musikforschung.kategorien)).toBe(true)
  })

  it('erkennt „Friedrich Gundolf" als Autorenseite', () => {
    expect(seitenartNachMerkmalen(archivTreffer('gundolf'), fixture.gundolf.text)).toBe('personenartikel')
    expect(istVerzeichnis(fixture.gundolf.titel, fixture.gundolf.kategorien)).toBe(true)
  })

  it('filtert schon die Archivsuche nach Kategorien – wie am 01.10.2026 nachgemessen', () => {
    // „Macbeth Rezeption Deutschland" auf de.wikisource: alle acht besten Treffer waren keine Texte
    const treffer: [string, string[]][] = [
      ['William Shakespeare', ['Kategorie:Autoren']],
      ['Friedrich Schiller', ['Kategorie:Autoren']],
      ['Die Musikforschung', ['Kategorie:Zeitschrift', 'Kategorie:Zeitschrift (Musik)']],
      ['Hexenwesen', ['Kategorie:Thema']],
      ['Der Merker/Inhalt', ['Kategorie:Zeitschriftenartikelliste']]
    ]
    for (const [titel, kategorien] of treffer) expect(istVerzeichnis(titel, kategorien), titel).toBe(true)
    // Ein echter Text bleibt
    expect(istVerzeichnis('Macbeth (Schiller)', ['Kategorie:Drama', 'Kategorie:Friedrich Schiller'])).toBe(false)
  })

  it('verwirft beide mit nachvollziehbarem Grund – auch ohne KI', async () => {
    const befunde = await pruefeRelevanz(
      [
        { treffer: archivTreffer('musikforschung'), text: fixture.musikforschung.text },
        { treffer: archivTreffer('gundolf'), text: fixture.gundolf.text }
      ],
      kontext()
    )
    expect(befunde.map((b) => b.ok)).toEqual([false, false])
    expect(befunde[0].gruende.join(' ')).toMatch(/Verzeichnis/)
    expect(befunde[0].gruende.join(' ')).toMatch(/beiläufig/)
    expect(befunde[1].gruende.join(' ')).toMatch(/Autorenseite/)
  })

  it('verwirft die Musikforschung auch ohne Kategorien: „Macbeth" nur einmal in über 1500 Wörtern', () => {
    const r = festeRegeln({ ...archivTreffer('musikforschung'), kategorien: [] }, fixture.musikforschung.text, kontext())
    expect(r.gruende.join(' ')).toMatch(/nur beiläufig erwähnt/)
  })
})

describe('Passende Funde (Positivfälle)', () => {
  const netz = (url = 'https://example.org/feuilleton/macbeth'): Quellentreffer => ({
    titel: 'Macbeth auf deutschen Bühnen',
    url,
    herkunft: 'netz',
    auszug: ''
  })

  it('lässt einen deutschen Sachtext zum Thema durch (Sprachmittlung)', () => {
    expect(festeRegeln(netz(), KRITIK, kontext()).gruende).toEqual([])
  })

  it('verlangt bei der Sprachmittlung einen DEUTSCHEN Text', () => {
    const r = festeRegeln(netz(), KRITIK_EN, kontext())
    expect(r.gruende.join(' ')).toMatch(/Sprache: Englisch statt Deutsch/)
  })

  it('verlangt im Fremdsprachenfach sonst die Zielsprache', () => {
    const k = kontext({ sprache: 'en', mediation: false })
    expect(festeRegeln(netz(), KRITIK_EN, k).gruende).toEqual([])
    expect(festeRegeln(netz(), KRITIK, k).gruende.join(' ')).toMatch(/Deutsch statt Englisch/)
  })

  it('erkennt die Sprache an den Stoppwörtern', () => {
    expect(erkenneSprache(KRITIK)).toMatchObject({ sprache: 'de', sicher: true })
    expect(erkenneSprache(KRITIK_EN)).toMatchObject({ sprache: 'en', sicher: true })
  })

  it('lässt einen Personenartikel nur zu, wenn die Person Gegenstand des Themas ist', () => {
    const artikel: Quellentreffer = { titel: 'Friedrich Schiller', url: 'https://de.wikipedia.org/wiki/Friedrich_Schiller', herkunft: 'netz', auszug: '' }
    const text = 'Friedrich Schiller (* 10. November 1759 in Marbach am Neckar; † 9. Mai 1805 in Weimar) war ein Dichter. ' + KRITIK
    expect(festeRegeln(artikel, text, kontext()).gruende.join(' ')).toMatch(/Personenartikel/)
    expect(festeRegeln(artikel, text, kontext({ thema: 'Schillers Macbeth-Bearbeitung' })).gruende).toEqual([])
  })
})

describe('KI-Prüfung mit harter Schwelle', () => {
  const treffer: Quellentreffer = { titel: 'Macbeth auf deutschen Bühnen', url: 'https://example.org/a', herkunft: 'netz', auszug: '' }
  const offen = { ok: true, gruende: [], begruendung: '', kiGeprueft: false }

  it(`schlägt unter ${RELEVANZ_SCHWELLE}/10 nichts vor und zeigt die Begründung`, () => {
    const b = kiEinarbeiten(
      offen,
      { nummer: 0, passung: 5, art: 'sachtext', sprache: 'de', begruendung: 'Behandelt Verdis Oper, nicht das Drama.' },
      treffer,
      kontext()
    )
    expect(b.ok).toBe(false)
    expect(b.gruende[0]).toContain('5/10')
    expect(b.gruende[0]).toContain('Verdis Oper')
  })

  it('verwirft Verzeichnisse und themenfremde Texte unabhängig von der Punktzahl', () => {
    expect(kiEinarbeiten(offen, { nummer: 0, passung: 9, art: 'verzeichnis', begruendung: '' }, treffer, kontext()).ok).toBe(false)
    expect(kiEinarbeiten(offen, { nummer: 0, passung: 9, art: 'themenfremd', begruendung: '' }, treffer, kontext()).ok).toBe(false)
  })

  it('übernimmt einen passenden Fund mit Textart und Begründung', () => {
    const b = kiEinarbeiten(
      offen,
      { nummer: 0, passung: 8, art: 'sachtext', sprache: 'de', begruendung: 'Theaterkritik zu deutschen Macbeth-Fassungen.' },
      treffer,
      kontext()
    )
    expect(b).toMatchObject({ ok: true, punkte: 8, art: 'sachtext', kiGeprueft: true })
  })

  it('schickt der KI Fach, Sprache, Thema, Lernziel und Jahrgang mit', () => {
    const req = relevanzAuftrag([{ treffer, text: KRITIK }], kontext({ lernziel: 'Die Lernenden geben eine deutsche Theaterkritik auf Englisch wieder.' }))
    expect(req.schemaName).toBe('material_relevanz')
    expect(req.user).toContain('Fach: Englisch')
    expect(req.user).toContain('Jahrgang: 12')
    expect(req.user).toContain('German Macbeth Adaptations')
    expect(req.user).toContain('Lernziel: Die Lernenden')
    expect(req.user).toMatch(/Sprachmittlung/)
    expect(req.user).toMatch(/Oper, ein Film/)
  })

  it('kennzeichnet einen Fund ohne KI-Antwort, statt ihn stillschweigend durchzuwinken', async () => {
    const [b] = await pruefeRelevanz([{ treffer, text: KRITIK }], kontext(), async <T>() => ({} as T))
    expect(b.ok).toBe(true)
    expect(b.kiGeprueft).toBe(false)
    expect(b.begruendung).toMatch(/ohne KI-Prüfung/)
  })
})

describe('Suchbegriffe', () => {
  it('verwirft Einzelwörter und Anfragen aus lauter allgemeinen Wörtern', () => {
    // „Rezeption Deutschland" fand am 01.10.2026 auf Wikisource u. a. „Die Musikforschung"
    expect(bereinigeSuchbegriffe(['Rezeption', 'Rezeption Deutschland', 'Macbeth Inszenierung Schauspiel'], ['Macbeth'])).toEqual([
      'Macbeth Inszenierung Schauspiel'
    ])
    // Mit Kernbegriff bleibt auch eine allgemein klingende Anfrage erhalten
    expect(bereinigeSuchbegriffe(['Macbeth Rezeption'], ['Macbeth'])).toEqual(['Macbeth Rezeption'])
  })

  it('setzt den Kernbegriff vor Anfragen, denen er fehlt', () => {
    expect(bereinigeSuchbegriffe(['Theaterkritik Shakespeare Bearbeitung'], ['Macbeth'])).toEqual(['Macbeth Theaterkritik Shakespeare Bearbeitung'])
  })

  it('lässt einen Werktitel als einzelnes Wort zu, wenn er der Kernbegriff ist', () => {
    expect(bereinigeSuchbegriffe(['Faust'], ['Faust'])).toEqual(['Faust'])
  })
})

describe('Quellenvielfalt', () => {
  it('lädt Archiv- und Netzfunde abwechselnd statt nur die ersten zwölf Archivtreffer', () => {
    const archiv = Array.from(
      { length: 12 },
      (_, i): Quellentreffer => ({ titel: `A${i}`, url: `https://de.wikisource.org/wiki/A${i}`, herkunft: 'wikisource', auszug: '' })
    )
    const netzfunde = Array.from(
      { length: 3 },
      (_, i): Quellentreffer => ({ titel: `N${i}`, url: `https://zeitung${i}.example/macbeth`, herkunft: 'netz', auszug: '' })
    )
    const reihe = mischeQuellen([...archiv, ...netzfunde], 12)
    expect(reihe).toHaveLength(12)
    expect(reihe.filter((t) => t.herkunft === 'netz')).toHaveLength(3)
    expect(reihe.slice(0, 2).map((t) => t.herkunft)).toEqual(['wikisource', 'netz'])
  })
})

describe('Ganze Kette mit Attrappe: German Macbeth Adaptations', () => {
  const KRITIK_URL = 'https://example.org/feuilleton/macbeth-auf-deutschen-buehnen'
  const texte: Record<string, string> = {
    [fixture.musikforschung.url]: fixture.musikforschung.text,
    [fixture.gundolf.url]: fixture.gundolf.text,
    [KRITIK_URL]: KRITIK
  }
  const dienste = (over: Partial<MaterialDienste> = {}): MaterialDienste => ({
    // Archivsuche wie am 01.10.2026 nachgemessen: Volltexttreffer auf Zeitschrift und Autorenseite
    suche: async () => [archivTreffer('musikforschung'), archivTreffer('gundolf')],
    netzsuche: async () => [{ titel: 'Macbeth auf deutschen Bühnen', url: KRITIK_URL, herkunft: 'netz', auszug: '' }],
    laden: async (url): Promise<GeladeneQuelle> => ({ url, titel: '', text: texte[url] ?? '', wortzahl: (texte[url] ?? '').split(/\s+/).length }),
    ...over
  })
  const wunsch: MaterialWunsch = {
    thema: 'German Macbeth Adaptations – Mediation',
    kernthema: 'German Macbeth Adaptations',
    fach: 'Englisch',
    fachId: 'englisch',
    sprache: 'de',
    jahrgang: 12,
    zielWortzahl: 250,
    pruefung: true,
    mediation: true
  }
  const anfragen: StructuredRequest[] = []
  const ki = async <T>(req: StructuredRequest): Promise<T> => {
    anfragen.push(req)
    if (req.schemaName === 'material_suche')
      return { begriffe: ['Macbeth Rezeption Deutschland', 'Rezeption'], kernbegriffe: ['Macbeth'], gesucht: 'Theaterkritik' } as T
    if (req.schemaName === 'material_relevanz')
      return { bewertungen: [{ nummer: 0, passung: 9, art: 'sachtext', sprache: 'de', begruendung: 'Deutscher Sachtext über Macbeth-Bearbeitungen.' }] } as T
    return { nummer: -1, begruendung: 'nur Auswahl geprüft', gekuerzt: '', quellenangabe: '', vorbemerkung: '' } as T
  }

  it('legt der Lehrkraft nur die passende Kritik vor – nicht Musikforschung und Gundolf', async () => {
    let vorgelegt: GepruefterTreffer[] = []
    await beschaffeOriginalmaterial({
      wunsch,
      dienste: dienste(),
      ai: ki,
      auswahl: async (t) => {
        vorgelegt = t
        return null
      }
    })
    expect(vorgelegt.map((t) => t.treffer.titel)).toEqual(['Macbeth auf deutschen Bühnen'])
    expect(vorgelegt[0].begruendung).toMatch(/Gebrauchstext · Passung 9\/10 · Deutscher Sachtext/)
    // Die Suchanfragen wurden aufgeräumt: kein „Rezeption" allein
    const suche = anfragen.find((a) => a.schemaName === 'material_suche')!
    expect(suche.user).toMatch(/SPRACHE DER SUCHWÖRTER/)
  })

  it('blendet abgelehnte Funde aus – auch in anderer Schreibweise und in einem anderen Teil der Arbeit', async () => {
    let vorgelegt: GepruefterTreffer[] | null = null
    const daten = ablehnen(leereAblehnungen(), {
      url: 'https://example.org/feuilleton/macbeth-auf-deutschen-buehnen/?utm_source=newsletter',
      titel: '',
      umfang: 'thema',
      thema: 'german macbeth adaptations',
      art: 'text'
    })
    const e = await beschaffeOriginalmaterial({
      wunsch: { ...wunsch, thema: 'German Macbeth Adaptations – Reading' },
      dienste: dienste({ ablehnungen: async () => daten }),
      ai: ki,
      auswahl: async (t) => {
        vorgelegt = t
        return null
      }
    })
    expect(vorgelegt).toBeNull()
    expect(e.art).toBe('abbruch')
    if (e.art === 'abbruch') expect(e.grund).toMatch(/abgelehnter Fund wurde ausgeblendet/)
  })
})
