import { describe, expect, it } from 'vitest'
import {
  alleBekanntenOperatoren,
  enthaeltOperatorForm,
  ersterOperator,
  findeOperatoren,
  naechsterOperator,
  pruefeAnweisung,
  variantenVon
} from '../src/shared/operatoren/erkennung'
import { operatorenAuswahl } from '../src/shared/operatoren/zugriff'

/*
 * Gemeinsame Operatorerkennung (30.09.2026).
 *
 * Anlass (Rückmeldung der Lehrkraft): „In der App Lernzielkontrolle werden ‚Erläutern Sie …'
 * und ‚Arbeiten Sie … heraus' nicht als Operatoren erkannt, obwohl es Operatoren in Geschichte
 * sind." Geprüft wird gegen die Liste, die die Programme für Land, Fach und Stufe wählen.
 */

const liste = (stateId: string, fach: string, stufe: 'sek1' | 'sek2', schulform?: string) => {
  const a = operatorenAuswahl({ stateId, fach, stufe, schulform })
  expect(a, `${stateId} ${fach} ${stufe}`).not.toBeNull()
  return a!
}

const erster = (text: string, l: ReturnType<typeof liste>): string | undefined => ersterOperator(text, l.operatoren, { sprache: l.sprache })?.operator

describe('Geschichte – die Formen aus der Rückmeldung', () => {
  const ni = liste('NI', 'geschichte', 'sek2')
  const nw = liste('NW', 'geschichte', 'sek2')
  const by = liste('BY', 'geschichte', 'sek2', 'gymnasium')

  it.each([
    ['Erläutern Sie die Ursachen der Julikrise.', 'erläutern'],
    ['Erläutere die Ursachen der Julikrise.', 'erläutern'],
    ['Erläutert die Ursachen der Julikrise.', 'erläutern'],
    ['**Erläutere** die Ursachen.', 'erläutern'],
    ['Arbeiten Sie die Position des Autors heraus.', 'herausarbeiten'],
    ['Arbeite die Position des Autors heraus.', 'herausarbeiten'],
    ['Arbeitet die Position des Autors heraus, indem ihr die Quelle genau lest.', 'herausarbeiten'],
    ['**Arbeite** die zentralen Aussagen **heraus**.', 'herausarbeiten'],
    ['Stelle die Entwicklung der Stadt im 19. Jahrhundert dar.', 'darstellen'],
    ['Stellen Sie die Lage Roms um 500 v. Chr. dar.', 'darstellen'],
    ['Stellen Sie die Positionen von Bismarck und Windthorst gegenüber.', 'gegenüberstellen'],
    ['Setze dich mit der These des Historikers auseinander.', 'sich auseinandersetzen'],
    ['Setzen Sie sich kritisch mit der Rede auseinander.', 'sich auseinandersetzen'],
    ['Nimm Stellung zu der Aussage des Kaisers.', 'Stellung nehmen'],
    ['Nehmen Sie Stellung zur Rede.', 'Stellung nehmen'],
    ['Ordne die Quelle in den historischen Kontext ein.', 'einordnen'],
    ['Ordnen Sie die Karikatur in den Zusammenhang der Märzrevolution ein.', 'einordnen'],
    ['Setze die beiden Quellen in Beziehung.', 'in Beziehung setzen'],
    ['Beurteile die Politik Bismarcks.', 'beurteilen'],
    ['Beurteilt die Politik Bismarcks.', 'beurteilen'],
    ['Beurteilen Sie die Politik Bismarcks.', 'beurteilen'],
    ['Gib den Inhalt der Quelle wieder.', 'wiedergeben'],
    ['Fassen Sie den Inhalt zusammen.', 'zusammenfassen'],
    ['Weise nach, dass die Quelle parteiisch ist.', 'nachweisen'],
    ['Prüfen Sie, ob die These zutrifft.', 'überprüfen'],
    ['Erörtere, ob der Versailler Vertrag ein Diktatfrieden war.', 'erörtern']
  ])('NI: „%s" → %s', (text, op) => {
    expect(erster(text, ni)).toBe(op)
  })

  it.each([
    ['Erläutern Sie die Ursachen.', 'erläutern'],
    ['Arbeiten Sie die Kernaussagen heraus.', 'herausarbeiten'],
    ['Ordnen Sie die Quelle in den Kontext ein.', 'einordnen'],
    ['Nehmen Sie Stellung zur These.', 'Stellung nehmen'],
    ['Nenne drei Ursachen.', 'nennen'],
    ['Charakterisieren Sie den Führungsstil.', 'charakterisieren']
  ])('NW: „%s" → %s', (text, op) => {
    expect(erster(text, nw)).toBe(op)
  })

  it.each([
    ['Erläutere die Folgen.', 'erläutern'],
    ['Arbeite heraus, welche Ziele Karl verfolgte.', 'herausarbeiten'],
    ['Stelle die Ereignisse dar.', 'darstellen'],
    ['Zähle drei Gründe auf.', 'aufzählen'],
    ['Nimm Stellung.', 'Stellung nehmen']
  ])('BY: „%s" → %s', (text, op) => {
    expect(erster(text, by)).toBe(op)
  })

  it('ein Wort gehört nur zu einem Operator („Ordne … ein" ist nicht zugleich „ordnen")', () => {
    const t = findeOperatoren('Ordne die Ereignisse zeitlich ein.', ['ordnen', 'einordnen', 'zuordnen'])
    expect(t.map((x) => x.operator)).toEqual(['einordnen'])
    expect(t[0].form).toBe('Ordne … ein')
    expect(t[0].art).toBe('getrennt')
  })

  it('„Stelle grafisch dar" ist genauer als „darstellen"', () => {
    expect(findeOperatoren('Stelle die Werte grafisch dar.', ['darstellen', 'grafisch darstellen']).map((x) => x.operator)).toEqual(['grafisch darstellen'])
  })

  it('eine Partikel mitten im Satz trennt kein Verb ab', () => {
    // „zu" ist hier Präposition, nicht die Partikel von „zuordnen"
    expect(enthaeltOperatorForm('Ordne die Begriffe zu den Bildern.', 'zuordnen')).toBe(false)
    expect(enthaeltOperatorForm('Ordne die Begriffe den Bildern zu.', 'zuordnen')).toBe(true)
  })
})

