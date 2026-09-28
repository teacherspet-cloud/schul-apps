import { describe, expect, it } from 'vitest'
import {
  BEDEUTUNGSKONFLIKTE,
  definitionFuer,
  KERN_OPERATOREN,
  konflikteFuer,
  LAENDERPROFILE,
  namenAus,
  istBelegt,
  OHNE_AMTLICHE_LISTE,
  profilFuer,
  ZU_AUFWENDIG
} from '../src/renderer/src/modules/lernzielkontrolle/didactics/operatoren'
import {
  bedeutungsHinweise,
  enthaeltOperator,
  operatorenIn,
  operatorRegeln,
  pruefeOperatoren,
  stamm,
  type AufgabeZurPruefung
} from '../src/renderer/src/modules/lernzielkontrolle/didactics/operatorPruefung'
import { STATES } from '../src/renderer/src/modules/arbeitsblatt/didactics/states'
import { SUBJECTS } from '../src/renderer/src/modules/arbeitsblatt/model/subjects'
import { SOURCE_SUBJECTS, skillFocusOptions } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { SUBJECT_OPERATORS } from '../src/renderer/src/modules/arbeitsblatt/didactics/subjectOperators'
import { rolePlayTypesFor } from '../src/renderer/src/modules/arbeitsblatt/didactics/rolePlay'
import { boardStructuresFor } from '../src/renderer/src/modules/arbeitsblatt/didactics/boardDesign'

const aufgabe = (instruction: string, patch: Partial<AufgabeZurPruefung> = {}): AufgabeZurPruefung => ({
  id: 't1',
  instruction,
  answerKind: 'lines',
  hatMaterial: false,
  ...patch
})

/*
 * Der Befund, der dieses Modell bestimmt: Es gibt eine gemeinsame Grundlage (IQB-Grundstock,
 * KMK-Beschluss v. 15.10.2020), aber der BESTAND konvergiert und die BEDEUTUNG nicht.
 * Derselbe Operator verlangt in zwei Ländern etwas anderes.
 */
