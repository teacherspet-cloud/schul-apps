import { describe, expect, it } from 'vitest'
import { AbbruchFehler, istAbbruch } from '@shared/abbruch'
import { erstelleHintergrundSchutz, MAX_WIEDERHOLUNGEN } from '../src/mobil/hintergrund'

/*
 * API-Modus auf dem iPad (30.09.2026, src/mobil/hintergrund.ts): Während eine KI-Anfrage läuft,
 * bittet die App iOS um Hintergrundzeit; bricht die Anfrage ab, weil die App ausgeblendet war,
 * wird sie nach der Rückkehr wiederholt. Ein echter Fehler im Vordergrund und ein Abbruch der
 * Lehrkraft werden NICHT wiederholt.
 */
function aufbau() {
  const log: string[] = []
  const ereignisse: { kanal: string; wert: unknown }[] = []
  let n = 0
  const schutz = erstelleHintergrundSchutz({
    beginnen: async () => {
      log.push('beginnen')
      return `t${++n}`
    },
    beenden: async (id) => void log.push(`beenden ${id}`),
    emit: (kanal, wert) => ereignisse.push({ kanal, wert })
  })
  return { schutz, log, ereignisse }
}
const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const req = [{ progressId: 'p1', user: 'x' }]

describe('Hintergrundschutz im API-Modus', () => {
  it('fordert Hintergrundzeit an, solange eine Anfrage läuft – einmal für mehrere', async () => {
    const { schutz, log } = aufbau()
    await Promise.all([schutz.schuetze('ai:structured', req, async () => 1), schutz.schuetze('ai:image', ['a', 'b'], async () => 2)])
    await warte(0)
    expect(log).toEqual(['beginnen', 'beenden t1'])
  })

  it('wiederholt eine Anfrage, die im Hintergrund abgebrochen ist, nach der Rückkehr', async () => {
    const { schutz, ereignisse } = aufbau()
    let versuche = 0
    const lauf = schutz.schuetze('ai:structured', req, async () => {
      versuche++
      if (versuche === 1) {
        // Die App wird ausgeblendet, iOS hält die WebView an – die Anfrage reißt ab
        schutz.vordergrund(false)
        throw new TypeError('Load failed')
      }
      return 'Ergebnis'
    })
    await warte(20)
    // Noch im Hintergrund: kein zweiter Versuch
    expect(versuche).toBe(1)
    expect(ereignisse).toEqual([{ kanal: 'ai:verbindung', wert: { id: 'p1', zustand: 'wiederholt' } }])
    schutz.vordergrund(true)
    expect(await lauf).toBe('Ergebnis')
    expect(versuche).toBe(2)
    expect(ereignisse.at(-1)).toEqual({
      kanal: 'ai:verbindung',
      wert: { id: 'p1', zustand: 'verbunden' }
    })
  })

  it('wiederholt keinen Fehler im Vordergrund und keinen Abbruch', async () => {
    const { schutz } = aufbau()
    let versuche = 0
    await expect(
      schutz.schuetze('ai:structured', req, async () => {
        versuche++
        throw new Error('Ungültiger Schlüssel')
      })
    ).rejects.toThrow(/Ungültiger Schlüssel/)
    expect(versuche).toBe(1)
    const abbruch = await schutz
      .schuetze('ai:structured', req, async () => {
        schutz.vordergrund(false)
        throw new AbbruchFehler()
      })
      .catch((e: unknown) => e)
    expect(istAbbruch(abbruch)).toBe(true)
    schutz.vordergrund(true)
  })

  it('gibt nach höchstens zwei Wiederholungen auf', async () => {
    const { schutz } = aufbau()
    let versuche = 0
    const lauf = schutz
      .schuetze('ai:structured', req, async () => {
        versuche++
        schutz.vordergrund(false)
        setTimeout(() => schutz.vordergrund(true), 5)
        throw new TypeError('Load failed')
      })
      .catch((e: unknown) => e)
    expect(String(await lauf)).toMatch(/Load failed/)
    expect(versuche).toBe(MAX_WIEDERHOLUNGEN + 1)
  })
})
