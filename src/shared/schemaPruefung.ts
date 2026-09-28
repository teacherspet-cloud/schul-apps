/**
 * Prüft eine KI-Antwort gegen das JSON-Schema, mit dem sie angefordert wurde (27.09.2026,
 * Großprogramm 0.4, Paket Verlässlichkeit).
 *
 * Die Anbieter sagen strukturierte Antworten zu, halten sie aber nicht immer ein (Abo-Weg über
 * die Kommandozeilenprogramme, ältere Modelle, abgeschnittene Antworten). Bis dahin wurde nur
 * `JSON.parse` gemacht; ein fehlendes Pflichtfeld fiel erst tief in der Verarbeitung auf – als
 * leerer Baustein oder „undefined" auf dem Blatt. Geprüft wird die Teilmenge von JSON Schema,
 * die `shared/aiSchema.ts` erzeugt: type (auch als Liste), properties, required,
 * additionalProperties:false, items, enum, anyOf. Ohne fremde Bibliothek (Projektlinie).
 */
type Schema = Record<string, unknown>

const typVon = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v)

function passtTyp(erwartet: string, v: unknown): boolean {
  const t = typVon(v)
  if (erwartet === 'number') return t === 'number' || t === 'integer'
  return t === erwartet
}

function darfNullSein(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false
  const sch = s as Schema
  if (sch.type === 'null' || (Array.isArray(sch.type) && sch.type.includes('null'))) return true
  if (Array.isArray(sch.enum) && sch.enum.includes(null)) return true
  return Array.isArray(sch.anyOf) && sch.anyOf.some(darfNullSein)
}

/** Kennzeichnet fehlende Listen und Objekte – nur deren Fehlen bricht den Aufbau einer Antwort */
function struktur(s: unknown): string {
  const t = s && typeof s === 'object' ? (s as Schema).type : undefined
  const typen = Array.isArray(t) ? t : [t]
  return typen.includes('array') ? ' (Liste)' : typen.includes('object') ? ' (Objekt)' : ''
}

/** Liste der Abweichungen („pfad: was") – leer, wenn die Antwort passt. Höchstens `max` Einträge. */
export function pruefeSchema(schema: unknown, wert: unknown, pfad = '$', max = 20): string[] {
  const fehler: string[] = []
  const gehe = (s: unknown, v: unknown, p: string): void => {
    if (fehler.length >= max || !s || typeof s !== 'object') return
    const sch = s as Schema
    if (Array.isArray(sch.anyOf)) {
      if (!sch.anyOf.some((alt) => pruefeSchema(alt, v, p, 1).length === 0)) fehler.push(`${p}: passt zu keiner erlaubten Form`)
      return
    }
    if (sch.type !== undefined) {
      const typen = Array.isArray(sch.type) ? (sch.type as string[]) : [sch.type as string]
      if (!typen.some((t) => passtTyp(t, v))) {
        fehler.push(`${p}: erwartet ${typen.join('|')}, erhalten ${typVon(v)}`)
        return
      }
    }
    if (Array.isArray(sch.enum) && !sch.enum.includes(v as never)) {
      fehler.push(`${p}: Wert „${String(v).slice(0, 40)}" nicht erlaubt`)
      return
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>
      const props = (sch.properties ?? {}) as Record<string, unknown>
      /*
       * Ein fehlendes Pflichtfeld, das null sein darf, gilt als null: Strikte Schemata führen jedes
       * Feld als Pflicht, und Antworten über die Kommandozeilenprogramme lassen leere Felder oft
       * weg. Die Verarbeitung behandelt beides gleich – eine Wiederholung dafür kostete nur Kontingent.
       */
      for (const r of (sch.required as string[] | undefined) ?? [])
        if (!(r in obj) && !darfNullSein(props[r])) fehler.push(`${p}.${r}: fehlt${struktur(props[r])}`)
      if (sch.additionalProperties === false) for (const k of Object.keys(obj)) if (!(k in props)) fehler.push(`${p}.${k}: nicht vorgesehen`)
      for (const [k, unter] of Object.entries(props)) if (k in obj) gehe(unter, obj[k], `${p}.${k}`)
    }
    if (Array.isArray(v) && sch.items) v.forEach((x, i) => gehe(sch.items, x, `${p}[${i}]`))
  }
  gehe(schema, wert, pfad)
  return fehler.slice(0, max)
}