describe('keine Fehltreffer', () => {
  it('Substantive sind keine Operatoren', () => {
    expect(enthaeltOperatorForm('Begründe deine Entscheidung.', 'entscheiden')).toBe(false)
    expect(enthaeltOperatorForm('Erörtere die Bedeutung.', 'deuten')).toBe(false)
    expect(enthaeltOperatorForm('Nenne einen Beleg aus dem Text.', 'belegen')).toBe(false)
    expect(enthaeltOperatorForm('Betrachte das Bild.', 'bilden')).toBe(false)
    expect(enthaeltOperatorForm('Die Rechnung steht auf dem Blatt.', 'berechnen')).toBe(false)
  })

  it('ein Partizip mitten im Satz ist kein ihr-Imperativ', () => {
    expect(findeOperatoren('Nimm begründet Stellung.', ['begründen', 'Stellung nehmen']).map((x) => x.operator)).toEqual(['Stellung nehmen'])
  })
})

describe('Deutsch, Mathematik', () => {
  it('Deutsch NI: Interpretieren Sie, Analysiere, Charakterisiert', () => {
    const d = liste('NI', 'deutsch', 'sek2')
    expect(erster('Interpretieren Sie das Gedicht.', d)).toBe('interpretieren')
    expect(erster('Analysiere den Dialog.', d)).toBe('analysieren')
    expect(erster('Charakterisiert die Figur.', d)).toBe('charakterisieren')
    expect(erster('Nenne zwei Stilmittel.', d)).toMatch(/nennen/)
  })

  it('Mathematik: Berechne, Gib an, Bestimmen Sie, Skizziere', () => {
    const m = ['berechnen', 'angeben', 'bestimmen', 'skizzieren', 'nachweisen', 'herleiten']
    expect(ersterOperator('**Berechne** den Wert von $(-3)^4$.', m)?.operator).toBe('berechnen')
    expect(ersterOperator('Gib den Erweiterungsfaktor an.', m)?.operator).toBe('angeben')
    expect(ersterOperator('Bestimmen Sie die Nullstellen.', m)?.operator).toBe('bestimmen')
    expect(ersterOperator('Skizziere den Graphen.', m)?.operator).toBe('skizzieren')
    expect(ersterOperator('Weisen Sie nach, dass f streng monoton ist.', m)?.operator).toBe('nachweisen')
    expect(ersterOperator('Leite die Formel her.', m)?.operator).toBe('herleiten')
  })

  it('Substantivierung als Rückfall: „Verfasse eine Stellungnahme"', () => {
    const t = ersterOperator('Verfasse eine Stellungnahme zur These.', ['Stellung nehmen', 'erörtern'])
    expect(t?.operator).toBe('Stellung nehmen')
    expect(t?.art).toBe('nomen')
  })
})

