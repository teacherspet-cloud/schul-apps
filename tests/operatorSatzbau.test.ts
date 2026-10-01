import { describe, expect, it } from 'vitest'
import {
  duImperativ,
  ihrImperativ,
  korrigiereOperatorformen,
  operatorFormfehler,
  operatorImperativ,
  operatorSatz,
  operatorSatzbauRegel,
  trennbaresVerb
} from '../src/shared/operatoren/satzbau'
import { findeOperatoren, pruefeAnweisung } from '../src/shared/operatoren/erkennung'
import { falscheAnrede } from '../src/renderer/src/shared/anrede'

/*
 * Satzbau der Operatoren (01.10.2026).
 *
 * Anlass (Fehlerbericht der Lehrkraft): Ein Arbeitsblatt der Sek II formulierte „Zusammenfassen
 * Sie anhand von M1 …" statt „Fassen Sie anhand von M1 … zusammen". Der Fehler blieb unbemerkt,
 * weil die Erkennung den Infinitiv als Treffer zählte und die Anrede-Prüfung „Infinitiv + Sie"
 * für eine korrekte Sie-Form hielt.
 */

const k = (op: string, a: 'du' | 'ihr' | 'sie', s: 'de' | 'en' | 'fr' | 'es' | 'it' | 'ru' = 'de'): string => operatorImperativ(op, a, s).kurz

describe('Imperativ: Deutsch', () => {
  it('bildet du-, ihr- und Sie-Form regelmäßiger Verben', () => {
    expect([k('erläutern', 'du'), k('erläutern', 'ihr'), k('erläutern', 'sie')]).toEqual(['Erläutere', 'Erläutert', 'Erläutern Sie'])
    expect([k('analysieren', 'du'), k('analysieren', 'ihr'), k('analysieren', 'sie')]).toEqual(['Analysiere', 'Analysiert', 'Analysieren Sie'])
    expect([k('begründen', 'du'), k('begründen', 'ihr')]).toEqual(['Begründe', 'Begründet'])
    expect([k('zeichnen', 'ihr'), k('ordnen', 'ihr'), k('nennen', 'ihr'), k('sammeln', 'du'), k('sammeln', 'ihr')]).toEqual([
      'Zeichnet',
      'Ordnet',
      'Nennt',
      'Sammle',
      'Sammelt'
    ])
  })

  it('bildet starke Verben mit Vokalwechsel', () => {
    expect([k('lesen', 'du'), k('lesen', 'ihr'), k('lesen', 'sie')]).toEqual(['Lies', 'Lest', 'Lesen Sie'])
    expect([k('geben', 'du'), k('nehmen', 'du'), k('entwerfen', 'du')]).toEqual(['Gib', 'Nimm', 'Entwirf'])
    expect([k('angeben', 'du'), k('angeben', 'ihr'), k('angeben', 'sie')]).toEqual(['Gib an', 'Gebt an', 'Geben Sie an'])
  })

  it('stellt die Partikel trennbarer Verben ans Satzende', () => {
    expect(operatorImperativ('zusammenfassen', 'sie').muster).toBe('Fassen Sie … zusammen')
    expect(operatorImperativ('zusammenfassen', 'du').muster).toBe('Fasse … zusammen')
    expect(operatorImperativ('zusammenfassen', 'ihr').muster).toBe('Fasst … zusammen')
    expect(operatorImperativ('herausarbeiten', 'sie').muster).toBe('Arbeiten Sie … heraus')
    expect(operatorImperativ('herausarbeiten', 'ihr').muster).toBe('Arbeitet … heraus')
    expect(operatorImperativ('darstellen', 'sie').muster).toBe('Stellen Sie … dar')
    expect(operatorImperativ('einordnen', 'sie').muster).toBe('Ordnen Sie … ein')
    expect(operatorImperativ('gegenüberstellen', 'du').muster).toBe('Stelle … gegenüber')
  })

  it('bildet reflexive Verben und Wendungen aus mehreren Wörtern', () => {
    expect(operatorImperativ('sich auseinandersetzen', 'sie').muster).toBe('Setzen Sie sich … auseinander')
    expect(operatorImperativ('sich auseinandersetzen', 'du').muster).toBe('Setze dich … auseinander')
    expect(operatorImperativ('sich auseinandersetzen', 'ihr').muster).toBe('Setzt euch … auseinander')
    expect(k('Stellung nehmen', 'sie')).toBe('Nehmen Sie Stellung')
    expect(k('Stellung nehmen', 'du')).toBe('Nimm Stellung')
    expect(operatorImperativ('in Beziehung setzen', 'sie').muster).toBe('Setzen Sie … in Beziehung')
  })

  it('trennt nur echte trennbare Verben', () => {
    expect(trennbaresVerb('analysieren')).toBeNull()
    expect(trennbaresVerb('umkreisen')).toBeNull()
    expect(trennbaresVerb('wiederholen')).toBeNull()
    expect(trennbaresVerb('anwenden')).toEqual({ partikel: 'an', grund: 'wenden' })
    expect(duImperativ('erörtern')).toBe('erörtere')
    expect(ihrImperativ('arbeiten')).toBe('arbeitet')
  })

  it('setzt Ergänzungen in die Satzklammer', () => {
    expect(operatorSatz('zusammenfassen', 'anhand von M1 die Position Bismarcks', 'sie')).toBe('Fassen Sie anhand von M1 die Position Bismarcks zusammen.')
    expect(operatorSatz('zusammenfassen', 'anhand von M1 die Position Bismarcks', 'du')).toBe('Fasse anhand von M1 die Position Bismarcks zusammen.')
    expect(operatorSatz('sich auseinandersetzen', 'mit der These aus M2', 'sie')).toBe('Setzen Sie sich mit der These aus M2 auseinander.')
    expect(operatorSatz('Stellung nehmen', 'zur These', 'sie')).toBe('Nehmen Sie zur These Stellung.')
    expect(operatorSatz('herausarbeiten', 'aus M1, welche Ziele Bismarck verfolgte', 'sie')).toBe('Arbeiten Sie aus M1 heraus, welche Ziele Bismarck verfolgte.')
    expect(operatorSatz('erläutern', 'die Folgen', 'sie')).toBe('Erläutern Sie die Folgen.')
  })
})

