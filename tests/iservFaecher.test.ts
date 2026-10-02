import { describe, expect, it } from 'vitest'
import { faecherAusGruppen } from '../src/shared/iservFaecher'

/* Fachschaft aus den IServ-Gruppenordnern (02.10.2026): „Englisch" unter „Gruppen" = Englischlehrkraft */
describe('faecherAusGruppen', () => {
  it('erkennt Fächer, nicht aber Klassen und Kurse', () => {
    const f = faecherAusGruppen(['Englisch', 'Fachschaft Geschichte', 'FS Mathematik', 'Klasse 10b', 'Englisch 10b', 'Lehrer', 'Schulleitung'])
    expect(f).toContain('englisch')
    expect(f).toContain('geschichte')
    expect(f).toContain('mathematik')
    expect(f).toHaveLength(3)
  })
})
