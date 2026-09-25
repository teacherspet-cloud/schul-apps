import { describe, expect, it } from 'vitest'
import { keyProblem, stimmenNutzbarkeit, type StimmenRohdaten } from '../src/main/services/audio/elevenlabs'

describe('ElevenLabs-Schlüssel prüfen, bevor eine Anfrage rausgeht', () => {
  it('erkennt die Kennung des Schlüssels und erklärt den Unterschied', () => {
    /*
     * Der häufigste Einrichtungsfehler: Auf der Schlüsselseite stehen Kennung und Schlüssel
     * untereinander. Die Kennung (64 Hexzeichen) ist gut sichtbar, der Schlüssel selbst wird
     * nur einmal gezeigt. ElevenLabs antwortet darauf mit HTTP 400 – die App fiel dadurch in
     * den allgemeinen Zweig und zeigte rohes JSON.
     */
    const hinweis = keyProblem('3c440da1662f7f8e07fd7e7ace386856eef7495fb3c05006ae4bca6fa2f10ec0')
    expect(hinweis).toMatch(/Kennung des Schlüssels/)
    expect(hinweis).toMatch(/sk_/)
    expect(hinweis).toMatch(/nur einmal/)
  })

  it('lässt einen echten Schlüssel durch', () => {
    expect(keyProblem('sk_1234567890abcdef1234567890abcdef')).toBeNull()
  })

  it('meldet jeden anderen Wert ohne sk_-Anfang', () => {
    expect(keyProblem('mein-schluessel')).toMatch(/beginnt mit/)
  })

  it('schweigt bei leerer Eingabe – dafür gibt es die eigene Meldung „kein Schlüssel hinterlegt"', () => {
    expect(keyProblem('')).toBeNull()
    expect(keyProblem('   ')).toBeNull()
  })

  it('stört sich nicht an Leerzeichen beim Einfügen', () => {
    expect(keyProblem('  sk_1234567890abcdef  ')).toBeNull()
  })
})

/*
 * Die gemeldete Beschwerde: „mir werden weiterhin Bibliotheksstimmen angezeigt, obwohl mein
 * ElevenLabs-Konto keine solchen Stimmen anzeigen lassen sollte."
 *
 * Ursache war nicht diese Regel, sondern die Quelle: Die App fragte /v1/voices ab, und dort
 * gibt es die Felder `sharing`, `is_owner` und `available_for_tiers` gar nicht. Damit war
 * `ausBibliothek` immer falsch – die Prüfung lief ins Leere, ohne je etwas zu sperren.
 * Die Entscheidung steht jetzt als eigene Funktion da, damit sie ohne Konto prüfbar ist.
 */
describe('Welche Stimmen das Konto wirklich benutzen darf', () => {
  const bibliothek = (patch: Partial<StimmenRohdaten> = {}): StimmenRohdaten => ({ sharing: { status: 'enabled' }, is_owner: false, ...patch })

  it('sperrt eine Bibliotheksstimme im kostenlosen Tarif', () => {
    const r = stimmenNutzbarkeit(bibliothek(), 'free')
    expect(r.ausBibliothek).toBe(true)
    expect(r.usable).toBe(false)
    expect(r.unusableReason).toMatch(/kostenlosen Tarif/)
  })

  it('hängt nicht am Wort „free" – auch „free_v2" ist der kostenlose Tarif', () => {
    // Die Tarifbezeichnung ist eine Zeichenkette der Schnittstelle, keine Zusicherung
    expect(stimmenNutzbarkeit(bibliothek(), 'free_v2').usable).toBe(false)
  })

  it('sperrt auch die als „für freie Konten erlaubt" gekennzeichnete Stimme', () => {
    /*
     * Der gemeldete Fall „Ana-Rita3 wird weiterhin angezeigt". Am echten Konto gemessen:
     * Die Stimme trägt `free_users_allowed: true` und liefert trotzdem HTTP 402
     * `paid_plan_required`. Das Feld erlaubt nur das ÜBERNEHMEN in die eigene Liste,
     * nicht das Vertonen. Eine Ausnahme dafür wäre genau die Lücke, durch die sie kam.
     */
    expect(stimmenNutzbarkeit(bibliothek({ sharing: { status: 'copied', free_users_allowed: true } }), 'free').usable).toBe(false)
  })

  it('lässt Bibliotheksstimmen im bezahlten Tarif zu', () => {
    expect(stimmenNutzbarkeit(bibliothek(), 'creator').usable).toBe(true)
  })

  it('rührt eigene und mitgelieferte Stimmen nicht an', () => {
    // Eine eigene Stimme trägt ebenfalls `sharing`, sobald sie einmal geteilt wurde
    expect(stimmenNutzbarkeit({ sharing: { status: 'enabled' }, is_owner: true }, 'free').ausBibliothek).toBe(false)
    expect(stimmenNutzbarkeit({}, 'free').usable).toBe(true)
  })

  it('verbirgt bei unbekanntem Tarif nichts', () => {
    /*
     * Schlägt die Tarifabfrage fehl, wäre es falsch, alles zu verbergen – dann sähe ein
     * zahlendes Konto plötzlich fast keine Stimmen mehr. Die Sperre hängt allein am Tarif.
     */
    expect(stimmenNutzbarkeit(bibliothek(), '').usable).toBe(true)
  })

  it('nennt den Tarif, wenn die Stimme einen anderen voraussetzt', () => {
    const r = stimmenNutzbarkeit(bibliothek({ available_for_tiers: ['creator', 'pro'] }), 'starter')
    expect(r.usable).toBe(false)
    expect(r.unusableReason).toMatch(/creator, pro/)
  })
})