describe('Imperativ: Zielsprachen', () => {
  it('Englisch: Grundform, britisch und amerikanisch wie in der Liste', () => {
    expect([k('summarise', 'du', 'en'), k('summarize', 'sie', 'en'), k('comment (on)', 'sie', 'en')]).toEqual(['Summarise', 'Summarize', 'Comment on'])
  })
  it('Französisch: tu / vous', () => {
    expect([k('résumer', 'du', 'fr'), k('résumer', 'sie', 'fr')]).toEqual(['Résume', 'Résumez'])
    expect([k('décrire', 'du', 'fr'), k('décrire', 'sie', 'fr')]).toEqual(['Décris', 'Décrivez'])
    expect([k('compléter', 'du', 'fr'), k('analyser', 'ihr', 'fr'), k('rédiger', 'sie', 'fr')]).toEqual(['Complète', 'Analysez', 'Rédigez'])
    expect(k('se mettre à la place de', 'du', 'fr')).toBe('Mets-toi à la place de')
  })
  it('Spanisch: tú / vosotros / usted', () => {
    expect([k('resumir', 'du', 'es'), k('resumir', 'ihr', 'es'), k('resumir', 'sie', 'es')]).toEqual(['Resume', 'Resumid', 'Resuma'])
    expect([k('analizar', 'du', 'es'), k('analizar', 'sie', 'es'), k('explicar', 'sie', 'es')]).toEqual(['Analiza', 'Analice', 'Explique'])
    expect([k('describir', 'sie', 'es'), k('hacer', 'du', 'es')]).toEqual(['Describa', 'Haz'])
  })
  it('Italienisch: tu / voi', () => {
    expect([k('riassumere', 'du', 'it'), k('riassumere', 'sie', 'it')]).toEqual(['Riassumi', 'Riassumete'])
    expect([k('analizzare', 'du', 'it'), k('analizzare', 'ihr', 'it'), k('definire', 'du', 'it')]).toEqual(['Analizza', 'Analizzate', 'Definisci'])
  })
  it('Russisch: ты / вы', () => {
    expect([k('обобщить', 'du', 'ru'), k('обобщить', 'sie', 'ru')]).toEqual(['Обобщи', 'Обобщите'])
    expect([k('проанализировать', 'sie', 'ru'), k('описать', 'sie', 'ru'), k('дать оценку', 'sie', 'ru')]).toEqual(['Проанализируйте', 'Опишите', 'Дайте оценку'])
  })
})