describe('Drei Schichten statt einer Liste', () => {
  it('trägt zu jedem Profil Fundstelle, Stand und Adresse', () => {
    for (const p of LAENDERPROFILE) {
      expect(p.quelle, p.stateId).not.toBe('')
      expect(p.stand, p.stateId).not.toBe('')
      expect(p.url, p.stateId).toMatch(/^https?:\/\//)
      expect(p.operatoren.length, p.stateId).toBeGreaterThan(5)
    }
  })

  it('nennt nur Länder, die es gibt', () => {
    const ids = STATES.map((s) => s.id)
    for (const p of LAENDERPROFILE) expect(ids, p.stateId).toContain(p.stateId)
    for (const id of OHNE_AMTLICHE_LISTE) expect(ids).toContain(id)
  })

  it('deckt jetzt jedes Bundesland ab', () => {
    // Nach dem Nachtragen hat jedes Land für beide Stufen eine Grundlage
    for (const st of STATES) {
      expect(profilFuer(st.id, 'mathematik', 'sek1'), st.id).toBeDefined()
      expect(profilFuer(st.id, 'mathematik', 'sek2'), st.id).toBeDefined()
    }
  })

  it('kennzeichnet abgeleitete Profile als solche', () => {
    /*
     * Der Kern der Ehrlichkeit: Für neun Länder wurde keine amtliche Liste gefunden. Sie
     * bekommen den gemeinsamen Bestand, aber KEINE Definitionen – und die Oberfläche sagt
     * das auch.
     */
    for (const id of OHNE_AMTLICHE_LISTE) {
      const p = profilFuer(id, 'mathematik', 'sek2')!
      expect(istBelegt(p), id).toBe(false)
      expect(p.amtlich, id).toBe(false)
      expect(p.hinweis, id).toMatch(/keine amtliche Operatorenliste gefunden/)
      expect(
        p.operatoren.every((o) => o.definition === ''),
        id
      ).toBe(true)
    }
  })

  it('lässt ein belegtes Profil immer vor einem abgeleiteten gewinnen', () => {
    expect(istBelegt(profilFuer('NW', 'mathematik', 'sek2'))).toBe(true)
    expect(istBelegt(profilFuer('BY', 'mathematik', 'sek1'))).toBe(true)
  })

  it('findet das Profil über Land, Fach und Stufe', () => {
    expect(profilFuer('NW', 'mathematik', 'sek2')?.stateId).toBe('NW')
    // Sachsen führt eine Liste für ALLE Fächer – sie greift auch für Mathematik
    expect(profilFuer('SN', 'mathematik', 'sek1')?.fach).toBe('alle')
    /*
     * Die NRW-Liste ist ein Abiturdokument. Für die Sek I gibt es keins – dort greift das
     * abgeleitete Profil, nicht etwa die Abiturliste. Genau das ist der Sinn des
     * Stufenschalters: Für eine Lernzielkontrolle in Klasse 7 wäre die Abiturliste die
     * falsche Referenz.
     */
    expect(istBelegt(profilFuer('NW', 'mathematik', 'sek1'))).toBe(false)
  })
})

describe('Die Definition ist gefährlicher als der Operator', () => {
  it('hält die Bedeutungsunterschiede tatsächlich auseinander', () => {
    /*
     * Dieser Test bewacht die Grundannahme des ganzen Modells. Schlägt er fehl, weil jemand
     * die Listen zusammengelegt hat, ist der Rest wertlos: „Begründen Sie" erzeugte dann in
     * Schleswig-Holstein einen Erwartungshorizont aus reiner Rechnung, obwohl die dortige
     * Liste ausdrücklich Textanteile verlangt.
     */
    const nw = definitionFuer('begründen', profilFuer('NW', 'mathematik', 'sek2'))!
    const sh = definitionFuer('begründen', profilFuer('SH', 'mathematik', 'sek1'))!
    expect(nw).not.toBe(sh)
    expect(sh).toMatch(/genügt hier nicht/)
    expect(nw).toMatch(/frei gewählt werden/)
  })

  it('belegt den Widerspruch beim Taschenrechner', () => {
    expect(definitionFuer('berechnen', profilFuer('HE', 'mathematik', 'sek2'))).toMatch(/ohne Nutzung der erweiterten Funktionalitäten/)
    expect(definitionFuer('berechnen', profilFuer('SH', 'mathematik', 'sek1'))).toMatch(/Nutzung des Taschenrechners ist zulässig/)
  })

  it('kennt den strengeren niedersächsischen Zusatz', () => {
    expect(definitionFuer('berechnen', profilFuer('NI', 'mathematik', 'sek2'))).toMatch(/Extrempunkte/)
    expect(definitionFuer('berechnen', profilFuer('NW', 'mathematik', 'sek2'))).not.toMatch(/Extrempunkte/)
  })

  it('gibt ohne Profil KEINE Definition aus', () => {
    // Lieber keine Definition als eine fremde
    expect(definitionFuer('begründen', undefined)).toBeNull()
  })

  it('gibt nichts aus, wo die Quelle nichts hergibt', () => {
    // Sachsen gliedert nach Fächergruppen – die Zuordnung zum Einzelfach wäre Auslegung
    expect(definitionFuer('begründen', profilFuer('SN', 'mathematik', 'sek1'))).toBeNull()
  })

  it('führt jeden dokumentierten Konflikt mit Ländern und Fach', () => {
    for (const k of BEDEUTUNGSKONFLIKTE) {
      expect(k.laender.length, k.operator).toBeGreaterThan(1)
      expect(k.unterschied.length, k.operator).toBeGreaterThan(60)
    }
    expect(konflikteFuer('begründen', 'mathematik')).toHaveLength(1)
    expect(konflikteFuer('berechnen', 'mathematik')).toHaveLength(2)
  })
})

describe('Die AFB-Spalte ist nicht universell', () => {
  it('kennt die vier verschiedenen Zuordnungslogiken', () => {
    // NRW Mathematik: „Grundsätzlich können sich alle Operatoren auf alle drei beziehen."
    expect(profilFuer('NW', 'mathematik', 'sek2')!.afbLogik).toBe('keine')
    // Hessen: der AFB, „in welchem sie jeweils ihren Schwerpunkt haben"
    expect(profilFuer('HE', 'mathematik', 'sek2')!.afbLogik).toBe('schwerpunkt')
  })

  it('füllt AFB nur, wo das Profil eine Spalte hat', () => {
    for (const p of LAENDERPROFILE) {
      const mitAfb = p.operatoren.filter((o) => o.afb?.length)
      // Ohne AFB-Spalte darf kein Operator einen Anforderungsbereich tragen
      if (p.afbLogik === 'keine') expect(mitAfb, p.stateId).toEqual([])
      // Umgekehrt nur dort, wo die Zuordnung aus der Quelle auch übernommen wurde
      if (p.afbUebernommen) expect(mitAfb.length, p.stateId).toBeGreaterThan(0)
    }
  })
})

describe('Stufe geht dem Land vor', () => {
  it('führt die belegten Sek-I-Listen', () => {
    const sek1 = LAENDERPROFILE.filter((p) => p.stufe === 'sek1').map((p) => p.stateId)
    expect(sek1).toContain('BY') // Mittelschule Mathematik, LehrplanPLUS
    expect(sek1).toContain('SN') // Mittelschule Kl. 5–10
    expect(sek1).toContain('SH') // Fachanforderungen Sek I und II in einem Dokument
  })

  it('merkt sich die Anrede der Stufe', () => {
    // Die bayerische Mittelschulliste spricht die Lernenden in der Definition selbst an
    expect(profilFuer('BY', 'mathematik', 'sek1')!.anrede).toBe('du')
    expect(definitionFuer('berechne', profilFuer('BY', 'mathematik', 'sek1'))).toMatch(/^Du ermittelst/)
    expect(profilFuer('NW', 'mathematik', 'sek2')!.anrede).toBe('sie')
  })
})

describe('Operatoren in der Aufgabenstellung finden', () => {
  it('erkennt den Imperativ zum Infinitiv der Liste', () => {
    expect(stamm('berechnen')).toBe('berechn')
    expect(enthaeltOperator('**Berechne** den Wert von $(-3)^4$.', 'berechnen')).toBe(true)
    expect(enthaeltOperator('**Bestimme** den Exponenten.', 'bestimmen')).toBe(true)
  })

  it('kennt Verben auf -ern', () => {
    /*
     * „erörtern" endet auf -rn, nicht auf -en. Ohne diesen Fall blieb der Stamm „erörtern",
     * und „Erörtere" wurde nicht als Operator erkannt – die Warnung blieb stumm.
     */
    expect(stamm('erörtern')).toBe('erörter')
    expect(enthaeltOperator('**Erörtere** die Folgen.', 'erörtern')).toBe(true)
  })

  it('hält ein Substantiv nicht für einen Operator', () => {
    /*
     * Ein Muster mit beliebigen Endbuchstaben hielt „Entscheidung" für „entscheiden" und
     * „Bedeutung" für „deuten". „Begründe deine Entscheidung" wäre so als Aufgabe mit zwei
     * Operatoren gemeldet worden.
     */
    expect(enthaeltOperator('**Begründe** deine Entscheidung.', 'entscheiden')).toBe(false)
    expect(enthaeltOperator('**Erörtere** die Bedeutung.', 'deuten')).toBe(false)
  })

  it('findet auch trennbare Verben', () => {
    // Aus „zuordnen" wird in der Aufgabe „Ordne … zu" – der Infinitivstamm steht nirgends
    expect(enthaeltOperator('**Ordne** jeder Umformung das Gesetz zu.', 'zuordnen')).toBe(true)
    expect(enthaeltOperator('**Gib** den Erweiterungsfaktor an.', 'angeben')).toBe(true)
  })

  it('verwechselt nichts mit einem ähnlichen Wort', () => {
    expect(enthaeltOperator('Die Rechnung steht auf dem Blatt.', 'berechnen')).toBe(false)
  })

  it('zählt Synonyme nicht doppelt', () => {
    // „begründen, nachweisen, zeigen" ist in NRW EINE Zeile
    const p = profilFuer('NW', 'mathematik', 'sek2')!
    expect(operatorenIn('**Begründe** deine Entscheidung.', namenAus(p))).toEqual(['begründen'])
  })
})

/*
 * Die vier Fälle aus der KI-erzeugten Lernzielkontrolle zu den Potenzgesetzen, die die
 * Lehrkraft am 23.09.2026 vorgelegt hat. Jeder mit Beleg aus abitur.nrw.
 */
describe('Die Fehler aus der Potenzgesetze-Lernzielkontrolle', () => {
  const nw = profilFuer('NW', 'mathematik', 'sek2')

  it('meldet „Bestimme" für eine Zuordnungsaufgabe', () => {
    const w = pruefeOperatoren([aufgabe('**Bestimme** das passende Potenzgesetz.', { answerKind: 'matching' })], nw)
    const treffer = w.find((x) => x.art === 'kein-weg')!
    expect(treffer.message).toMatch(/keinen Weg zum Darstellen/)
    expect(treffer.message).toMatch(/Gib an/)
  })

  it('meldet „Deute" ohne Sachzusammenhang', () => {
    const w = pruefeOperatoren([aufgabe('**Deute** das Ergebnis.', { hatMaterial: false })], nw)
    expect(w.find((x) => x.art === 'kontext')!.message).toMatch(/vorgegebenen Sachzusammenhang/)
  })

  it('lässt „Deute" mit Material durch', () => {
    const w = pruefeOperatoren([aufgabe('**Deute** das Ergebnis im Sachzusammenhang.', { hatMaterial: true })], nw)
    expect(w.filter((x) => x.art === 'kontext')).toEqual([])
  })

  it('meldet zwei Operatoren in einer Aufgabe', () => {
    const w = pruefeOperatoren([aufgabe('**Entscheide**, ob die Aussage stimmt, und begründe deine Antwort.')], nw)
    const treffer = w.find((x) => x.art === 'doppelt')!
    expect(treffer.message).toMatch(/zwei Dinge auf einmal/)
    expect(treffer.message).toMatch(/Teilaufgaben a\) und b\)/)
  })

  it('meldet die nackte Aufgabe ohne Operator', () => {
    const w = pruefeOperatoren([aufgabe('$2^3 \\cdot 2^4$')], nw)
    expect(w[0].art).toBe('fehlt')
    expect(w[0].message).toMatch(/kein erkennbarer|keinem erkennbaren/)
  })

  it('schweigt bei einer sauberen Aufgabe', () => {
    expect(pruefeOperatoren([aufgabe('**Berechne** den Wert von $(-3)^4$.')], nw)).toEqual([])
  })
})

