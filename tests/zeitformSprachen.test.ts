import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { bekanntNachStand, sperreFuer, zeitformDerAufgabe, zeitformIn, type SperrbareZeitform } from '../src/shared/zeitformSperre'
import { bekanntLatein } from '../src/shared/zeitformSprachen'
import { kapitelFolge } from '../src/renderer/src/shared/lehrwerkThemen'
import { erzeugeGrammatikPaket, erzeugungsHinweis, zeitformRegel, zeitformSperre } from '../src/renderer/src/modules/lernen/grammatikErzeugen'
import { bekanntNachLernjahr, katalogFormenRegel, lateinNiveauRegel } from '../src/renderer/src/modules/lernen/grammatikNiveau'

/*
 * Zeitform-Sperre für alle Fremdsprachen (09.10.2026, Nachtrag der Lehrkraft): bekannt nach Lernjahr (Katalog) bzw.
 * Lehrwerk (Latein), Faustregeln je Sprache, Regeln im Auftrag. Ohne echte KI.
 */
const ids = (z: SperrbareZeitform[]): string[] => z.map((x) => x.id).sort()
const alle = (sprache: string): SperrbareZeitform[] => sperreFuer({ bekannt: [], sprache })
const auftrag = (fach: string, sprache: string, jahrgang: number) => ({ thema: 'Thema', fach, sprache, jahrgang, land: 'NI' })

describe('Bekannt nach Lernjahr (Katalog, Beginn des Schuljahres)', () => {
  it('Französisch (2. Fremdsprache): Klasse 6 ohne passé composé, Klasse 7 mit, imparfait erst Klasse 8', () => {
    expect(ids(zeitformSperre(auftrag('Französisch', 'fr', 6)))).toContain('passe_compose')
    const k7 = ids(zeitformSperre(auftrag('Französisch', 'fr', 7)))
    expect(k7).not.toContain('passe_compose')
    expect(k7).toContain('imparfait')
    expect(k7).toContain('futur_simple')
    const k9 = ids(zeitformSperre(auftrag('Französisch', 'fr', 9)))
    expect(k9).not.toContain('imparfait')
    expect(k9).not.toContain('futur_simple')
    expect(k9).toContain('passif')
  })
  it('Spanisch Klasse 7: indefinido und perfecto bekannt, imperfecto und futuro nicht', () => {
    const s = ids(zeitformSperre(auftrag('Spanisch', 'es', 7)))
    expect(s).not.toContain('indefinido')
    expect(s).not.toContain('perfecto')
    expect(s).toEqual(expect.arrayContaining(['imperfecto', 'futuro_simple', 'subjuntivo', 'condicional']))
  })
  it('Italienisch, Russisch, Niederländisch, Portugiesisch Klasse 7', () => {
    expect(ids(zeitformSperre(auftrag('Italienisch', 'it', 7)))).toEqual(expect.arrayContaining(['passato_prossimo', 'imperfetto']))
    const ru = ids(zeitformSperre(auftrag('Russisch', 'ru', 7)))
    expect(ru).not.toContain('praeteritum')
    expect(ru).toContain('aspekt')
    const nl = ids(zeitformSperre(auftrag('Niederländisch', 'nl', 7)))
    expect(nl).not.toContain('perfectum')
    expect(nl).toContain('imperfectum')
    expect(ids(zeitformSperre(auftrag('Portugiesisch', 'pt', 7)))).toContain('preterito_perfeito')
  })
  it('Latein: Klasse 6 ohne Perfekt und Imperfekt, Klasse 7 mit, Plusquamperfekt und Passiv noch nicht', () => {
    expect(ids(zeitformSperre(auftrag('Latein', 'la', 6)))).toEqual(expect.arrayContaining(['perfekt', 'imperfekt']))
    const k7 = ids(zeitformSperre(auftrag('Latein', 'la', 7)))
    expect(k7).not.toContain('perfekt')
    expect(k7).toEqual(expect.arrayContaining(['plusquamperfekt', 'passiv', 'futur']))
    expect(bekanntNachLernjahr(auftrag('Latein', 'la', 7))).toContain('la.form.perfekt')
  })
  it('Latein nach Lehrwerk (Pontes): Stichwörter der Lektionen bis zum Stand', () => {
    const folge = kapitelFolge('Pontes')
    expect(bekanntLatein('Pontes', 'Lektion 1')).not.toContain('la.form.perfekt')
    const ende = bekanntLatein('Pontes', folge[folge.length - 1])
    expect(ende).toEqual(expect.arrayContaining(['la.form.perfekt', 'la.form.imperfekt', 'la.form.passiv', 'la.form.konjunktiv', 'la.syn.aci', 'la.syn.abl_abs']))
    expect(bekanntNachStand({ buch: 'Pontes', unit: folge[folge.length - 1] })).toEqual(ende)
    // Mit Lehrwerk-Stand erlaubt, obwohl das Lernjahr es noch nicht hergibt
    expect(ids(zeitformSperre({ ...auftrag('Latein', 'la', 6), bekannt: ende }))).not.toContain('perfekt')
  })
  it('Thema schaltet frei – Kennung oder Name', () => {
    expect(ids(zeitformSperre({ ...auftrag('Französisch', 'fr', 6), thema: 'Le passé composé' }))).not.toContain('passe_compose')
    expect(ids(zeitformSperre({ ...auftrag('Spanisch', 'es', 7), themenIds: ['es.verb.imperfecto'] }))).not.toContain('imperfecto')
  })
})