describe('Falsche Formen finden und korrigieren', () => {
  const fix = (t: string): string => korrigiereOperatorformen(t).text

  it('Regressionsfall der Lehrkraft: „Zusammenfassen Sie" wird gemeldet und korrigiert', () => {
    const t = 'Zusammenfassen Sie anhand von M1 die Position Bismarcks.'
    const f = operatorFormfehler(t)
    expect(f).toHaveLength(1)
    expect(f[0].falsch).toBe('Zusammenfassen Sie')
    expect(f[0].richtig).toBe('Fassen Sie … zusammen')
    expect(f[0].korrigiert).toBe('Fassen Sie anhand von M1 die Position Bismarcks zusammen.')
  })

  it('weitere Infinitivstellungen trennbarer Verben und Wendungen', () => {
    expect(fix('Herausarbeiten Sie die Ziele aus M2.')).toBe('Arbeiten Sie die Ziele aus M2 heraus.')
    expect(fix('Darstellen Sie den Verlauf.')).toBe('Stellen Sie den Verlauf dar.')
    expect(fix('Einordnen Sie die Quelle in den historischen Kontext.')).toBe('Ordnen Sie die Quelle in den historischen Kontext ein.')
    expect(fix('Auseinandersetzen Sie sich mit der These.')).toBe('Setzen Sie sich mit der These auseinander.')
    expect(fix('Stellung nehmen Sie zu der Aussage.')).toBe('Nehmen Sie zu der Aussage Stellung.')
    expect(fix('In Beziehung setzen Sie M1 und M2.')).toBe('Setzen Sie M1 und M2 in Beziehung.')
  })

  it('du-/ihr-Form mit „Sie" und ungetrennte du-Formen', () => {
    expect(fix('Erläutere Sie die Folgen.')).toBe('Erläutern Sie die Folgen.')
    expect(fix('Erläutert Sie die Folgen.')).toBe('Erläutern Sie die Folgen.')
    expect(fix('Lies Sie den Text.')).toBe('Lesen Sie den Text.')
    expect(fix('Fasse Sie den Text zusammen.')).toBe('Fassen Sie den Text zusammen.')
    expect(fix('Zusammenfasse den Text in drei Sätzen.')).toBe('Fasse den Text in drei Sätzen zusammen.')
    expect(fix('Herausarbeite die Merkmale.')).toBe('Arbeite die Merkmale heraus.')
  })

  it('Partikel zu früh: ans Ende des Hauptsatzes', () => {
    expect(fix('Fassen Sie zusammen die Ergebnisse aus M1.')).toBe('Fassen Sie die Ergebnisse aus M1 zusammen.')
    expect(fix('Stelle dar die Entwicklung.')).toBe('Stelle die Entwicklung dar.')
  })

  it('Nebensätze, Teilsätze und Auszeichnungen', () => {
    expect(fix('Zusammenfassen Sie, was M1 über die Ursachen sagt.')).toBe('Fassen Sie zusammen, was M1 über die Ursachen sagt.')
    expect(fix('Herausarbeiten Sie aus M1, welche Ziele Bismarck verfolgte.')).toBe('Arbeiten Sie aus M1 heraus, welche Ziele Bismarck verfolgte.')
    expect(fix('Zusammenfassen Sie die Rede und erläutern Sie ihre Wirkung.')).toBe('Fassen Sie die Rede zusammen und erläutern Sie ihre Wirkung.')
    expect(fix('**Zusammenfassen** Sie anhand von M1 die Position.')).toBe('**Fassen** Sie anhand von M1 die Position **zusammen**.')
    // Relativsatz hinter der Satzklammer (Ausklammerung) – korrekt und üblich
    expect(fix('Zusammenfassen Sie die Positionen, die in M1 vertreten werden.')).toBe('Fassen Sie die Positionen zusammen, die in M1 vertreten werden.')
    expect(fix('Zusammenfassen Sie die Ursachen, die Folgen und die Bedeutung.')).toBe('Fassen Sie die Ursachen, die Folgen und die Bedeutung zusammen.')
    expect(fix('a) Zusammenfassen Sie z. B. die Hauptaussage. b) Erläutern Sie sie.')).toBe('a) Fassen Sie z. B. die Hauptaussage zusammen. b) Erläutern Sie sie.')
    // Partikel schon am Ende: nicht doppeln
    expect(fix('Zusammenfassen Sie den Text zusammen.')).toBe('Fassen Sie den Text zusammen.')
  })

  it('lässt korrekte Formen, Zitate, Infinitiv-Überschriften und Substantive unberührt', () => {
    for (const t of [
      'Fassen Sie anhand von M1 die Position Bismarcks zusammen.',
      'Fasse den Text zusammen.',
      'Fasst den Text zusammen.',
      'Fassen Sie zusammen, was M1 aussagt.',
      'Arbeiten Sie heraus, welche Ziele genannt werden.',
      'Setzen Sie sich mit der These auseinander.',
      'Nehmen Sie Stellung zur These.',
      'Setzen Sie ein Wort ein.',
      'Gehen Sie auf die Frage ein.',
      'Erläutern Sie die Folgen.',
      'Lies den Text.',
      'Zusammenfassen: Die wichtigsten Ergebnisse der Stunde.',
      'Aufgabe 2: Untersuchen',
      'Korrigieren Sie den Satz „Zusammenfassen Sie den Text."',
      'Hinweise zur Lösung stehen auf der Rückseite.',
      'Vorteile und Nachteile der Globalisierung.',
      'Anstelle von M1 kann auch M2 genutzt werden.',
      'Aussage 1: Der Text ist neutral.',
      'Summarise the text.',
      'Résumer le texte en cinq phrases.'
    ])
      expect(operatorFormfehler(t), t).toEqual([])
  })

  it('meldet nichts in Fremdsprachen', () => {
    expect(operatorFormfehler('Zusammenfassen Sie den Text.', 'en')).toEqual([])
  })
})