describe('Was für einen Kurztest zu aufwendig ist', () => {
  it('meldet das Erörtern mit der Zeitbegründung', () => {
    const w = pruefeOperatoren([aufgabe('**Erörtere** die Bedeutung der Potenzgesetze.')], profilFuer('NW', 'mathematik', 'sek2'))
    const treffer = w.find((x) => x.art === 'aufwendig')!
    expect(treffer.message).toMatch(/GSO § 23/)
  })

  it('führt „vereinfachen" NICHT als zu aufwendig', () => {
    /*
     * Der umgekehrte Fehler wäre genauso schlimm. „Vereinfache" steht in keiner amtlichen
     * Liste, ist aber durch die Öffnungsklausel gedeckt und steht in echten bayerischen
     * Stegreifaufgaben wörtlich: „Fasse zusammen und vereinfache so weit wie möglich."
     */
    expect(ZU_AUFWENDIG).not.toContain('vereinfachen')
  })
})

describe('Hessen hat keine Öffnungsklausel', () => {
  it('meldet dort einen ungelisteten Operator', () => {
    const he = profilFuer('HE', 'mathematik', 'sek2')!
    expect(he.oeffnungsklausel).toBe(false)
    const w = pruefeOperatoren([aufgabe('**Klassifiziere** die Terme.')], he)
    expect(w.some((x) => x.art === 'unbekannt' || x.art === 'fehlt')).toBe(true)
  })

  it('meldet ihn in NRW nicht', () => {
    // NRW: „Die Verwendung eines Operators, der in der Übersicht nicht genannt wird, ist möglich."
    const w = pruefeOperatoren([aufgabe('**Ordne** die Terme zu.')], profilFuer('NW', 'mathematik', 'sek2'))
    expect(w.filter((x) => x.art === 'unbekannt')).toEqual([])
  })
})

describe('Hinweis auf Bedeutungsunterschiede', () => {
  it('warnt in Schleswig-Holstein beim Begründen', () => {
    const h = bedeutungsHinweise([aufgabe('**Begründe** deine Antwort.')], profilFuer('SH', 'mathematik', 'sek1'), 'mathematik')
    expect(h[0]).toMatch(/genügt hier nicht/)
  })

  it('schweigt ohne Profil', () => {
    expect(bedeutungsHinweise([aufgabe('**Begründe** deine Antwort.')], undefined, 'mathematik')).toEqual([])
  })
})

