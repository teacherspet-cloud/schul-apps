/**
 * Test zum Termin (28.10.2026, abgestimmt mit der Lehrkraft): Auf der Startseite („Termine & Vokabeltraining") verknüpft
 * die Lehrkraft einen Vokabeltest-Termin eines Kurses mit einem vorhandenen oder neu erstellten Test – Vokabeltest (Blatt),
 * Onlinetest oder Grammatiktest. Danach öffnet der Termin ihn per Klick. Gespeichert am Kurs (vok_zuweisungen.test_material).
 */

export const TEST_APPS = ['vokabeltest', 'onlinetest', 'grammatiktest'] as const
export type TestApp = (typeof TEST_APPS)[number]

export const TEST_APP_NAME: Record<TestApp, string> = {
  vokabeltest: 'Vokabeltest (Blatt)',
  onlinetest: 'Onlinetest',
  grammatiktest: 'Grammatiktest'
}

export interface TestMaterial {
  moduleId: TestApp
  docId: string
  titel: string
}

/** Aus JSON bzw. einem Anfragekörper; ungültig = null */
export function testMaterialAus(roh: string | null | undefined): TestMaterial | null {
  try {
    const x = roh ? (JSON.parse(roh) as Record<string, unknown> | null) : null
    if (!x || typeof x !== 'object') return null
    const moduleId = String(x.moduleId ?? '') as TestApp
    const docId = String(x.docId ?? '').trim()
    if (!(TEST_APPS as readonly string[]).includes(moduleId) || !docId || docId.length > 120) return null
    return { moduleId, docId, titel: String(x.titel ?? '').trim().slice(0, 200) }
  } catch {
    return null
  }
}

/** Grad der Übereinstimmung eines Tests mit den Abschnitten/Grammatik des Termins (Wörter im Titel/Thema); 0 = keine */
export function passtZuTermin(text: string, stichwoerter: readonly string[]): number {
  const t = text.toLowerCase()
  let n = 0
  for (const s of stichwoerter) {
    const w = s.toLowerCase().trim()
    if (w.length >= 3 && t.includes(w)) n++
  }
  return n
}
