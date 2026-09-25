import { describe, expect, it } from 'vitest'
import {
  isSensitiveForRolePlay,
  ROLE_PLAY_TYPES,
  rolePlayRules,
  rolePlayTypeById,
  rolePlayTypesFor,
  WITHOUT_ESTABLISHED_PRACTICE
} from '../src/renderer/src/modules/arbeitsblatt/didactics/rolePlay'

const meta = (patch: Record<string, unknown> = {}) => ({
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  topic: 'Der Berliner Kongress 1878',
  socialForms: ['Rollenspiel'],
  grade: 9,
  ...patch
})

describe('Rollenspiel als Methode', () => {
  it('beschreibt jede Form vollständig', () => {
    for (const t of ROLE_PLAY_TYPES) {
      expect(t.label.length, t.id).toBeGreaterThan(5)
      expect(t.purpose.length, t.id).toBeGreaterThan(10)
      expect(t.pitfall.length, t.id).toBeGreaterThan(20)
      expect(t.construction.length, t.id).toBeGreaterThan(40)
      expect(t.roles[0], t.id).toBeGreaterThanOrEqual(2)
      expect(t.roles[1], t.id).toBeGreaterThanOrEqual(t.roles[0])
      // Vorbereitung und Auswertung wiegen zusammen schwerer als das Spiel selbst
      expect(t.minutes.prep + t.minutes.review, t.id).toBeGreaterThan(t.minutes.play)
    }
  })

  it('bietet je Fach die belegten Formen an', () => {
    const geschichte = rolePlayTypesFor('geschichte').map((t) => t.id)
    expect(geschichte).toContain('historiografisch')
    expect(geschichte).toContain('gericht')
    // Erklär-Rollenspiel gehört in die Naturwissenschaften, nicht in Geschichte
    expect(geschichte).not.toContain('erklaeren')
    expect(rolePlayTypesFor('physik').map((t) => t.id)).toContain('erklaeren')
    // Das Streitgespräch passt überall
    expect(rolePlayTypesFor('kunst').map((t) => t.id)).toContain('debatte')
  })

  it('verlangt Rollenkarten mit Grenzen des Verhandelbaren, Entrollung und Reflexion', () => {
    const rules = rolePlayRules(meta({ rolePlayType: 'konferenz' }))
    expect(rules).toContain('Konferenz oder Verhandlung')
    expect(rules).toContain('GRENZEN DES VERHANDELBAREN')
    expect(rules).toContain('ENTROLLUNG')
    expect(rules).toContain('Urteil OHNE Rolle')
    expect(rules).toContain('Beobachtungsbogen'.toUpperCase())
    expect(rules).toContain('Redemittel')
    // Gleich starke Rollen (Kontroversitätsgebot)
    expect(rules).toContain('GLEICH STARK')
    // Planspiel bleibt abgegrenzt
    expect(rules).toContain('Planspiel ist KEIN Rollenspiel')
  })

  it('schweigt, wenn kein Rollenspiel gewählt ist', () => {
    expect(rolePlayRules(meta({ socialForms: ['EA', 'GA'] }))).toBe('')
  })

  it('warnt in Geschichte vor Anachronismen und der „so war es“-Illusion', () => {
    const rules = rolePlayRules(meta())
    expect(rules).toContain('Es könnte ungefähr so gewesen sein')
    expect(rules).toContain('Anachronismen')
    // In Biologie steht davon nichts
    expect(rolePlayRules(meta({ subjectId: 'biologie', subjectLabel: 'Biologie' }))).not.toContain('Anachronismen')
  })

  it('verbietet Opfer- und Täterrollen bei empfindlichen Themen', () => {
    expect(isSensitiveForRolePlay('Der Holocaust in Europa')).toBe(true)
    expect(isSensitiveForRolePlay('Deportation der jüdischen Bevölkerung')).toBe(true)
    expect(isSensitiveForRolePlay('Der Berliner Kongress 1878')).toBe(false)
    const rules = rolePlayRules(meta({ topic: 'Der Holocaust' }))
    expect(rules).toContain('EMPFINDLICHES THEMA')
    expect(rules).toContain('Redaktionssitzung')
    expect(rules).not.toMatch(/Opfer.{0,20}spielen lassen/)
  })

  it('sagt ehrlich, wo es keine belegte Didaktik gibt', () => {
    expect(WITHOUT_ESTABLISHED_PRACTICE).toContain('mathematik')
    const rules = rolePlayRules(meta({ subjectId: 'mathematik', subjectLabel: 'Mathematik', topic: 'Zinsrechnung' }))
    expect(rules).toContain('keine etablierte Rollenspiel-Didaktik')
    expect(rolePlayRules(meta({ subjectId: 'politik', subjectLabel: 'Politik', topic: 'Wahlen' }))).not.toContain('keine etablierte')
  })

  it('überlässt der KI die Wahl, wenn keine Form gesetzt ist', () => {
    const rules = rolePlayRules(meta({ rolePlayType: undefined }))
    expect(rules).toContain('Wähle eine passende')
    expect(rules).toContain('Historiografisches Spiel')
    expect(rolePlayTypeById('gericht')?.label).toContain('Gerichtsverhandlung')
  })
})
