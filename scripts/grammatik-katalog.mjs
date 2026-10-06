// Grammatikkatalog aus der Recherche vom 06.10.2026 erzeugen (recherche/grammatik-2026-10-06/ergebnis-*.json).
// Abgestimmt mit der Lehrkraft: Thema mit Teilformen, Grundlinie + belegte Abweichungen je Land/Schulform,
// GER erkennen / bilden / sicher getrennt. Ergebnis: src/renderer/src/modules/arbeitsblatt/didactics/grammatikRecherche.json
// (wird von grammarTopics.ts über die Bestandsthemen gelegt). Prüft Länder-/Schulform-Kennungen und meldet Verworfenes.
// Aufruf: node scripts/grammatik-katalog.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ORDNER = 'recherche/grammatik-2026-10-06'
const ZIEL = 'src/renderer/src/modules/arbeitsblatt/didactics/grammatikRecherche.json'
const laender = JSON.parse(readFileSync(join(ORDNER, 'laender-schulformen.json'), 'utf8'))
const LAENDER = new Set(laender.map((l) => l.id))
const SCHULFORMEN = new Set(laender.flatMap((l) => l.schulformen.map((s) => s.id)))
const NIVEAUS = ['Pre-A1', 'A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2']

const meldungen = []
const text = (x, n = 600) => (typeof x === 'string' ? x.trim().slice(0, n) : '')
const zahl = (x) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : undefined)
const liste = (x, n = 6) =>
  Array.isArray(x)
    ? x
        .map((y) => text(y, 240))
        .filter(Boolean)
        .slice(0, n)
    : []
// Niveau-Angabe vereinheitlichen: „A1 →A2" bleibt Text, „a2" → „A2"; null/leer → weg
const stufe = (x) => {
  const t = text(x, 40)
  if (!t) return undefined
  const g = NIVEAUS.find((n) => n.toLowerCase() === t.toLowerCase())
  return g ?? t
}
const nurErkennen = (x) => x.receptive === true || x.rezeptiv === true || x.bilden === null || /^(nur )?(erkennen|rezeptiv)$/i.test(String(x.bilden ?? ''))

function abweichung(a, wo) {
  const l = (Array.isArray(a.laender) ? a.laender : []).map(String)
  const s = (Array.isArray(a.schulformen) ? a.schulformen : []).map(String)
  const lFalsch = l.filter((x) => !LAENDER.has(x))
  const sFalsch = s.filter((x) => !SCHULFORMEN.has(x))
  if (lFalsch.length || sFalsch.length) meldungen.push(`${wo}: unbekannte Kennungen verworfen (${[...lFalsch, ...sFalsch].join(', ')})`)
  const laenderOk = l.filter((x) => LAENDER.has(x))
  const formenOk = s.filter((x) => SCHULFORMEN.has(x))
  const from = zahl(a.from)
  const to = zahl(a.to) ?? from
  // „entfällt": im Plan dieser Schulform nicht genannt; sonst wenigstens eine GER-Stufe (Hamburg: Basisgrammatik ohne Jahrgänge)
  const entfaellt = a.entfaellt === true
  const niveau = stufe(a.bilden) ?? stufe(a.erkennen)
  if (from === undefined && !entfaellt && !niveau) return (meldungen.push(`${wo}: Abweichung ohne Stufe verworfen`), null)
  if (!laenderOk.length && !formenOk.length) return (meldungen.push(`${wo}: Abweichung ohne gültiges Land/Schulform verworfen`), null)
  const f = text(a.folge, 160)
  // Fremdsprachenfolge der Abweichung (grammar.ts LanguageSequence) – nur dann gilt sie
  const folge = /spät|neu einsetzend|neu beginnend|oberstufe|ab (kl\.|jg\.|jgst\.) ?1[01]/i.test(f)
    ? 'spaet'
    : /3\. ?FS|dritte/i.test(f)
      ? 'fs3'
      : /1\. ?FS|erste fremd/i.test(f)
        ? 'fs1'
        : /2\. ?FS|zweite fremd/i.test(f)
          ? 'fs2'
          : undefined
  return {
    laender: laenderOk,
    schulformen: formenOk,
    ...(folge ? { folge } : {}),
    ...(f ? { folgeText: f } : {}),
    ...(entfaellt ? { entfaellt: true } : {}),
    ...(text(a.teilform, 60) ? { teilform: text(a.teilform, 60) } : {}),
    ...(a.fakultativ === true ? { fakultativ: true } : {}),
    ...(a.receptive === true || a.rezeptiv === true ? { nurErkennen: true } : {}),
    ...(from !== undefined && !entfaellt ? { from, to: Math.max(from, to) } : {}),
    ...(niveau && from === undefined && !entfaellt ? { niveau } : {}),
    ...(text(a.quelle, 160) ? { quelle: text(a.quelle, 160) } : {}),
    ...(text(a.hinweis, 300) ? { hinweis: text(a.hinweis, 300) } : {})
  }
}

