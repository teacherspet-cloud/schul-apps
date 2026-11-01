import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { buchstabiert, ohneSchraegstrich, roemischAlsZahl, sprechText, sprechTextFuerWort } from '@shared/sprechtext'
import { abkuerzungAus, abkUeben } from '@shared/abkuerzung'

vi.mock('electron', () => ({ app: { getPath: () => join(tmpdir(), 'nie-benutzt') } }))

/* Spanisch für ElevenLabs (01.11.2026, Durchsicht ¡Apúntate! 1–3 und A tope; recherche/aussprache-spanisch.md) */

const wort = (term: string): string => sprechTextFuerWort({ term }, 'es')

describe('Sprechtext Spanisch', () => {
  it('buchstabiert mit spanischen Buchstabennamen, andere Sprachen wie bisher', () => {
    expect(buchstabiert('GPS', 'es')).toBe('ge pe ese')
    expect(buchstabiert('QR', 'es')).toBe('cu erre')
    expect(buchstabiert('DNI', 'es')).toBe('de ene i')
    expect(buchstabiert('YA', 'en')).toBe('Y. A.')
    expect(sprechText('Tengo el DNI aquí.', 'es')).toBe('Tengo el de ene i aquí.')
    expect(sprechText('Estoy en la ESO.', 'es')).toBe('Estoy en la Eso.')
  })

  it('„algo/a alguien": die Präposition bleibt (vorher „algo alguien")', () => {
    expect(wort('encontrar algo/a alguien [o → ue]')).toBe('encontrar algo … a alguien [o → ue]')
    expect(wort('visitar algo/a alguien')).toBe('visitar algo … a alguien')
    expect(wort('subir el volumen de/a algo')).toBe('subir el volumen de … a algo')
    // Endung nach Schrägstrich wie bisher: nur die Grundform
    expect(ohneSchraegstrich('estar cansado/a')).toBe('estar cansado')
    expect(ohneSchraegstrich('sono stato/a')).toBe('sono stato')
    expect(ohneSchraegstrich('Schüler/-innen')).toBe('Schüler')
  })

  it('Ein-Buchstaben-Wörter mit Schrägstrich als Pause', () => {
    expect(wort('y/e')).toBe('y … e')
    expect(wort('o/u')).toBe('o … u')
    expect(ohneSchraegstrich('was/were')).toBe('was … were')
  })

  it('Endung in Klammern am Wort gehört dazu', () => {
    expect(wort('primer(o)/primera')).toBe('primero … primera')
    expect(wort('comunicar(se) con alguien')).toBe('comunicarse con alguien')
    expect(wort('en bici(cleta)')).toBe('en bicicleta')
    // Frei stehende Klammern bleiben
    expect(wort('(muy) bien')).toBe('(muy) bien')
    // Französisch unberührt
    expect(sprechText('allé(e)', 'fr')).toBe('allé(e)')
  })

  it('Ordnungszahlen, Grad, Jahrhundert, Einheiten', () => {
    expect(sprechText('Estoy en 2° de ESO.', 'es')).toBe('Estoy en segundo de Eso.')
    expect(sprechText('Voy a 1.º de ESO y ella a 3.ª', 'es')).toBe('Voy a primero de Eso y ella a tercera')
    expect(sprechText('Hace 45° a la sombra.', 'es')).toBe('Hace 45 grados a la sombra.')
    expect(sprechText('Hoy hace 19 °C.', 'es')).toBe('Hoy hace 19 grados Celsius.')
    expect(sprechText('Creció mucho en el siglo XX.', 'es')).toBe('Creció mucho en el siglo 20.')
    expect(sprechText('Necesitamos 250 g de mantequilla.', 'es')).toBe('Necesitamos 250 gramos de mantequilla.')
    expect(sprechText('El 90 % usa Internet.', 'es')).toBe('El 90 por ciento usa Internet.')
    expect(sprechText('A partir de las 3 pm tengo deportes.', 'es')).toBe('A partir de las 3 de la tarde tengo deportes.')
    expect(sprechText('casi ocho mil km de costa', 'es')).toBe('casi ocho mil kilómetros de costa')
    expect(sprechText('Soy talla M.', 'es')).toBe('Soy talla eme.')
    expect(roemischAlsZahl('XIV')).toBe(14)
    expect(roemischAlsZahl('ABC')).toBeNull()
  })

  it('Abkürzungen: EE. UU., CDMX, a. C.', () => {
    expect(sprechText('Vivo en los EE. UU. desde 2020.', 'es')).toBe('Vivo en los Estados Unidos desde 2020.')
    expect(sprechText('El tráfico en CDMX es un caos.', 'es')).toBe('El tráfico en Ciudad de México es un caos.')
    expect(sprechText('en el año 200 a. C.', 'es')).toBe('en el año 200 antes de Cristo')
  })

  it('Tabelle ¡Apúntate!/A tope', () => {
    expect(wort('el GPS')).toBe('el ge pe ese')
    expect(wort('el (código) QR')).toBe('el código cu erre')
    expect(wort('2.º de ESO')).toBe('segundo de Eso')
    expect(wort('la inteligencia artificial (IA)')).toBe('la inteligencia artificial, la i a')
    expect(wort('los Estados Unidos (de América), los EE.UU.')).toBe('los Estados Unidos de América, los Estados Unidos')
    expect(wort('el kilómetro (km)')).toBe('el kilómetro')
    expect(abkuerzungAus('el kilómetro (km)')).toMatchObject({ kurz: 'km', lang: 'el kilómetro' })
    expect(abkUeben('el GPS')).toBe('keine')
    expect(abkUeben('antes de Cristo [a. C.]')).toBe('beide')
  })

  it('gewöhnliche Wörter bleiben, wie sie sind (vorhandene Aufnahmen gelten weiter)', () => {
    for (const w of ['el amigo', '¿Cómo te llamas?', 'el cómic, los cómics [pl.]', '(muy) bien', 'Tengo … años.']) expect(wort(w)).toBe(w)
  })
})

