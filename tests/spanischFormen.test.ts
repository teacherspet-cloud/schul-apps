import { describe, expect, it } from 'vitest'
import { spanischBekannt } from '../src/shared/spanischFormen'
import { unbekannteWoerter } from '../src/shared/lehrwerkWortschatz'

/** Spanische Wortformen in der Wortschatzprüfung der Aufgabenbank (20.11.2026, ¡Apúntate! 2 Ausgabe 2016) */
const bekannt = new Set(['hablar', 'comer', 'vivir', 'tener', 'ser', 'ir', 'levantarse', 'bonito', 'joven', 'el', 'chico', 'pensar', 'poder', 'jugar', 'buscar', 'conocer', 'dar', 'rápido', 'lápiz'])
const ja = (w: string): boolean => spanischBekannt(w, bekannt)

describe('Spanische Formen', () => {
  it('regelmäßige Konjugation in allen Zeiten', () => {
    for (const w of ['hablamos', 'habló', 'hablaba', 'hablaré', 'hablaría', 'hable', 'hablando', 'hablado', 'comemos', 'comí', 'comiendo', 'vivieron', 'vivía']) expect(ja(w), w).toBe(true)
  })
  it('Stammwechsel, Schreibänderung, unregelmäßige Verben, Reflexiv', () => {
    for (const w of ['piensa', 'puedo', 'juegan', 'busqué', 'conozco', 'tengo', 'tuvo', 'soy', 'fue', 'voy', 'dio', 'levanto', 'levantó', 'levantarte']) expect(ja(w), w).toBe(true)
  })
  it('Nomen und Adjektive: Plural, Angleichung, Akzentwechsel, -ísimo, -mente', () => {
    for (const w of ['chicos', 'chica', 'bonitas', 'jóvenes', 'lápices', 'rapidísimo', 'rápidamente']) expect(ja(w), w).toBe(true)
  })
  it('Unbekanntes bleibt unbekannt', () => {
    for (const w of ['correr', 'corremos', 'perro', 'escribo']) expect(ja(w), w).toBe(false)
  })
  it('in der Aufgabenprüfung nur bei Spanisch', () => {
    const a = { satz: 'Los chicos hablan con el perro.', loesungen: ['hablan'] } as never
    expect(unbekannteWoerter(a, bekannt, [], undefined, 'es')).toEqual(['con', 'perro'])
  })
})

describe('Akzente in der Aufgabenprüfung', () => {
  it('„¿Cómo estás?“ zerfällt nicht in Teile', () => {
    const b = new Set(['cómo', 'estar', 'años', 'tener'])
    const a = { satz: '¿Cómo estás? Tengo doce años.', loesungen: ['estás'] } as never
    expect(unbekannteWoerter(a, b, [], undefined, 'es')).toEqual(['doce'])
  })
})