const katalog = {}
for (const datei of readdirSync(ORDNER).filter((f) => /^ergebnis-.+\.json$/.test(f))) {
  const d = JSON.parse(readFileSync(join(ORDNER, datei), 'utf8'))
  const fach = d.fach || datei.slice(9, -5)
  const ids = new Set()
  const themen = []
  for (const t of d.themen ?? []) {
    const id = text(t.id, 80)
    if (!id || ids.has(id)) {
      meldungen.push(`${fach}: Thema ohne/mit doppelter id verworfen (${id})`)
      continue
    }
    ids.add(id)
    const tf = new Set()
    const teilformen = []
    for (const x of t.teilformen ?? []) {
      const tid = text(x.id, 60)
      if (!tid || tf.has(tid) || !text(x.label, 160)) continue
      tf.add(tid)
      const from = zahl(x.from) ?? zahl(t.from)
      teilformen.push({
        id: tid,
        label: text(x.label, 160),
        ...(text(x.term, 160) && text(x.term, 160) !== text(x.label, 160) ? { term: text(x.term, 160) } : {}),
        from,
        to: Math.max(from ?? 0, zahl(x.to) ?? from ?? 0),
        ...(stufe(x.erkennen) ? { erkennen: stufe(x.erkennen) } : {}),
        ...(!nurErkennen(x) && stufe(x.bilden) ? { bilden: stufe(x.bilden) } : {}),
        ...(stufe(x.sicher) ? { sicher: stufe(x.sicher) } : {}),
        ...(nurErkennen(x) ? { nurErkennen: true } : {}),
        ...(liste(x.beispiele, 3).length ? { beispiele: liste(x.beispiele, 3) } : {}),
        ...(text(x.fehler, 300) ? { fehler: text(x.fehler, 300) } : {}),
        ...(text(x.quelle, 160) ? { quelle: text(x.quelle, 160) } : {})
      })
    }
    const from = zahl(t.from)
    if (from === undefined) {
      meldungen.push(`${fach}/${id}: ohne Stufe verworfen`)
      continue
    }
    themen.push({
      id,
      ...(t.neu ? { neu: true } : {}),
      ...(text(t.label, 160) ? { label: text(t.label, 160) } : {}),
      ...(text(t.term, 160) ? { term: text(t.term, 160) } : {}),
      ...(text(t.area, 80) ? { area: text(t.area, 80) } : {}),
      from,
      to: Math.max(from, zahl(t.to) ?? from),
      ...(stufe(t.erkennen) ? { erkennen: stufe(t.erkennen) } : {}),
      ...(!nurErkennen(t) && stufe(t.bilden) ? { bilden: stufe(t.bilden) } : {}),
      ...(stufe(t.sicher) ? { sicher: stufe(t.sicher) } : {}),
      ...(nurErkennen(t) ? { nurErkennen: true } : {}),
      ...(text(t.quelle, 200) ? { quelle: text(t.quelle, 200) } : {}),
      ...(text(t.beschreibung, 500) ? { beschreibung: text(t.beschreibung, 500) } : {}),
      ...(liste(t.beispiele, 4).length ? { beispiele: liste(t.beispiele, 4) } : {}),
      ...(text(t.fehler, 400) ? { fehler: text(t.fehler, 400) } : {}),
      ...(zahl(t.lateStart) !== undefined ? { lateStart: zahl(t.lateStart) } : {}),
      teilformen,
      abweichungen: (t.abweichungen ?? []).map((a, i) => abweichung(a, `${fach}/${id}#${i}`)).filter(Boolean)
    })
  }
  katalog[fach] = { quellen: (d.quellen ?? []).map((q) => ({ kurz: text(q.kurz, 60), titel: text(q.titel, 200), url: text(q.url, 300) })), themen }
}
writeFileSync(ZIEL, JSON.stringify(katalog) + '\n')
const z = Object.entries(katalog).map(
  ([f, k]) =>
    `${f}: ${k.themen.length} Themen (${k.themen.filter((t) => t.neu).length} neu), ${k.themen.reduce((a, t) => a + t.teilformen.length, 0)} Teilformen, ${k.themen.reduce((a, t) => a + t.abweichungen.length, 0)} Abweichungen`
)
console.log(z.join('\n'))
console.log(`\n${meldungen.length} Meldungen${meldungen.length ? ':\n  ' + meldungen.slice(0, 60).join('\n  ') : ''}`)
