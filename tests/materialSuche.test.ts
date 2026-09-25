import { describe, expect, it } from 'vitest'
import { istVerzeichnis, ohneGutenbergRahmen } from '../src/main/services/sources/materialSuche'

/*
 * Die Suche selbst läuft gegen fremde Archive und wird hier nicht angerufen – Tests, die vom
 * Netz abhängen, schlagen irgendwann aus Gründen fehl, die nichts mit der App zu tun haben.
 * Geprüft werden die beiden Stellen, an denen die App eigene Entscheidungen trifft.
 */

describe('Treffer aussortieren', () => {
  it('wirft Lexikon-Einträge heraus', () => {
    /*
     * Nachgemessen am 24.09.2026: Auf „Heinrich Heine Loreley" standen unter den ersten
     * Treffern „BLKÖ:Vesque von Püttlingen" und „ADB:Mandel, Eduard" – Nachschlagewerke, in
     * denen die Suchwörter zufällig nebeneinanderstehen.
     */
    expect(istVerzeichnis('BLKÖ:Vesque von Püttlingen, Johann Freiherr')).toBe(true)
    expect(istVerzeichnis('ADB:Mandel, Eduard')).toBe(true)
    expect(istVerzeichnis('Boetticher:Jerichau-Baumann, Anna Maria Elisabeth')).toBe(true)
  })

  it('wirft Register und Inhaltsverzeichnisse heraus', () => {
    expect(istVerzeichnis('Simplicissimus/Inhalt 1896–1913')).toBe(true)
    expect(istVerzeichnis('Heinrich Heine/Gedichtanfänge')).toBe(true)
    expect(istVerzeichnis('Die Musik/Inhaltsverzeichnis 1922–1943')).toBe(true)
  })

  it('behält Unterseiten, die richtige Texte sind', () => {
    /*
     * Ein Filter, der alle Unterseiten wegwirft, nähme der Lehrkraft die besten Treffer:
     * Ciceros Reden liegen in Wikisource als „In L. Catilinam orationes/Oratio II". Und sie
     * erführe nicht einmal, dass es sie gab.
     */
    expect(istVerzeichnis('In L. Catilinam orationes/Oratio II')).toBe(false)
    expect(istVerzeichnis('Beschreibung des Oberamts Crailsheim/Kapitel B 25')).toBe(false)
    expect(istVerzeichnis('Die Verwandlung (Franz Kafka)')).toBe(false)
    expect(istVerzeichnis('Aus der Rede des Fürsten Bismarck über die orientalische Frage')).toBe(false)
  })
})

describe('Projekt Gutenberg entrahmen', () => {
  const werk = 'Als Gregor Samsa eines Morgens aus unruhigen Träumen erwachte, fand er sich in seinem Bett zu einem ungeheueren Ungeziefer verwandelt.'
  const datei = [
    'The Project Gutenberg eBook of Die Verwandlung',
    'This eBook is for the use of anyone anywhere in the United States …',
    'Title: Die Verwandlung',
    '*** START OF THE PROJECT GUTENBERG EBOOK DIE VERWANDLUNG ***',
    '',
    'Produced by Jana Srna, Alexander Bauer and the Online Distributed',
    'Proofreading Team at http://www.pgdp.net',
    '',
    werk,
    '',
    '*** END OF THE PROJECT GUTENBERG EBOOK DIE VERWANDLUNG ***',
    'Updated editions will replace the previous one …'
  ].join('\n')

  it('entfernt Vorspann und Nachspann', () => {
    /*
     * Ohne das begänne der „Originaltext" mit den Nutzungsbedingungen – rund 20.000 Zeichen,
     * die jede Wortzählung unbrauchbar machen und auf dem Arbeitsblatt landen würden.
     */
    const text = ohneGutenbergRahmen(datei)
    expect(text).toBe(werk)
    expect(text).not.toContain('Project Gutenberg')
    expect(text).not.toContain('Updated editions')
  })

  it('entfernt die Zeile mit den Abschreibenden', () => {
    // Sie steht HINTER der Startmarke und wäre sonst der erste Satz des Textes
    expect(ohneGutenbergRahmen(datei)).not.toContain('Jana Srna')
  })

  it('lässt einen Text ohne Marken unverändert', () => {
    // Nicht jede Quelle kommt von Gutenberg – hier darf nichts abgeschnitten werden
    expect(ohneGutenbergRahmen(werk)).toBe(werk)
  })
})
