import { describe, expect, it } from 'vitest'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { SourceMaterial, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { mitSehtext, mitTranskript, sehtextInhalt, sehverstehenMitVideo, videoInhaltsArt } from '../src/renderer/src/modules/arbeitsblatt/didactics/sehtext'
import { languageSkillRules, videoRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts/sprache'
import { skillFocusPrompt, SKILL_FOCUS } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts/fertigkeiten'

/*
 * Hör-/Sehverstehen (02.10.2026): Ein Video aus dem Material (so, wie urlQuelle.ts es ablegt)
 * wird zum Sehtext – samt Adresse, Laufzeit und Inhalt mit Zeitmarken; ein Hörtext entsteht nicht.
 */

const ZDF_TEXT = [
  'Video: Alpenüberquerung: Knapp 80 Kilometer zu Fuß',
  'Herkunft: ZDF Mediathek',
  'Laufzeit: 15:06 min',
  'Adresse: https://www.zdf.de/reportagen/alpenueberquerung-bis-an-die-grenzen-100',
  'Beschreibung:\nVier Wanderer überqueren die Alpen.',
  'Transkript aus den Untertiteln mit Zeitmarken [m:ss] (de):\n[0:00] Der erste Tag der Alpenüberquerung.\n[0:21] Bis zum ersten Etappenziel sind es noch 1,5 Stunden.'
].join('\n\n')

const quelle = (text: string, kind: SourceMaterial['kind'] = 'video'): SourceMaterial => ({
  id: 'q1',
  fileName: 'Alpenüberquerung',
  kind,
  url: 'https://www.zdf.de/reportagen/alpenueberquerung-bis-an-die-grenzen-100',
  text,
  format: 'plain',
  pageImages: [],
  pageCount: 0,
  pagesRead: [],
  useAsBasis: true,
  embedImage: false
})

const englisch = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta =>
  ({ ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', subjectLabel: 'Englisch', grade: 9, cefrLevel: 'B1', skillFocus: 'listening', ...patch }) as WorksheetMeta

describe('Hör-/Sehverstehen mit Video aus dem Material', () => {
  it('heißt Hör-/Sehverstehen', () => {
    expect(SKILL_FOCUS.find((f) => f.value === 'listening')?.label).toMatch(/Hör-\/Sehverstehen/)
  })

  it('macht aus dem Video die Video-Angabe des Blattes – mit Adresse, Laufzeit und Inhalt mit Zeitmarken', () => {
    const m = mitSehtext(englisch(), [quelle(ZDF_TEXT)])
    expect(m.video).toMatchObject({ title: 'Alpenüberquerung: Knapp 80 Kilometer zu Fuß', url: expect.stringContaining('zdf.de'), minutes: 15, kind: 'dokumentation' })
    expect(m.video?.summary).toMatch(/^\[0:00\] Der erste Tag/)
    expect(sehverstehenMitVideo(m)).toBe(true)
    // Andere Schwerpunkte, abgewählte Quellen oder eigene Angaben der Lehrkraft bleiben unberührt
    expect(mitSehtext(englisch({ skillFocus: 'reading' }), [quelle(ZDF_TEXT)]).video).toBeUndefined()
    expect(mitSehtext(englisch(), [{ ...quelle(ZDF_TEXT), useAsBasis: false }]).video).toBeUndefined()
    expect(mitSehtext(englisch(), [quelle(ZDF_TEXT, 'web')]).video).toBeUndefined()
  })

  it('der Auftrag verlangt Aufgaben zum Video mit Zeitmarken – keinen Hörtext', () => {
    const m = mitSehtext(englisch(), [quelle(ZDF_TEXT)])
    expect(videoRules(m)).toMatch(/Zeitmarken \[m:ss\] \(verbindlich/)
    expect(videoRules(m)).toMatch(/timecode/)
    expect(skillFocusPrompt(m)).toMatch(/KEINEN Baustein "audio"/)
    expect(languageSkillRules(m)).toMatch(/HÖR-\/SEHVERSTEHEN MIT VIDEO/)
    expect(languageSkillRules(englisch())).toMatch(/HÖRVERSTEHEN \(Baustein "audio"/)
  })

  it('„nur die gewählten Formate": keine Vorentlastung, keine weiterführende Aufgabe', () => {
    const m = mitSehtext(englisch({ nurGewaehlteFormate: true }), [quelle(ZDF_TEXT)])
    expect(skillFocusPrompt(m)).not.toMatch(/Vorentlastung \(Wortschatz/)
    expect(skillFocusPrompt(m)).toMatch(/AUSSCHLIESSLICH Aufgaben in den gewählten Formaten/)
    expect(languageSkillRules(m)).toMatch(/KEINE weiterführende Aufgabe/)
  })

  it('Transkript von Hand: ersetzt den Hinweis „kein Transkript" und wird zum Inhalt', () => {
    const ohne = ZDF_TEXT.replace(/\n\nTranskript[\s\S]*$/, '\n\nKein Transkript verfügbar – Das Video hat keine Untertitel.')
    expect(videoInhaltsArt(ohne)).toBe('keine')
    const mit = mitTranskript(ohne, '[0:05] Hallo')
    expect(videoInhaltsArt(mit)).toBe('lehrkraft')
    expect(mit).not.toMatch(/Kein Transkript/)
    expect(sehtextInhalt(mit)).toBe('[0:05] Hallo')
    expect(videoInhaltsArt(ZDF_TEXT)).toBe('untertitel')
  })
})