describe('Wartung spanisch-ton-2026-11-01', () => {
  it('nur KI-Aufnahmen mit behobener Stelle und neuem Sprechtext', async () => {
    const { spanischTonVeraltet } = await import('../src/server/wartungSpanischTon')
    const t = (text: string, extra: Record<string, unknown> = {}) => ({ datei: 'a.mp3', stimme: 'v', text, zeit: 1, ...extra } as never)
    expect(spanischTonVeraltet(t('visitar algo/a alguien'), 'wort', 'es')).toBe(true)
    expect(spanischTonVeraltet(t('el GPS'), 'wort', 'es')).toBe(true)
    expect(spanischTonVeraltet(t('Necesitamos 250 g de mantequilla.'), 'satz', 'es')).toBe(true)
    // Schon nach den neuen Regeln erzeugt
    expect(spanischTonVeraltet(t('el GPS', { gesprochen: 'el ge pe ese' }), 'wort', 'es')).toBe(false)
    // Eigene Aussprache der Lehrkraft, gewöhnliche Wörter, ohne Stimme, andere Sprache
    expect(spanischTonVeraltet(t('el wifi', { gesprochen: 'el uifi' }), 'wort', 'es')).toBe(false)
    expect(spanischTonVeraltet(t('el amigo/la amiga', { gesprochen: 'el amigo … la amiga' }), 'wort', 'es')).toBe(false)
    expect(spanischTonVeraltet(t('el amigo'), 'wort', 'es')).toBe(false)
    expect(spanischTonVeraltet({ datei: 'a.mp3', text: 'el GPS', zeit: 1 } as never, 'wort', 'es')).toBe(false)
    expect(spanischTonVeraltet(t('the GPS'), 'wort', 'en')).toBe(false)
  })
})