describe('Zielsprachen', () => {
  it('Englisch: britisch und amerikanisch, Wendungen mit Auslassung', () => {
    const e = ['analyse', 'summarise', 'comment (on)', 'put … into the context of ...', 'point out', 'describe']
    expect(ersterOperator('Analyze the cartoon.', e, { sprache: 'en' })?.operator).toBe('analyse')
    expect(ersterOperator('**Summarize** the text.', e, { sprache: 'en' })?.operator).toBe('summarise')
    expect(ersterOperator('Comment on the speech.', e, { sprache: 'en' })?.operator).toBe('comment (on)')
    expect(
      ersterOperator('Put the source into the context of the Cold War.', e, {
        sprache: 'en'
      })?.operator
    ).toBe('put … into the context of ...')
    expect(
      ersterOperator('Read the text and then point out the main ideas.', e, {
        sprache: 'en'
      })?.operator
    ).toBe('point out')
    // „describe" mitten im Satz ist keine Aufgabe
    expect(
      ersterOperator('The text tries to describe the war.', e, {
        sprache: 'en'
      })
    ).toBeNull()
  })

  it('Englisch NI Oberstufe: Landesliste', () => {
    const en = liste('NI', 'englisch', 'sek2')
    expect(en.sprache).toBe('en')
    expect(erster('Outline the author’s view on social media.', en)).toMatch(/outline/)
    expect(erster('Assess the effectiveness of the speech.', en)).toMatch(/assess/)
  })

  it('Französisch: décris / décrivez / décrire', () => {
    const f = ['décrire', 'prendre position', 'mettre en relation', 'expliquer']
    expect(ersterOperator('Décris la photo.', f, { sprache: 'fr' })?.operator).toBe('décrire')
    expect(ersterOperator('Décrivez la photo.', f, { sprache: 'fr' })?.operator).toBe('décrire')
    expect(ersterOperator('Prenez position sur ce sujet.', f, { sprache: 'fr' })?.operator).toBe('prendre position')
    expect(ersterOperator('Mets en relation les deux textes.', f, { sprache: 'fr' })?.operator).toBe('mettre en relation')
    expect(ersterOperator('Explique pourquoi.', f, { sprache: 'fr' })?.operator).toBe('expliquer')
  })

  it('Spanisch: analiza / analizad / analice', () => {
    const s = ['analizar', 'describir', 'exponer']
    expect(ersterOperator('Analiza el texto.', s, { sprache: 'es' })?.operator).toBe('analizar')
    expect(ersterOperator('Analice el texto.', s, { sprache: 'es' })?.operator).toBe('analizar')
    expect(ersterOperator('Describid la imagen.', s, { sprache: 'es' })?.operator).toBe('describir')
    expect(ersterOperator('Expón tu opinión.', s, { sprache: 'es' })?.operator).toBe('exponer')
  })
})

describe('Abgleich mit der Landesliste', () => {
  it('ein Verb anderer Listen ist „kein Operator der Landesliste" – mit Vorschlag', () => {
    // NI Geschichte führt „erklären" und „erläutern", aber nicht „diskutieren"
    const ni = liste('NI', 'geschichte', 'sek2')
    const b = pruefeAnweisung('Diskutieren Sie die These.', ni.operatoren, {
      sprache: 'de'
    })
    expect(b.art).toBe('fremd')
    if (b.art === 'fremd') {
      expect(b.operator).toBe('diskutieren')
      expect(b.vorschlag).toBe('erörtern')
    }
  })

  it('ein Operator der Liste ist einer – auch in der Sie-Form', () => {
    const ni = liste('NI', 'geschichte', 'sek2')
    expect(pruefeAnweisung('Arbeiten Sie heraus, welche Ziele die Regierung verfolgte.', ni.operatoren).art).toBe('operator')
  })

  it('gar kein Operator', () => {
    expect(pruefeAnweisung('2³ · 2⁴ = ?', ['berechnen']).art).toBe('keiner')
  })

  it('nächstliegender Operator: Entsprechung vor Schreibähnlichkeit', () => {
    expect(naechsterOperator('erklären', ['nennen', 'erläutern', 'beurteilen'])).toBe('erläutern')
    expect(naechsterOperator('prüfen', ['nennen', 'überprüfen'])).toBe('überprüfen')
    expect(naechsterOperator('explain', ['describe', 'illustrate'])).toBe('illustrate')
    expect(naechsterOperator('zeichnen', ['nennen', 'erläutern'])).toBeNull()
  })

  it('Bestand: deutsche Operatoren ohne englische, englische ohne deutsche', () => {
    const de = alleBekanntenOperatoren('de')
    expect(de).toEqual(expect.arrayContaining(['erläutern', 'herausarbeiten', 'stellung nehmen']))
    expect(de).not.toContain('describe')
    const en = alleBekanntenOperatoren('en')
    expect(en).toEqual(expect.arrayContaining(['describe', 'assess']))
  })

  it('Varianten in Listenschreibweise', () => {
    expect(variantenVon('(be)nennen')).toEqual(['nennen', 'benennen'])
    expect(variantenVon('ein-, zuordnen')).toEqual(['einordnen', 'zuordnen'])
    expect(variantenVon('be-/nennen')).toEqual(['benennen', 'nennen'])
    expect(variantenVon('analysieren/untersuchen')).toEqual(['analysieren', 'untersuchen'])
  })
})