const treffer = (sprache: string, t: string): string | undefined => zeitformIn(t, alle(sprache))?.id

describe('Faustregeln je Sprache', () => {
  it.each([
    ['fr', "J'ai mangé une pomme.", 'passe_compose'],
    ['fr', 'Elle est allée à Paris.', 'passe_compose'],
    ['fr', 'Il était fatigué.', 'imparfait'],
    ['fr', 'Nous parlerons demain.', 'futur_simple'],
    ['fr', 'Je parlerais avec lui.', 'conditionnel'],
    ['fr', 'Il faut que tu fasses tes devoirs.', 'subjonctif'],
    ['fr', 'Il avait fini.', 'plus_que_parfait'],
    ['fr', 'La maison est construite par mon père.', 'passif'],
    ['es', 'Ayer hablé con mi madre.', 'indefinido'],
    ['es', 'Mi abuelo vivió en España.', 'indefinido'],
    ['es', 'He comido paella.', 'perfecto'],
    ['es', 'Había terminado.', 'pluscuamperfecto'],
    ['es', 'Mañana iré al cine.', 'futuro_simple'],
    ['es', 'Yo comería pizza.', 'condicional'],
    ['es', 'Cuando era pequeño, jugaba mucho.', 'imperfecto'],
    ['es', 'Quiero que vengas.', 'subjuntivo'],
    ['it', 'Ho mangato la pizza.', 'passato_prossimo'],
    ['it', 'Sono andata a Roma.', 'passato_prossimo'],
    ['it', 'Quando ero piccolo, giocavo.', 'imperfetto'],
    ['it', 'Domani andrò al mare.', 'futuro'],
    ['it', 'Mangerei volentieri.', 'condizionale'],
    ['it', 'Penso che sia vero.', 'congiuntivo'],
    ['it', 'Avevo già mangiato.', 'trapassato'],
    ['la', 'Servus labōrāvit.', 'perfekt'],
    ['la', 'Marcus amīcōs vocābat.', 'imperfekt'],
    ['la', 'Mox vocābimus.', 'futur'],
    ['la', 'Villa aedificāta est.', 'passiv'],
    ['la', 'Laudātur.', 'passiv'],
    ['la', 'Si adesses, gaudērem.', 'konjunktiv'],
    ['la', 'Puer cēnāverat.', 'plusquamperfekt'],
    ['ru', 'Вчера я читал книгу.', 'praeteritum'],
    ['ru', 'Я буду читать.', 'futur'],
    ['ru', 'Я бы купил.', 'konjunktiv'],
    ['nl', 'Ik heb gewerkt.', 'perfectum'],
    ['nl', 'Hij werkte gisteren.', 'imperfectum'],
    ['nl', 'Ik zal komen.', 'toekomst'],
    ['nl', 'Het huis wordt gebouwd.', 'passief'],
    ['nl', 'Ik had gegeten.', 'plusquam_conditionalis'],
    ['pt', 'Ontem falei com ela.', 'preterito_perfeito'],
    ['pt', 'Ele comeu.', 'preterito_perfeito'],
    ['pt', 'Quando era criança, brincava.', 'imperfeito'],
    ['pt', 'Amanhã falarei.', 'futuro_condicional'],
    ['pt', 'Tenho estudado muito.', 'perfeito_composto'],
    ['pt', 'Espero que seja verdade.', 'conjuntivo']
  ])('%s: %s → %s', (sprache, t, id) => expect(treffer(sprache, t)).toBe(id))

  it.each([
    ['fr', 'Je mange une pomme.'],
    ['fr', 'Il va manger.'],
    ['fr', 'Je voudrais un café.'],
    ['fr', 'Il fait beau.'],
    ['fr', 'Je sais nager.'],
    ['fr', 'Elle a un chien.'],
    ['fr', 'Il y a deux chats.'],
    ['fr', 'Nous habitons à Paris.'],
    ['es', 'Voy a comer en la cafetería.'],
    ['es', 'Me gustaría ir a la panadería.'],
    ['es', 'Mi café está frío.'],
    ['es', 'Estoy comiendo para aprender.'],
    ['it', 'Vorrei un caffè.'],
    ['it', 'Sto mangiando.'],
    ['it', 'È bravo e simpatico.'],
    ['it', 'Però è tardi.'],
    ['la', 'Servus labōrat.'],
    ['la', 'Marcus amīcōs vocat.'],
    ['la', 'Puellae in villā sunt.'],
    ['la', 'Vīta est brevis.'],
    ['la', 'Dominus servum līberat.'],
    ['ru', 'Я читаю книгу.'],
    ['ru', 'Это школа.'],
    ['nl', 'Ik werk vandaag.'],
    ['nl', 'Hij is gezond.'],
    ['nl', 'Wij gaan zwemmen.'],
    ['pt', 'Eu estou em casa.'],
    ['pt', 'Vou comer na padaria.'],
    ['pt', 'O meu museu favorito.'],
    ['pt', 'Eu sou estudante.']
  ])('%s: kein Treffer in „%s"', (sprache, t) => expect(treffer(sprache, t)).toBeUndefined())

  it('Latein: Lesarten beim Bestimmen und Übersetzen in beide Richtungen', () => {
    const la = alle('la')
    expect(zeitformDerAufgabe({ art: 'bestimmen', form: 'vocāvit', lesarten: [['3.', 'Sg.', 'Perf.', 'Ind.', 'Akt.']] }, la)?.id).toBe('perfekt')
    expect(zeitformDerAufgabe({ art: 'bestimmen', form: 'x', lesarten: [['3.', 'Sg.', 'Plusqpf.', 'Ind.', 'Akt.']] }, la)?.id).toBe('plusquamperfekt')
    // Latein → Deutsch: der lateinische Satz zählt, die deutsche Lösung nicht
    expect(zeitformDerAufgabe({ art: 'uebersetzen', satz: 'Servus labōrāvit.', loesungen: ['Der Sklave hat gearbeitet.'] }, la)?.id).toBe('perfekt')
    expect(zeitformDerAufgabe({ art: 'uebersetzen', satz: 'Servus labōrat.', loesungen: ['Er war fleißig.'] }, la)).toBeNull()
    // Moderne Sprachen: Deutsch → Zielsprache, nur die Lösung zählt
    expect(zeitformDerAufgabe({ art: 'uebersetzen', satz: 'Ich habe gegessen.', loesungen: ["J'ai mangé."] }, alle('fr'))?.id).toBe('passe_compose')
  })
})

