/**
 * Geplanter Test in Fächern ohne Sprachkurs (02.11.2026, Wunsch der Lehrkraft – Fenster „Test planen" in „Meine Klassen"):
 * Thema, Buchseiten (optional mit Abschnitten der Seiten) und Material der Lerngruppe – ganze Arbeitsblätter/Reihen oder
 * einzelne Aufgaben/Schritte. Gespeichert verschlüsselt (server/testplaene.ts); hier Typen und die Bereinigung.
 */

export interface TestPlanSeite {
  /** Seitenangabe wie im Buch: „34", „34–36", „S. 112 f." */
  seiten: string
  /** Optional: Abschnitte der Seite(n) – „Aufgabe 2 und 3, Merkkasten" */
  abschnitte?: string
}

export interface TestPlanMaterial {
  art: 'blatt' | 'reihe'
  id: string
  titel: string
  /** Gewählte Aufgaben/Schritte; fehlt = das ganze Blatt bzw. die ganze Reihe */
  teile?: { key: string; titel: string }[]
}

export interface TestPlanDaten {
  thema: string
  seiten: TestPlanSeite[]
  material: TestPlanMaterial[]
  /** Freier Zusatz („Taschenrechner erlaubt") */
  notiz?: string
}

export interface TestPlan extends TestPlanDaten {
  id: string
  termin: number | null
  erstellt: number
}

/** Material der Lerngruppe zur Auswahl (Server `materialFuerTestplan`) */
export interface TestPlanMaterialQuelle {
  art: 'blatt' | 'reihe'
  id: string
  titel: string
  zeit: number
  teile: { key: string; titel: string; text: string; gruppe?: string }[]
}

const text = (x: unknown, n: number): string =>
  String(x ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n)

/** Eingaben bereinigen: Längen begrenzen, leere Zeilen weg, höchstens 30 Seitenangaben und 40 Materialien */
export function testPlanBereinigt(roh: unknown): TestPlanDaten {
  const r = (roh ?? {}) as Record<string, unknown>
  const seiten = (Array.isArray(r.seiten) ? r.seiten : [])
    .map((s) => {
      const x = (s ?? {}) as Record<string, unknown>
      const abschnitte = text(x.abschnitte, 300)
      return { seiten: text(x.seiten, 60), ...(abschnitte ? { abschnitte } : {}) }
    })
    .filter((s) => s.seiten || s.abschnitte)
    .slice(0, 30)
  const gesehen = new Set<string>()
  const material = (Array.isArray(r.material) ? r.material : [])
    .flatMap((m): TestPlanMaterial[] => {
      const x = (m ?? {}) as Record<string, unknown>
      const art = x.art === 'reihe' ? 'reihe' : x.art === 'blatt' ? 'blatt' : null
      const id = text(x.id, 80)
      if (!art || !id || gesehen.has(`${art}:${id}`)) return []
      gesehen.add(`${art}:${id}`)
      const teile = Array.isArray(x.teile)
        ? x.teile
            .map((t) => {
              const y = (t ?? {}) as Record<string, unknown>
              return { key: text(y.key, 80), titel: text(y.titel, 160) }
            })
            .filter((t) => t.key)
            .slice(0, 100)
        : undefined
      return [{ art, id, titel: text(x.titel, 200), ...(teile && teile.length ? { teile } : {}) }]
    })
    .slice(0, 40)
  const notiz = text(r.notiz, 500)
  return { thema: text(r.thema, 200), seiten, material, ...(notiz ? { notiz } : {}) }
}

/** Kurzbeschreibung für Listen: „Bruchrechnung · S. 34–36 · 2 Materialien" */
export function testPlanKurz(p: TestPlanDaten): string {
  const s = p.seiten.map((x) => x.seiten.replace(/^(s\.|seiten?)\s*/i, '').trim()).filter(Boolean)
  return [
    p.thema,
    s.length ? `S. ${s.join(', ')}` : '',
    p.material.length ? (p.material.length === 1 ? p.material[0].titel : `${p.material.length} Materialien`) : ''
  ]
    .filter(Boolean)
    .join(' · ')
}