describe('Erkennung: falsche Formen gelten nicht als korrekt', () => {
  it('pruefeAnweisung meldet die Infinitivstellung als Formfehler', () => {
    const b = pruefeAnweisung('Zusammenfassen Sie anhand von M1 die Position Bismarcks.', ['zusammenfassen', 'erläutern'])
    expect(b.art).toBe('operator')
    expect(b.formfehler).toHaveLength(1)
    expect(b.formfehler[0].richtig).toBe('Fassen Sie … zusammen')
    const t = findeOperatoren('Zusammenfassen Sie anhand von M1 die Position Bismarcks.', ['zusammenfassen'])
    expect(t[0].falscheForm).toBe('Fassen Sie … zusammen')
  })

  it('korrekte Formen: kein Formfehler', () => {
    for (const t of ['Fassen Sie anhand von M1 die Position zusammen.', 'Fasse … zusammen.', 'Arbeitet die Merkmale heraus.', 'Nimm Stellung zur These.'])
      expect(pruefeAnweisung(t, ['zusammenfassen', 'herausarbeiten', 'Stellung nehmen']).formfehler, t).toEqual([])
  })

  it('erkennt die korrigierte Form wieder als Operator', () => {
    const b = pruefeAnweisung(korrigiereOperatorformen('Zusammenfassen Sie anhand von M1 die Position.').text, ['zusammenfassen'])
    expect(b.art).toBe('operator')
    expect(b.formfehler).toEqual([])
  })

  it('Anrede-Prüfung: „Infinitiv + Sie" ist für die Anrede in Ordnung – die Form meldet die Operatorprüfung', () => {
    expect(falscheAnrede('Zusammenfassen Sie anhand von M1 die Position.', 'sie')).toBeNull()
    expect(operatorFormfehler('Zusammenfassen Sie anhand von M1 die Position.')).toHaveLength(1)
  })
})

describe('Regel für die KI-Aufträge', () => {
  it('verlangt die Satzklammer mit Beispielen trennbarer Verben', () => {
    const r = operatorSatzbauRegel('sie')
    expect(r).toContain('Fassen Sie anhand von M1 die Position zusammen.')
    expect(r).toContain('FALSCH')
    expect(r).toContain('Zusammenfassen Sie')
    expect(operatorSatzbauRegel('du')).toContain('Nimm … Stellung')
    expect(operatorSatzbauRegel('sie', 'fr')).toContain('Résumez')
    expect(operatorSatzbauRegel('du', 'ru')).toContain('Обобщи')
  })
})
