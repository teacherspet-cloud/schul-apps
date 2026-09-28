import { describe, expect, it } from 'vitest'
import { checkSubjectOperator, subjectOperators } from '../src/renderer/src/modules/arbeitsblatt/didactics/subjectOperators'

/*
 * Praxislauf 28.09.2026: Die französische Klassenarbeit bekam „**Write** un e-mail" und
 * „**Describe** les activités" – für alle Fremdsprachen gab es nur die englische Liste.
 */
describe('Operatoren in der Zielsprache', () => {
  it('Französisch, Spanisch und Italienisch haben eigene Listen in der Befehlsform', () => {
    const fr = subjectOperators('franzoesisch', 'fr')!
    expect(fr.zeigen).toContain('décris')
    expect(fr.zeigen).toContain('rédige')
    expect(fr.zeigen).not.toContain('write')
    expect(subjectOperators('spanisch', 'es')!.zeigen).toContain('redacta')
    expect(subjectOperators('italienisch', 'it')!.zeigen).toContain('descrivi')
  })

  it('Englisch bleibt bei der englischen Liste', () => {
    const en = subjectOperators('englisch', 'en')!
    expect(Object.keys(en.afb)).toContain('write')
    expect(en.zeigen).toBeUndefined()
  })

  it('erkennt du- und Höflichkeitsform', () => {
    expect(checkSubjectOperator('**Décris** la photo.', 'franzoesisch', 'fr')?.known).toBe(true)
    expect(checkSubjectOperator('Rédigez un e-mail à Camille.', 'franzoesisch', 'fr')?.known).toBe(true)
    expect(checkSubjectOperator('Describid la imagen.', 'spanisch', 'es')?.known).toBe(true)
    expect(checkSubjectOperator('Scrivi una lettera.', 'italienisch', 'it')?.known).toBe(true)
    expect(checkSubjectOperator('Write un e-mail.', 'franzoesisch', 'fr')?.known).toBe(false)
  })
})
