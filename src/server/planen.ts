/**
 * Freischaltungen planen – Übersicht und Hinweise (09.10.2026, abgestimmt mit der Lehrkraft; Regeln in
 * shared/freigabePlan.ts, Speicher in freigabePlan.ts).
 *
 *  Lehrkraft: GET /server/planen?gruppe=<Lerngruppe> – Zeitleiste „Geplant" (Datum, was, Art)
 *             POST /server/planen/verschieben {typ, id, teil?, ab} · /jetzt {typ, id, teil?} · /absagen {typ, id}
 *             (Vokabelabschnitte absagen: über /server/vokabeln/<id>/abschnitt-entfernen – Lernstand bleibt)
 *  Lernende:  GET /s/api/geplant – „Demnächst" (ohne Inhalt) und „Neu freigeschaltet" seit dem letzten Hinweis
 *             POST /s/api/geplant/gesehen
 */
import { protokolliereServer, type NutzerInfo } from './datenbank'
import { json, type Anfrage } from './http'
import { gastInLerngruppe, gehoertZu, lerngruppe } from './onlinetest'
import { vokIstFuer } from './vokabeln'
import { ohneKlasse } from '../shared/ohneKlasse'
import { geplanteTeile, istGeplant, neuFreigeschaltet, PLAN_TYPEN, type PlanEintrag, type PlanTeil, type PlanTyp } from '../shared/freigabePlan'
import {
  gesehenBis,
  gesehenSetzen,
  planDb,
  planLoeschen,
  planSetzen,
  planVon,
  vokAbschnittePlanen,
  vokAbschnittVerschieben,
  vokTeile,
  type PlanZeile
} from './freigabePlan'

const json_ = <T>(s: string | null | undefined, r: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}
/** Abfrage auf eine Tabelle, die es (noch) nicht geben könnte */
const sicher = <T>(fn: () => T, r: T): T => {
  try {
    return fn()
  } catch {
    return r
  }
}

/** Zeile des geplanten Materials (Titel, Fach, Empfänger) */
interface Material {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler: string
  titel: string
  fach: string
  /** Grammatik: verbundener Kurs */
  vok_id?: string
  /** Blatt einer Unterrichtsreihe (erscheint mit der Reihe) */
  reihe?: string
}

const TABELLE: Record<Exclude<PlanTyp, 'vok'>, { tabelle: string; gaeste?: [string, string] }> = {
  blatt: { tabelle: 'blatt_freigaben', gaeste: ['blatt_gaeste', 'freigabe_id'] },
  gram: { tabelle: 'gram_zuweisungen', gaeste: ['gram_gaeste', 'zuweisung_id'] },
  tafel: { tabelle: 'tafel_freigaben' },
  feedback: { tabelle: 'feedback_freigaben', gaeste: ['feedback_gaeste', 'freigabe_id'] },
  reihe: { tabelle: 'reihen_zuweisungen', gaeste: ['reihe_gaeste', 'zuweisung_id'] }
}