describe('Regelteil für die KI', () => {
  it('gibt ohne Profil nur Namen aus, keine Definitionen', () => {
    const r = operatorRegeln(undefined)
    expect(r).toMatch(/keine amtliche Operatorenliste vor/)
    expect(r).toMatch(/erfinde keine Definition/)
    for (const op of KERN_OPERATOREN) expect(r, op).toContain(op)
    expect(r).not.toMatch(/Die Operatoren bedeuten in diesem Land/)
  })

  it('gibt mit Profil die wörtlichen Definitionen aus', () => {
    const r = operatorRegeln(profilFuer('SH', 'mathematik', 'sek1'))
    expect(r).toMatch(/Die Angabe einer Formel oder Ähnliches genügt hier nicht/)
    expect(r).toMatch(/Fachanforderungen Mathematik/)
  })

  it('sagt der KI, dass Hessen keine Öffnungsklausel hat', () => {
    expect(operatorRegeln(profilFuer('HE', 'mathematik', 'sek2'))).toMatch(/KEINE Öffnungsklausel/)
  })

  it('überlässt die Anrede der eigenen Regel im Auftrag und kennzeichnet die Definitionen als Zitat', () => {
    // Die Anrede steht seit Paket 8b als Stufenregel im kurztestPrompt (tests/anredeMaterial.test.ts),
    // nicht mehr im Operatorenteil – dort galt die Anrede der Landesliste, die mehrfach siezt.
    const r = operatorRegeln(profilFuer('BY', 'mathematik', 'sek1'))
    expect(r).not.toMatch(/mit „du" an/)
    expect(r).toMatch(/wörtlich aus der Landesliste zitiert/)
  })

  it('verbietet in jedem Fall zwei Operatoren und den nackten Term', () => {
    for (const p of [undefined, profilFuer('NW', 'mathematik', 'sek2')]) {
      expect(operatorRegeln(p)).toMatch(/GENAU EINEM Operator/)
      expect(operatorRegeln(p)).toMatch(/Kein nackter Term/)
    }
  })
})

/*
 * Fachprofile, die ich aus den amtlichen PDFs selbst ausgelesen habe (23.09.2026).
 *
 * Lehre daraus: Beim ersten Auslesen mit Spaltenerhalt standen Operator und Definition
 * versetzt zueinander – „examine" wäre die Definition von „assess" bekommen. Erst das
 * zeilenweise Auslesen (`pdftotext -raw`) gab die Paare richtig wieder. Diese Tests halten
 * die Paare fest, damit ein späteres Nachtragen nicht unbemerkt verrutscht.
 */
describe('Nachgetragene Fachprofile', () => {
  it('führt die englischen Operatoren auf Englisch', () => {
    const p = profilFuer('NW', 'englisch', 'sek2')!
    expect(istBelegt(p)).toBe(true)
    expect(definitionFuer('outline', p)).toBe('give the main features, structure or general principles of sth.')
    // Die Falle beim Auslesen: „examine" heißt NICHT dasselbe wie „assess"
    expect(definitionFuer('examine', p)).toBe('describe and explain in detail')
    expect(definitionFuer('assess', p)).toMatch(/well-founded opinion/)
  })

  it('übernimmt die AFB-Bandbreite der Geschichte', () => {
    const p = profilFuer('NW', 'geschichte', 'sek2')!
    expect(p.afbLogik).toBe('mehrfach')
    // „erörtern" und „interpretieren" sind dort ausdrücklich übergeordnete Operatoren
    const erörtern = p.operatoren.find((o) => o.name === 'erörtern')!
    expect(erörtern.afb).toEqual(['I', 'II', 'III'])
    expect(p.operatoren.find((o) => o.name === 'nennen')!.afb).toEqual(['I', 'II'])
  })

  it('kennt den Unterschied zwischen den Fächern EINES Landes', () => {
    /*
     * Der überraschendste Befund beim Nachtragen: NRW führt die Öffnungsklausel in
     * Mathematik und Biologie, in Englisch und Geschichte NICHT. Die Beleglage
     * unterscheidet sich also nicht nur zwischen Ländern, sondern innerhalb eines Landes
     * zwischen den Fächern.
     */
    expect(profilFuer('NW', 'mathematik', 'sek2')!.oeffnungsklausel).toBe(true)
    expect(profilFuer('NW', 'biologie', 'sek2')!.oeffnungsklausel).toBe(true)
    expect(profilFuer('NW', 'englisch', 'sek2')!.oeffnungsklausel).toBe(false)
    expect(profilFuer('NW', 'geschichte', 'sek2')!.oeffnungsklausel).toBe(false)
  })

  it('lässt Listen gelten, die laut Überschrift mehrere Fächer abdecken', () => {
    // Hessen: „Operatoren in den Fächern Biologie, Chemie, Informatik, Mathematik und Physik"
    for (const fach of ['biologie', 'chemie', 'physik', 'informatik']) {
      const p = profilFuer('HE', fach, 'sek2')
      expect(istBelegt(p), fach).toBe(true)
      expect(p!.quelle, fach).toMatch(/Biologie\/Chemie\/Informatik\/Mathematik\/Physik/)
    }
    // Niedersachsen: „Operatoren für die Naturwissenschaften (Biologie, Chemie, Physik)"
    for (const fach of ['biologie', 'chemie', 'physik']) {
      expect(istBelegt(profilFuer('NI', fach, 'sek2')), fach).toBe(true)
    }
  })

  it('gibt die naturwissenschaftlichen Definitionen wörtlich wieder', () => {
    expect(definitionFuer('bestätigen', profilFuer('NI', 'chemie', 'sek2'))).toMatch(/Gültigkeit einer Aussage/)
    expect(definitionFuer('abschätzen', profilFuer('NW', 'biologie', 'sek2'))).toBe('durch begründete Überlegungen Größenwerte angeben')
  })

  it('bleibt bei Fächern ohne Profil beim abgeleiteten Bestand', () => {
    // Kunst ist in keiner der gelesenen Listen eigens geführt
    expect(istBelegt(profilFuer('NW', 'kunst', 'sek2'))).toBe(false)
    // Erdkunde seit der Recherche vom 28.09.2026 aus der NRW-Operatorenübersicht Geographie
    expect(istBelegt(profilFuer('NW', 'erdkunde', 'sek2'))).toBe(true)
  })
})

/*
 * Niedersachsen, Sekundarstufe I – aus den KERNCURRICULA, nicht aus den Abiturlisten.
 *
 * Selbst gegengeprüft (23.09.2026): In den Kerncurricula Mathematik Gymnasium Sek I,
 * Deutsch Gymnasium Sek I und Sport Sek I kommt das Wort „Operator" NULL MAL vor. Das ist
 * ein belegter Negativbefund und kein Rechercheloch – die App darf dort still keine
 * Abiturliste ziehen.
 */
describe('Niedersächsische Sek-I-Listen', () => {
  it('nutzt für die Naturwissenschaften das Kerncurriculum, nicht die Abiturliste', () => {
    const p = profilFuer('NI', 'biologie', 'sek1')!
    expect(istBelegt(p)).toBe(true)
    expect(p.quelle).toMatch(/Kerncurriculum Naturwissenschaften/)
    // „verallgemeinern" gibt es nur in der Sek-I-Liste
    expect(definitionFuer('verallgemeinern', p)).toBe('aus einem erkannten Sachverhalt eine erweiterte Aussage formulieren')
    expect(definitionFuer('verallgemeinern', profilFuer('NI', 'biologie', 'sek2'))).toBeNull()
  })

  it('unterscheidet sich in der Bedeutung von der Abiturliste', () => {
    /*
     * „herleiten" ist in der Sek I eng auf Größengleichungen bezogen, im Abitur allgemeiner.
     * Wer die Abiturdefinition in eine Lernzielkontrolle für Klasse 8 schreibt, verlangt
     * etwas anderes, als das Kerncurriculum vorsieht.
     */
    expect(definitionFuer('herleiten', profilFuer('NI', 'biologie', 'sek1'))).toMatch(/Größengleichungen/)
    expect(definitionFuer('herleiten', profilFuer('NI', 'biologie', 'sek2'))).not.toMatch(/Größengleichungen/)
  })

  it('gilt auch für Chemie und Physik – getrennte Listen gibt es in der Sek I nicht', () => {
    for (const fach of ['chemie', 'physik']) {
      const p = profilFuer('NI', fach, 'sek1')!
      expect(istBelegt(p), fach).toBe(true)
      expect(p.quelle, fach).toMatch(/Kerncurriculum Naturwissenschaften/)
    }
  })

  it('führt den einzigen fachgebundenen Operator mit', () => {
    // „eine Reaktionsgleichung aufstellen" ist im Kerncurriculum als „nur Chemie" markiert
    expect(definitionFuer('eine Reaktionsgleichung aufstellen', profilFuer('NI', 'chemie', 'sek1'))).toMatch(/nur Chemie/)
  })

  it('zieht für Mathematik KEINE Abiturliste in die Sek I', () => {
    /*
     * Ein belegter Negativbefund: Für Mathematik gibt es in der niedersächsischen
     * Sekundarstufe I keine Operatorenliste – weder im Kerncurriculum noch als eigene
     * Datei, auch nicht bei den zentralen Abschlussarbeiten. Die App fällt auf den
     * gemeinsamen Bestand zurück und sagt das auch; ein stilles Ziehen der Abiturliste wäre
     * genau der Fehler, der wie ein KI-Problem aussähe.
     */
    const p = profilFuer('NI', 'mathematik', 'sek1')!
    expect(istBelegt(p)).toBe(false)
    expect(p.hinweis).toMatch(/keine amtliche Operatorenliste gefunden/)
  })

  it('nutzt für Deutsch das Kerncurriculum Sek I, nicht die Abiturliste', () => {
    /*
     * Die Liste steht NICHT in der Datenbank „Curriculare Vorgaben", sondern nur auf
     * mk.niedersachsen.de – deshalb war sie in der ersten Recherche nicht aufgetaucht.
     */
    const p = profilFuer('NI', 'deutsch', 'sek1')!
    expect(istBelegt(p)).toBe(true)
    expect(p.quelle).toMatch(/Kerncurriculum Deutsch für den Sekundarbereich I/)
    // Operatoren, die es nur in der Sek-I-Fassung gibt
    for (const op of ['aufzählen', 'erzählen', 'gliedern', 'überarbeiten']) {
      expect(definitionFuer(op, p), op).not.toBeNull()
      expect(definitionFuer(op, profilFuer('NI', 'deutsch', 'sek2')), op).toBeNull()
    }
  })

  it('weist die Anhörfassung als solche aus', () => {
    /*
     * Die einzige gefundene Fassung ist eine ANHÖRFASSUNG vom Oktober 2024; eine Endfassung
     * war nicht auffindbar. Wer sich auf die Liste beruft, soll das wissen.
     */
    const p = profilFuer('NI', 'deutsch', 'sek1')!
    expect(p.stand).toMatch(/ANHÖRFASSUNG/)
    expect(p.hinweis).toMatch(/Eine Endfassung wurde nicht gefunden/)
  })

  it('kennt die abweichenden Anforderungsbereiche zwischen Sek I und Abitur', () => {
    // „erläutern" ist in der Sek-I-Fassung AFB III, im Abitur II/III
    const sek1 = profilFuer('NI', 'deutsch', 'sek1')!
    const sek2 = profilFuer('NI', 'deutsch', 'sek2')!
    expect(sek1.operatoren.find((o) => o.name === 'erläutern')!.afb).toEqual(['III'])
    expect(sek2.operatoren.find((o) => o.name === 'erläutern')!.afb).toEqual(['II', 'III'])
  })

  it('lässt kein Fach ohne Grundlage, auch wenn ein Nachbarfach eine Liste bekommt', () => {
    /*
     * Beim Eintragen der niedersächsischen Naturwissenschaftsliste entfiel zunächst die
     * Rückfallebene für ALLE übrigen Fächer derselben Stufe – Mathematik in Klasse 8 stand
     * plötzlich ohne jede Grundlage da. Die Rückfallebene gilt deshalb ausnahmslos.
     */
    for (const st of STATES) {
      for (const stufe of ['sek1', 'sek2'] as const) {
        for (const fach of ['mathematik', 'deutsch', 'erdkunde', 'musik']) {
          expect(profilFuer(st.id, fach, stufe), `${st.id}/${fach}/${stufe}`).toBeDefined()
        }
      }
    }
  })
})

/*
 * Schulform (Wunsch der Lehrkraft, 23.09.2026).
 *
 * Niedersachsen führt in Geschichte an Haupt-, Real- und Oberschule eine EIGENE Liste –
 * wortgleich in allen drei Kerncurricula, aber erheblich anders als am Gymnasium. Ohne die
 * Schulform im Modell bekäme eine Hauptschulklasse die Gymnasialzuordnung, und der Fehler
 * stünde unsichtbar im Erwartungshorizont.
 */
describe('Profile nach Schulform', () => {
  it('nimmt an Haupt-, Real- und Oberschule die eigene Geschichtsliste', () => {
    for (const form of ['hauptschule', 'realschule', 'oberschule']) {
      const p = profilFuer('NI', 'geschichte', 'sek1', form)!
      expect(istBelegt(p), form).toBe(true)
      expect(p.quelle, form).toMatch(/Hauptschule \/ Realschule \/ Oberschule/)
    }
  })

  it('gibt dem Gymnasium NICHT die Hauptschulliste', () => {
    const p = profilFuer('NI', 'geschichte', 'sek1', 'gymnasium')!
    expect(p.quelle).not.toMatch(/Hauptschule/)
  })

  it('ordnet dort jedem Operator genau einen Anforderungsbereich zu', () => {
    const p = profilFuer('NI', 'geschichte', 'sek1', 'hauptschule')!
    expect(p.afbLogik).toBe('genauEiner')
    for (const o of p.operatoren) expect(o.afb, o.name).toHaveLength(1)
  })

  it('kennt Operatoren, die es sonst nirgends gibt', () => {
    const p = profilFuer('NI', 'geschichte', 'sek1', 'hauptschule')!
    expect(definitionFuer('Informationen entnehmen', p)).toBe('gezielte Fragen an eine Quelle richten und die Ergebnisse benennen')
    expect(definitionFuer('argumentieren', p)).toMatch(/Beweise und Argumente darlegen/)
  })

  it('weicht in den Anforderungsbereichen vom Abitur ab', () => {
    // „vergleichen" ist hier AFB III; im Abitur liegt es bei II–III
    const hs = profilFuer('NI', 'geschichte', 'sek1', 'hauptschule')!
    expect(hs.operatoren.find((o) => o.name === 'vergleichen')!.afb).toEqual(['III'])
    expect(hs.operatoren.find((o) => o.name === 'erläutern')!.afb).toEqual(['II'])
  })

  it('lässt ein Profil ohne Schulformangabe für alle gelten', () => {
    // Die Mathematiklisten sind nicht nach Schulform getrennt
    for (const form of ['gymnasium', 'hauptschule', 'oberschule']) {
      expect(profilFuer('NW', 'mathematik', 'sek2', form)?.stateId, form).toBe('NW')
    }
  })

  it('kommt ohne Angabe der Schulform weiterhin zurecht', () => {
    expect(profilFuer('NI', 'geschichte', 'sek1')).toBeDefined()
  })
})

/*
 * Erdkunde an Haupt-, Real- und Oberschule.
 *
 * Entscheidung der Lehrkraft (23.09.2026): Das Kerncurriculum führt „erläutern" ZWEIMAL –
 * unter AFB II und AFB III – mit wortgleicher Aussage in umgestellter Reihenfolge. Die App
 * gibt beide Bereiche an, statt sich für einen zu entscheiden und damit klüger zu tun als
 * die Quelle.
 */
describe('Erdkunde Sek I, Haupt-/Real-/Oberschule', () => {
  const p = () => profilFuer('NI', 'erdkunde', 'sek1', 'realschule')!

  it('gilt für alle drei Schulformen', () => {
    for (const form of ['hauptschule', 'realschule', 'oberschule']) {
      expect(istBelegt(profilFuer('NI', 'erdkunde', 'sek1', form)), form).toBe(true)
    }
    // Am Gymnasium greift eine ANDERE Liste – nicht diese
    expect(profilFuer('NI', 'erdkunde', 'sek1', 'gymnasium')!.quelle).toMatch(/Gymnasium/)
    expect(profilFuer('NI', 'erdkunde', 'sek1', 'gymnasium')!.quelle).not.toMatch(/Hauptschule/)
  })

  it('führt mehr fachspezifische Operatoren als die Gymnasialliste', () => {
    /*
     * Ein Befund, der die Schulform-Unterscheidung rechtfertigt: „kartieren",
     * „Informationen gewinnen" und der Standort-Operator stehen nur in der Fassung für
     * Haupt-, Real- und Oberschule.
     */
    const gym = profilFuer('NI', 'erdkunde', 'sek1', 'gymnasium')!
    expect(definitionFuer('kartieren', p())).not.toBeNull()
    expect(definitionFuer('kartieren', gym)).toBeNull()
    expect(p().operatoren.length).toBeGreaterThan(gym.operatoren.length)
  })

  it('führt „erläutern" nur EINMAL, dafür mit beiden Anforderungsbereichen', () => {
    const treffer = p().operatoren.filter((o) => o.name === 'erläutern')
    expect(treffer).toHaveLength(1)
    expect(treffer[0].afb).toEqual(['II', 'III'])
    // Übernommen ist die Fassung aus AFB II
    expect(treffer[0].definition).toMatch(/^Sachverhalte in ihren komplexen Beziehungen/)
  })

  it('erklärt die Doppelnennung im Hinweis', () => {
    expect(p().hinweis).toMatch(/DOPPELT/)
    expect(p().hinweis).toMatch(/wortgleicher Aussage/)
  })

  it('gibt die fachspezifischen Operatoren wörtlich wieder', () => {
    expect(definitionFuer('kartieren', p())).toMatch(/thematischen Karten darstellen/)
    expect(definitionFuer('gliedern', p())).toMatch(/systematisierend ordnen/)
  })

  it('ordnet jedem Operator einen Anforderungsbereich zu', () => {
    expect(p().afbLogik).toBe('genauEiner')
    for (const o of p().operatoren) expect(o.afb?.length, o.name).toBeGreaterThan(0)
  })
})

/*
 * Ein Profil für ein Fach, das die App gar nicht anbietet, ist tote Last – es sieht in der
 * Datei nach Abdeckung aus und ist über die Oberfläche nie erreichbar. Beim Eintragen der
 * niedersächsischen Kerncurricula ist mir genau das mit „Werte und Normen" passiert.
 */
describe('Jedes Profil ist erreichbar', () => {
  it('nennt nur Fächer, die es in der App gibt', () => {
    const faecher = SUBJECTS.map((s) => s.id)
    for (const p of LAENDERPROFILE) {
      if (p.fach === 'alle') continue
      expect(faecher, `${p.stateId}/${p.fach}/${p.stufe}`).toContain(p.fach)
    }
  })

  it('nennt nur Schulformen, die es in der App gibt', () => {
    const formen = [
      'gymnasium',
      'hauptschule',
      'realschule',
      'oberschule',
      'integrierte-gesamtschule',
      'gesamtschule',
      'gemeinschaftsschule',
      'stadtteilschule',
      'mittelschule',
      'werkrealschule',
      'sekundarschule',
      'realschule-plus',
      'regionale-schule',
      'regelschule',
      'grundschule',
      'foerderschule-lernen'
    ]
    for (const p of LAENDERPROFILE) {
      for (const f of p.schulformen ?? []) expect(formen, `${p.stateId}/${p.fach}`).toContain(f)
    }
  })
})

/*
 * Werte und Normen und Politik, Sekundarstufe I.
 *
 * „Werte und Normen" war bis September 2026 in der Sammelbezeichnung
 * „Religion / Ethik / Werte und Normen" mitgeführt – damit weder wählbar noch von Religion
 * unterscheidbar. Es hat in Niedersachsen ein eigenes Kerncurriculum mit eigener
 * Operatorenliste.
 */
describe('Werte und Normen als eigenes Fach', () => {
  it('steht in der Fächerliste', () => {
    expect(SUBJECTS.map((s) => s.id)).toContain('werte-und-normen')
    // Und Religion behauptet nicht länger, es mit abzudecken
    expect(SUBJECTS.find((s) => s.id === 'religion')!.label).not.toMatch(/Werte und Normen/)
  })

  it('hat ein eigenes Profil mit eigenen Operatoren', () => {
    const p = profilFuer('NI', 'werte-und-normen', 'sek1')!
    expect(istBelegt(p)).toBe(true)
    // Diese drei gibt es in der Religionsliste nicht
    expect(definitionFuer('einen Argumentationsgang wiedergeben', p)).toBe('einen Argumentationsgang strukturiert zusammenfassen')
    expect(definitionFuer('debattieren', p)).toMatch(/Streitgespräch/)
    expect(definitionFuer('reflektieren', p)).toMatch(/kritischen Distanz/)
  })

  it('führt den zweizeiligen Operatornamen zusammen', () => {
    // Im PDF steht „(in einen Zusammenhang)" in einer Zeile und „einordnen" in der nächsten
    const p = profilFuer('NI', 'werte-und-normen', 'sek1')!
    expect(definitionFuer('einordnen', p)).toBe('einen Sachverhalt mit erläuternden Hinweisen in einen Zusammenhang einfügen')
    expect(definitionFuer('vergleichen', p)).toBe('Gemeinsamkeiten, Ähnlichkeiten und Unterschiede ermitteln')
  })
})

describe('Politik Sek I, Haupt-/Real-/Oberschule', () => {
  const p = () => profilFuer('NI', 'politik', 'sek1', 'realschule')!

  it('arbeitet mit Synonymgruppen', () => {
    const erste = p().operatoren[0]
    expect(erste.name).toBe('aufzählen')
    expect(erste.synonyme).toEqual(['nennen', 'wiedergeben', 'zusammenfassen'])
  })

  it('gibt den fachtypischen Zuschnitt wieder', () => {
    // „analysieren" heißt hier ausdrücklich „am Politikzyklus orientiert"
    expect(definitionFuer('analysieren', p())).toMatch(/Politikzyklus/)
    for (const op of ['widerlegen', 'problematisieren', 'gestalten']) {
      expect(definitionFuer(op, p()), op).not.toBeNull()
    }
  })

  it('stuft „interpretieren" anders ein als Geschichte', () => {
    /*
     * Derselbe Operator, dieselben Schulformen, dasselbe Land – und ein anderer
     * Anforderungsbereich. Genau dafür gibt es die fachweise Trennung.
     */
    const po = p().operatoren.find((o) => o.name === 'interpretieren')!
    const ge = profilFuer('NI', 'geschichte', 'sek1', 'realschule')!.operatoren.find((o) => o.name === 'interpretieren')!
    expect(po.afb).toEqual(['II'])
    expect(ge.afb).toEqual(['III'])
  })

  it('setzt den zweizeiligen Namen zusammen', () => {
    // Im PDF steht „sich auseinander-" / „setzen"
    expect(definitionFuer('sich auseinandersetzen', p())).toMatch(/^Zu einem Sachverhalt/)
  })
})

/*
 * Vollständige Einbindung des neuen Fachs.
 *
 * Ein Fach in der Liste allein genügt nicht: An mehreren Stellen hängen Regeln an einzelnen
 * Fachkennungen. Als „Werte und Normen" noch unter „Religion" mitlief, galten sie dafür
 * über die Religionskennung. Nach der Abspaltung hätte das Fach sie still verloren.
 */
describe('Werte und Normen ist überall eingebunden', () => {
  it('erbt die Regeln, die vorher über „Religion" galten', () => {
    // Tafelbild-Formen, Rollenspiele, Quellenfächer und Videoaufgaben
    expect(SOURCE_SUBJECTS).toContain('werte-und-normen')
    expect(rolePlayTypesFor('werte-und-normen').length).toBeGreaterThan(0)
    expect(boardStructuresFor('werte-und-normen').length).toBeGreaterThan(0)
  })

  it('hat eine eigene Operatorentabelle im Arbeitsblatt', () => {
    const ops = SUBJECT_OPERATORS['werte-und-normen']
    expect(ops).toBeDefined()
    // Genau die Operatoren, die der Religionsliste fehlen
    expect(ops.afb['debattieren']).toBeDefined()
    expect(ops.afb['reflektieren']).toBe('III')
    expect(SUBJECT_OPERATORS['religion'].afb['debattieren']).toBeUndefined()
  })

  it('bekommt den üblichen Schwerpunkt wie die anderen Sachfächer', () => {
    expect(skillFocusOptions('werte-und-normen').map((f) => f.value)).toEqual(['mixed'])
  })
})

/*
 * Fremdsprachen und Kunst, Sekundarstufe I.
 *
 * Die Fremdsprachen-Kerncurricula ordnen ihre Operatoren NICHT nach Anforderungsbereichen,
 * sondern nach kommunikativen Teilkompetenzen. Das ist keine Formalie: „cocher" (ankreuzen)
 * gehört zum Hörverstehen und hat in einer Schreibaufgabe nichts zu suchen.
 */
describe('Fremdsprachen Sek I', () => {
  it('führt die Operatoren in der Zielsprache', () => {
    const fr = profilFuer('NI', 'franzoesisch', 'sek1')!
    expect(istBelegt(fr)).toBe(true)
    expect(definitionFuer('rédiger', fr)).toBe('einen Text nach Vorgaben verfassen')
    expect(definitionFuer('describir', profilFuer('NI', 'spanisch', 'sek1'))).toBe('etwas beschreiben')
  })

  it('ordnet jeden Operator einer Teilkompetenz zu, nicht einem Anforderungsbereich', () => {
    for (const fach of ['franzoesisch', 'spanisch']) {
      const p = profilFuer('NI', fach, 'sek1')!
      expect(p.afbLogik, fach).toBe('keine')
      for (const o of p.operatoren) {
        expect(o.afb, `${fach}/${o.name}`).toBeUndefined()
        expect(o.teilkompetenz, `${fach}/${o.name}`).toBeTruthy()
      }
    }
  })

  it('gibt die Teilkompetenz an die KI weiter', () => {
    const r = operatorRegeln(profilFuer('NI', 'franzoesisch', 'sek1'))
    expect(r).toMatch(/\[Hörverstehen und Leseverstehen\]/)
    expect(r).toMatch(/NUR in einer Aufgabe, die zu seiner Teilkompetenz passt/)
  })

  it('schweigt über Teilkompetenzen, wo es keine gibt', () => {
    expect(operatorRegeln(profilFuer('NW', 'mathematik', 'sek2'))).not.toMatch(/Teilkompetenz/)
  })

  it('verlangt in der Sek I die Du-Anrede', () => {
    expect(profilFuer('NI', 'franzoesisch', 'sek1')!.anrede).toBe('du')
  })
})

describe('Kunst Sek I ohne Anforderungsbereiche', () => {
  it('führt die Operatoren ohne AFB, statt eine Zuordnung zu erfinden', () => {
    /*
     * Das Kerncurriculum sagt, die Operatoren seien Anforderungsbereichen zugeordnet – die
     * Zuordnung selbst steht aber in einer Matrix, die sich nicht auslesen lässt. Lieber
     * keine Angabe als eine geratene.
     */
    const p = profilFuer('NI', 'kunst', 'sek1', 'realschule')!
    expect(istBelegt(p)).toBe(true)
    expect(p.afbLogik).toBe('keine')
    for (const o of p.operatoren) expect(o.afb, o.name).toBeUndefined()
    expect(p.hinweis).toMatch(/statt eine Zuordnung zu erfinden/)
  })

  it('kennt die fachtypischen Operatoren', () => {
    const p = profilFuer('NI', 'kunst', 'sek1', 'realschule')!
    for (const op of ['umsetzen', 'verfremden', 'experimentell erproben', 'visualisieren']) {
      expect(definitionFuer(op, p), op).not.toBeNull()
    }
  })
})