describe('Auftrag an die KI', () => {
  function attrappe(aufgaben: unknown[]) {
    const anfragen: StructuredRequest[] = []
    const ai = async <T,>(req: StructuredRequest): Promise<T> => {
      anfragen.push(req)
      if (req.schemaName === 'grammatik_pruefung') return { urteile: [] } as T
      return { regeln: [{ id: 'r1', titel: 'Les articles', erklaerung: 'Artikel.', beispiele: ["J'ai mangé.", 'Le chat.'] }], aufgaben } as T
    }
    return { ai, anfragen }
  }
  const A = (satz: string, loesung: string) => ({ art: 'luecke', regelId: 'r1', anweisung: 'Setze ein.', satz, loesungen: [loesung] })

  it('Französisch Klasse 6: Regel mit Basis und Verboten, Niveau nach GER-Faustregel, passé composé gestrichen', async () => {
    const { ai, anfragen } = attrappe([A('___ chat est noir.', 'Le'), A("Hier, j'___ mangé.", 'ai'), A('Je ___ une pomme.', 'mange')])
    const p = await erzeugeGrammatikPaket({ ...auftrag('Französisch', 'fr', 6), schulform: 'gymnasium' }, ai)
    const pool = anfragen.find((r) => r.schemaName === 'grammatik_pool')!
    expect(pool.system).toMatch(/kennt bisher NUR.*présent/s)
    expect(pool.system).toMatch(/VERBOTEN.*passé composé/)
    expect(pool.system).toMatch(/NIVEAU – VERBINDLICH: Lerngruppe Klasse 6 .*GER-Niveau A1/)
    expect(p.aufgaben.map((a) => a.satz)).toEqual(['___ chat est noir.', 'Je ___ une pomme.'])
    expect(p.regeln[0].beispiele).toEqual(['Le chat.'])
    expect(erzeugungsHinweis(p)).toMatch(/Aufgaben? mit noch unbekannter Zeitform entfernt: passé composé/)
  })
  it('Latein Klasse 7: Niveau nach Lernjahr statt GER, Plusquamperfekt verboten', async () => {
    const { ai, anfragen } = attrappe([])
    await erzeugeGrammatikPaket({ ...auftrag('Latein', 'la', 7) }, ai)
    const s = anfragen[0].system
    expect(s).toMatch(/NIVEAU – VERBINDLICH \(Latein\): Klasse 7, 2\. Lernjahr/)
    expect(s).toMatch(/5–10 Wörter/)
    expect(s).not.toMatch(/GER-Niveau/)
    expect(s).toMatch(/VERBOTEN.*Plusquamperfekt/)
    expect(lateinNiveauRegel(auftrag('Latein', 'la', 7), 'anspruchsvoll')).toMatch(/wie im 3\. Lernjahr/)
  })
  it('Sprachen ohne erfasste Prüfung: Regel aus dem Katalog bzw. keine', () => {
    expect(zeitformSperre(auftrag('Polnisch', 'pl', 7))).toEqual([])
    expect(() => zeitformRegel(auftrag('Polnisch', 'pl', 7), [])).not.toThrow()
    const r = katalogFormenRegel(auftrag('Französisch', 'fr', 7))
    expect(r).toMatch(/Lernjahr 2/)
    expect(r).toMatch(/VERBOTEN.*Imperfekt/)
  })
})