/** Material zu einer Planzeile – mit einheitlichem Titel und Fach */
export function materialVon(typ: Exclude<PlanTyp, 'vok'>, id: string): Material | null {
  return sicher(() => {
    const z = planDb().prepare(`SELECT * FROM ${TABELLE[typ].tabelle} WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    if (!z) return null
    let titel = String(z.titel ?? '')
    let fach = String(z.fach ?? '')
    if (typ === 'feedback') fach = json_(String(z.vorlage ?? ''), {} as { meta?: { subjectLabel?: string } }).meta?.subjectLabel ?? ''
    if (typ === 'reihe') {
      const r = planDb().prepare('SELECT titel, daten FROM reihen WHERE id = ?').get(String(z.reihe_id ?? '')) as { titel: string; daten: string } | undefined
      titel = r?.titel ?? 'Unterrichtsreihe'
      fach = json_(r?.daten, {} as { fachLabel?: string }).fachLabel ?? ''
    }
    return {
      id,
      lehrkraft_id: String(z.lehrkraft_id ?? ''),
      lerngruppe_id: String(z.lerngruppe_id ?? ''),
      schueler: String(z.schueler ?? '[]'),
      titel,
      fach,
      ...(typeof z.vok_id === 'string' ? { vok_id: z.vok_id } : {}),
      ...(typeof z.reihe === 'string' && z.reihe ? { reihe: z.reihe } : {}),
      // Schreibaufgabe eines Blattes oder einer Reihe (art 'blatt'/'reihe') – erscheint nur mit diesem
      ...(typ === 'feedback' && typeof z.art === 'string' && z.art ? { reihe: z.art } : {})
    }
  }, null)
}

/** Gehört das Material dieser Person – OHNE Blick auf die Planung (für „Demnächst" und „Neu freigeschaltet") */
export function mitglied(typ: Exclude<PlanTyp, 'vok'>, m: Material, ich: NutzerInfo): boolean {
  if (ich.rolle !== 'schueler') return false
  const g0 = TABELLE[typ].gaeste
  if (g0 && sicher(() => Boolean(planDb().prepare(`SELECT 1 FROM ${g0[0]} WHERE ${g0[1]} = ? AND nutzer_id = ?`).get(m.id, ich.id)), false)) return true
  if (typ === 'tafel' && ich.quelle === 'gast') return false
  if (typ === 'gram' && m.vok_id) {
    const v = sicher(() => planDb().prepare('SELECT id, lerngruppe_id, schueler FROM vok_zuweisungen WHERE id = ?').get(m.vok_id ?? '') as Material | undefined, undefined)
    if (v && vokIstFuer(v, ich)) return true
  }
  if (ich.quelle === 'gast' && !gastInLerngruppe(m.lerngruppe_id, ich)) return false
  const nur = json_(m.schueler, [] as string[])
  if (!m.lerngruppe_id) return nur.includes(ich.benutzer)
  const g = lerngruppe(m.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  return !nur.length || nur.includes(ich.benutzer)
}

interface VokKurs {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler: string
  titel: string
  fach: string
  teile: string
  status: string
}

/** Vokabelkurse mit geplanten Abschnitten (schneller Vorfilter ohne JSON: `"ab"` kommt nur in geplanten Teilen vor) */
function vokKurseMitPlan(filter: { lehrkraftId?: string; lerngruppeId?: string } = {}): (VokKurs & { plan: PlanTeil[] })[] {
  const zeilen = sicher(
    () =>
      planDb()
        .prepare(
          `SELECT id, lehrkraft_id, lerngruppe_id, schueler, titel, fach, teile, status FROM vok_zuweisungen WHERE status = 'offen'${
            filter.lehrkraftId ? ' AND lehrkraft_id = ?' : ''
          }${filter.lerngruppeId ? ' AND lerngruppe_id = ?' : ''}`
        )
        .all(...([filter.lehrkraftId, filter.lerngruppeId].filter(Boolean) as string[])) as unknown as VokKurs[],
    []
  )
  return zeilen.filter((z) => z.teile && z.teile.includes('"ab"')).map((z) => ({ ...z, plan: json_(z.teile, [] as PlanTeil[]) }))
}

/** Alle Planzeilen (ohne Blätter von Unterrichtsreihen – die kommen mit ihrer Reihe) */
function planZeilen(filter: { lehrkraftId?: string; lerngruppeId?: string } = {}): PlanZeile[] {
  return planDb()
    .prepare(`SELECT * FROM freigabe_plan WHERE ab > 0${filter.lehrkraftId ? ' AND lehrkraft_id = ?' : ''}${filter.lerngruppeId ? ' AND lerngruppe_id = ?' : ''}`)
    .all(...([filter.lehrkraftId, filter.lerngruppeId].filter(Boolean) as string[])) as unknown as PlanZeile[]
}

// ---------------------------------------------------------------- Lernende

/**
 * Code-Seite vor dem Zeitpunkt (09.10.2026): wann das Material frei wird und ob die Person schon dazugehört (ohne Blick
 * auf die Planung – so tritt sie nicht doppelt bei und sieht später alles von selbst). Leer, wenn nichts mehr aussteht.
 */
export function zugangPlan(typ: Exclude<PlanTyp, 'vok'>, id: string, n?: NutzerInfo | null): { geplantAb?: number; dabei?: boolean } {
  const p = planVon(typ, id)
  if (!p || !istGeplant(p.ab)) return {}
  const m = n ? materialVon(typ, id) : null
  return { geplantAb: p.ab, dabei: Boolean(n && m && mitglied(typ, m, n)) }
}

/** Was für diese Person geplant ist bzw. frei wurde – Titel und Fach, kein Inhalt */
export function planFuerLernende(ich: NutzerInfo, jetzt = Date.now()): { demnaechst: PlanEintrag[]; neu: PlanEintrag[] } {
  const alle: PlanEintrag[] = []
  // Erster Abruf (09.10.2026): kein Rückstau – Hinweise nur für das, was danach frei wird
  let seit = gesehenBis(ich.id)
  if (seit === null) {
    gesehenSetzen(ich.id, jetzt)
    seit = jetzt
  }
  for (const p of planZeilen()) {
    if (p.typ === 'vok' || !PLAN_TYPEN.includes(p.typ)) continue
    // Nur Kommendes und kürzlich frei Gewordenes
    if (p.ab <= seit) continue
    const m = materialVon(p.typ, p.ziel_id)
    if (!m || m.reihe || !mitglied(p.typ, m, ich)) continue
    alle.push({ typ: p.typ, id: p.ziel_id, titel: ohneKlasse(m.titel), fach: m.fach, ab: p.ab })
  }
  for (const z of vokKurseMitPlan()) {
    if (!vokIstFuer(z, ich)) continue
    z.plan.forEach((t, i) => {
      if (typeof t.ab === 'number' && t.ab > seit) alle.push({ typ: 'vok', id: z.id, teil: i, titel: t.titel, fach: z.fach, ab: t.ab })
    })
  }
  return {
    demnaechst: alle.filter((e) => istGeplant(e.ab, jetzt)).sort((a, b) => a.ab - b.ab),
    neu: neuFreigeschaltet(alle, seit, jetzt)
  }
}

// ---------------------------------------------------------------- Lehrkraft

export interface GeplantEintrag extends PlanEintrag {
  bis: number | null
  lerngruppe: string
}

export function geplantFuerLehrkraft(lehrkraftId: string, lerngruppeId?: string, jetzt = Date.now()): GeplantEintrag[] {
  const aus: GeplantEintrag[] = []
  for (const p of planZeilen({ lehrkraftId, lerngruppeId })) {
    if (p.typ === 'vok' || !istGeplant(p.ab, jetzt)) continue
    const m = materialVon(p.typ, p.ziel_id)
    if (!m) {
      // Material inzwischen gelöscht – Planzeile aufräumen
      planLoeschen(p.typ, p.ziel_id)
      continue
    }
    if (m.reihe) continue
    aus.push({ typ: p.typ, id: p.ziel_id, titel: m.titel, fach: m.fach, ab: p.ab, bis: p.bis, lerngruppe: m.lerngruppe_id })
  }
  for (const z of vokKurseMitPlan({ lehrkraftId, lerngruppeId }))
    for (const t of geplanteTeile(z.plan, jetzt))
      aus.push({ typ: 'vok', id: z.id, teil: t.index, titel: t.titel, fach: z.fach, ab: t.ab, bis: null, lerngruppe: z.lerngruppe_id })
  return aus.sort((a, b) => a.ab - b.ab)
}

/**
 * Unterrichtsreihe geplant: ihre verknüpften Schritte (Arbeitsblätter, Schreibaufgaben, Vokabeln) erscheinen erst mit
 * ihr – sie stehen sonst schon in den Listen der Lernenden.
 */
export function reiheMitPlanen(zid: string, ab: number | null, bis: number | null, lehrkraftId: string, lerngruppeId: string): void {
  const z = sicher(() => planDb().prepare('SELECT verknuepft FROM reihen_zuweisungen WHERE id = ?').get(zid) as { verknuepft: string } | undefined, undefined)
  const ids = new Set(Object.values(json_(z?.verknuepft, {} as Record<string, string>)).filter((x) => x && x !== '*'))
  for (const id of ids) {
    const da = (t: string): boolean => sicher(() => Boolean(planDb().prepare(`SELECT 1 FROM ${t} WHERE id = ? AND lehrkraft_id = ?`).get(id, lehrkraftId)), false)
    if (da('blatt_freigaben')) planSetzen({ typ: 'blatt', id, lehrkraftId, lerngruppeId, ab, bis })
    else if (da('feedback_freigaben')) planSetzen({ typ: 'feedback', id, lehrkraftId, lerngruppeId, ab, bis })
    else if (da('vok_zuweisungen')) {
      if (ab) vokAbschnittePlanen(id, 0, { plan: { ab } })
      else vokTeile(id).forEach((t, i) => t.ab && vokAbschnittVerschieben(id, i, null))
    }
  }
}

/** Geplante Freigabe absagen: das Material ist noch bei niemandem – es wird gelöscht */
function absagen(p: PlanZeile): void {
  const id = p.ziel_id
  const d = planDb()
  if (p.typ === 'blatt') {
    const z = d.prepare('SELECT rueckmeldung_id FROM blatt_freigaben WHERE id = ?').get(id) as { rueckmeldung_id: string } | undefined
    d.prepare('DELETE FROM blatt_freigaben WHERE id = ?').run(id)
    if (z?.rueckmeldung_id) d.prepare("DELETE FROM feedback_freigaben WHERE id = ? AND art != ''").run(z.rueckmeldung_id)
  } else if (p.typ === 'gram') d.prepare('DELETE FROM gram_zuweisungen WHERE id = ?').run(id)
  else if (p.typ === 'tafel') d.prepare('DELETE FROM tafel_freigaben WHERE id = ?').run(id)
  else if (p.typ === 'feedback') d.prepare('DELETE FROM feedback_freigaben WHERE id = ?').run(id)
  else if (p.typ === 'reihe') {
    // Verknüpfte Schritte, die nur für diese Zuweisung entstanden (geplant wie sie), gehen mit
    const z = d.prepare('SELECT verknuepft FROM reihen_zuweisungen WHERE id = ?').get(id) as { verknuepft: string } | undefined
    for (const v of new Set(Object.values(json_(z?.verknuepft, {} as Record<string, string>)))) {
      if (planVon('blatt', v)) (d.prepare('DELETE FROM blatt_freigaben WHERE id = ?').run(v), planLoeschen('blatt', v))
      if (planVon('feedback', v)) (d.prepare('DELETE FROM feedback_freigaben WHERE id = ?').run(v), planLoeschen('feedback', v))
      if (vokTeile(v).some((t) => istGeplant(t.ab))) d.prepare("DELETE FROM vok_zuweisungen WHERE id = ? AND reihe != ''").run(v)
    }
    d.prepare('DELETE FROM reihen_zuweisungen WHERE id = ?').run(id)
  }
  planLoeschen(p.typ, id)
}

export function planenRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/geplant' || url.pathname === '/s/api/geplant/gesehen'
    const lehrer = url.pathname === '/server/planen' || url.pathname.startsWith('/server/planen/')
    if (!schueler && !lehrer) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)

    if (schueler) {
      if (req.method === 'GET') return (json(res, 200, planFuerLernende(ich)), true)
      gesehenSetzen(ich.id)
      return (json(res, 200, { ok: true }), true)
    }

    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    if (req.method === 'GET') {
      const gruppe = String(url.searchParams.get('gruppe') ?? '')
      if (gruppe && lerngruppe(gruppe)?.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannte Lerngruppe.' }), true)
      return (json(res, 200, { eintraege: geplantFuerLehrkraft(ich.id, gruppe || undefined) }), true)
    }
    const k0 = (await k.koerper()) as Record<string, unknown>
    const typ = String(k0.typ ?? '') as PlanTyp
    const id = String(k0.id ?? '')
    const aktion = url.pathname.split('/').filter(Boolean)[2] ?? ''
    if (!PLAN_TYPEN.includes(typ) || !id) return (json(res, 400, { fehler: 'Unbekannte Freigabe.' }), true)
    const jetzt = Date.now()
    const ab = aktion === 'jetzt' ? null : typeof k0.ab === 'number' && Number.isFinite(k0.ab) ? Math.round(k0.ab) : NaN
    if (aktion === 'verschieben' && !(typeof ab === 'number' && ab > jetzt)) return (json(res, 400, { fehler: 'Bitte einen Zeitpunkt in der Zukunft wählen.' }), true)

    if (typ === 'vok') {
      const z = sicher(() => planDb().prepare('SELECT lehrkraft_id FROM vok_zuweisungen WHERE id = ?').get(id) as { lehrkraft_id: string } | undefined, undefined)
      if (!z || z.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      if (aktion !== 'verschieben' && aktion !== 'jetzt') return (json(res, 400, { fehler: 'Vokabelabschnitte werden über „Abschnitt entfernen" abgesagt.' }), true)
      const teil = Math.round(Number(k0.teil))
      const t = vokTeile(id)[teil]
      if (!t || (typeof k0.titel === 'string' && t.titel !== k0.titel)) return (json(res, 404, { fehler: 'Diesen Abschnitt gibt es nicht (mehr).' }), true)
      vokAbschnittVerschieben(id, teil, ab, jetzt)
      protokolliereServer('planen', aktion === 'jetzt' ? 'Geplanten Vokabelabschnitt freigeschaltet' : 'Vokabelabschnitt verschoben', ich.id)
      return (json(res, 200, { ok: true }), true)
    }

    const p = planVon(typ, id)
    if (!p || p.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diese geplante Freigabe gibt es nicht (mehr).' }), true)
    if (aktion === 'absagen') {
      if (!istGeplant(p.ab, jetzt)) return (json(res, 409, { fehler: 'Schon freigeschaltet – bitte dort beenden oder löschen.' }), true)
      absagen(p)
      protokolliereServer('planen', 'Geplante Freigabe abgesagt', ich.id)
      return (json(res, 200, { ok: true }), true)
    }
    if (aktion !== 'verschieben' && aktion !== 'jetzt') return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    // „Jetzt freischalten": Zeitpunkt jetzt – die Zeile bleibt für den Hinweis „Neu freigeschaltet"
    const neuAb = aktion === 'jetzt' ? jetzt : (ab as number)
    planSetzen({ typ, id, lehrkraftId: ich.id, lerngruppeId: p.lerngruppe_id, ab: neuAb, bis: p.bis && p.bis > neuAb ? p.bis : null })
    if (typ === 'reihe') reiheMitPlanen(id, aktion === 'jetzt' ? null : neuAb, p.bis, ich.id, p.lerngruppe_id)
    protokolliereServer('planen', aktion === 'jetzt' ? 'Geplante Freigabe jetzt freigeschaltet' : 'Geplante Freigabe verschoben', ich.id)
    return (json(res, 200, { ok: true }), true)
  }
}
