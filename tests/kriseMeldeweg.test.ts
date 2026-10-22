import { randomBytes } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

/*
 * Meldeweg für vertrauliche Hinweise nach § 4 KKG (23.10.2026, Prüfung des Schulträgers – server/krise.ts):
 * Kopien an die Vertrauenspersonen der Schule, kein Wortlaut, Benachrichtigung ohne Inhalt, genau eine Erinnerung nach
 * 24 Stunden ohne „Gesehen", erstes „Gesehen" (wer, wann) für alle Empfänger des Falls.
 */
describe('Krisenhinweise: Meldeweg', async () => {
  const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
  const { datenbankFuerTests, datenbank, nutzerAnlegen } = await import('../src/server/datenbank')
  const k = await import('../src/server/krise')
  const e = await import('../src/server/erinnerungen')

  let lk = ''
  let vera = ''
  let otto = ''
  let kind = ''
  let gesendet: { endpoint: string; text: string }[] = []
  const geraet = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/geraet-${n}`, p256dh: 'x', auth: 'y' })

  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    lk = nutzerAnlegen({ benutzer: 'l.lehrer', name: 'Lars Lehrer', rolle: 'lehrkraft', quelle: 'test' }).id
    vera = nutzerAnlegen({ benutzer: 'v.vertrauen', name: 'Vera Vertrauen', rolle: 'lehrkraft', quelle: 'test' }).id
    otto = nutzerAnlegen({ benutzer: 'o.sozial', name: 'Otto Sozial', rolle: 'lehrkraft', quelle: 'test' }).id
    kind = nutzerAnlegen({ benutzer: 'kim.kind', name: 'Kim Kind', rolle: 'schueler', quelle: 'test' }).id
    // Push nur an angemeldete Geräte: Lehrkraft und Vera ja, Otto nicht
    e.geraetSpeichern(lk, 's1', geraet(1))
    e.geraetSpeichern(vera, 's2', geraet(2))
    e.versand.senden = async (ziel, text) => {
      gesendet.push({ endpoint: ziel.endpoint, text })
      return 201
    }
  })
  beforeEach(() => {
    gesendet = []
  })

  it('Verwaltung: nur Lehrkräfte als Vertrauenspersonen, Meldekette verschlüsselt gespeichert', () => {
    expect(k.krisenEinstellungSetzen({ vertrauen: [kind] })).toEqual({ fehler: 'Vertrauenspersonen können nur Lehrkräfte sein.' })
    const r = k.krisenEinstellungSetzen({ vertrauen: [vera, otto], kette: 'Beratungslehrkraft Frau Vertrauen, Raum 12\r\nNotfall 112' })
    expect(r).toEqual({ vertrauen: [vera, otto], kette: 'Beratungslehrkraft Frau Vertrauen, Raum 12\nNotfall 112' })
    expect(k.meldekette()).toContain('Raum 12')
    const roh = datenbank().prepare('SELECT wert AS w FROM server_einstellungen').all() as { w: string }[]
    expect(JSON.stringify(roh)).not.toContain('Raum 12')
  })

  it('Hinweis geht an Lehrkraft und jede Vertrauensperson – gleicher Inhalt, Push ohne Inhalt', async () => {
    const t = Date.now()
    k.kriseMelden(lk, kind, 'Sprechtraining (Englisch 7b)', t)
    await k.kriseVersandAbwarten()
    const l = k.krisenHinweise(lk).filter((h) => h.zeit === t)
    const v = k.krisenHinweise(vera).filter((h) => h.zeit === t)
    const o = k.krisenHinweise(otto).filter((h) => h.zeit === t)
    expect([l.length, v.length, o.length]).toEqual([1, 1, 1])
    for (const h of [l[0], v[0], o[0]]) {
      expect(h.name).toBe('Kim Kind')
      expect(h.quelle).toBe('Sprechtraining (Englisch 7b)')
    }
    expect(l[0].art).toBe('lehrkraft')
    expect(v[0].art).toBe('vertrauen')
    expect(l[0].weitere.map((w) => w.name).sort()).toEqual(['Otto Sozial', 'Vera Vertrauen'])
    expect(v[0].weitere).toContainEqual({ name: 'Lars Lehrer', art: 'lehrkraft' })
    expect(k.offeneKrisen(vera)).toBeGreaterThanOrEqual(1)
    // Benachrichtigung: an beide angemeldeten Geräte, ohne Namen und Ort
    expect(gesendet.map((g) => g.endpoint).sort()).toEqual([geraet(1).endpoint, geraet(2).endpoint])
    for (const g of gesendet) {
      expect(JSON.parse(g.text).b).toBe(k.PUSH_NEU)
      expect(g.text).not.toMatch(/Kim|Sprechtraining|Englisch/)
    }
    // Sperre: dieselbe Quelle binnen einer Stunde nicht noch einmal (Vergleich nach dem Entschlüsseln)
    k.kriseMelden(lk, kind, 'Sprechtraining (Englisch 7b)', t + 60_000)
    expect(k.krisenHinweise(vera).filter((h) => h.quelle === 'Sprechtraining (Englisch 7b)')).toHaveLength(1)
  })

  it('kein Wortlaut: nur Kennungen, verschlüsselte Ortsangabe und Zeiten', () => {
    const roh = datenbank().prepare('SELECT quelle AS q FROM krisen_hinweise').all() as { q: string }[]
    expect(roh.length).toBeGreaterThan(0)
    for (const z of roh) expect(z.q.startsWith('v1:')).toBe(true)
    const spalten = (datenbank().prepare('PRAGMA table_info(krisen_hinweise)').all() as { name: string }[]).map((s) => s.name).sort()
    expect(spalten).toEqual(['art', 'erinnert', 'erst_gesehen', 'erst_gesehen_von', 'fall', 'gesehen', 'id', 'lehrkraft_id', 'quelle', 'schueler_id', 'zeit'])
  })

  it('Erinnerung genau einmal nach 24 Stunden, wenn niemand „Gesehen" gewählt hat', async () => {
    const t = Date.now() - 2 * k.ERINNERN_NACH
    k.kriseMelden(lk, kind, 'Lerntagebuch: Reihe A', t)
    await k.kriseVersandAbwarten()
    gesendet = []
    expect(await k.krisenErinnern(t + k.ERINNERN_NACH - 60_000)).toBe(0)
    expect(gesendet).toHaveLength(0)
    expect(await k.krisenErinnern(t + k.ERINNERN_NACH + 1)).toBe(1)
    expect(gesendet).toHaveLength(2)
    for (const g of gesendet) expect(JSON.parse(g.text).b).toBe(k.PUSH_ERINNERUNG)
    gesendet = []
    expect(await k.krisenErinnern(t + 1.5 * k.ERINNERN_NACH)).toBe(0)
    expect(gesendet).toHaveLength(0)
    expect(k.krisenHinweise(lk).find((h) => h.quelle === 'Lerntagebuch: Reihe A')?.erinnert).toBe(t + k.ERINNERN_NACH + 1)
  })

  it('erstes „Gesehen" sehen alle Zuständigen; danach keine Erinnerung', async () => {
    const t = Date.now() - 2 * k.ERINNERN_NACH
    k.kriseMelden(lk, kind, 'Rückmeldebogen: Woche 3', t)
    const eigene = k.krisenHinweise(vera).find((h) => h.quelle === 'Rückmeldebogen: Woche 3')!
    expect(k.kriseGesehen(lk, eigene.id)).toBe(false) // fremde Zeile
    expect(k.kriseGesehen(vera, eigene.id, t + 3600_000)).toBe(true)
    const beiLk = k.krisenHinweise(lk).find((h) => h.quelle === 'Rückmeldebogen: Woche 3')!
    expect(beiLk.gesehen).toBeUndefined()
    expect(beiLk.erstGesehen).toEqual({ name: 'Vera Vertrauen', zeit: t + 3600_000, selbst: false })
    expect(k.krisenHinweise(vera).find((h) => h.id === eigene.id)?.erstGesehen?.selbst).toBe(true)
    // Später sieht auch die Lehrkraft – das erste Sehen bleibt Vera
    k.kriseGesehen(lk, beiLk.id, t + 7200_000)
    expect(k.krisenHinweise(otto).find((h) => h.quelle === 'Rückmeldebogen: Woche 3')?.erstGesehen?.name).toBe('Vera Vertrauen')
    await k.kriseVersandAbwarten()
    gesendet = []
    await k.krisenErinnern(t + k.ERINNERN_NACH + 1)
    expect(gesendet).toHaveLength(0)
  })

  it('Aufbewahrung 30 Tage gilt auch für die Kopien der Vertrauenspersonen', () => {
    const alt = Date.now() - 31 * 24 * 3600_000
    datenbank()
      .prepare("INSERT INTO krisen_hinweise (id, lehrkraft_id, schueler_id, quelle, zeit, fall, art) VALUES ('alt1', ?, ?, 'x', ?, 'f-alt', 'vertrauen')")
      .run(vera, kind, alt)
    expect(k.krisenHinweise(vera).some((h) => h.id === 'alt1')).toBe(false)
  })
})
