/**
 * „Mit IServ abgleichen" (09.10.2026, Wunsch des Admins): Konten, die sich über IServ anmelden, aber in IServ nicht mehr
 * existieren (Abgang, gelöschtes Konto), aus Schul-Apps entfernen.
 *
 * Woher die Liste kommt: IDM-API des IServ (`/iserv/idm/api/v1/users`, API Platform: JSON-LD mit `hydra:member` und
 * `hydra:view`/`hydra:next`, Seiten über `?page=`). Zugang mit einem Token aus `client_credentials` (Client-ID und
 * Geheimnis der Single-Sign-On-Anwendung, `client_secret_post` wie bei der Anmeldung) und dem Scope `iserv:idm:api-read`
 * (im Discovery-Dokument von gywem.de aufgeführt). Gibt IServ den Scope für den Client nicht frei, nennt die Meldung,
 * was die IServ-Administration einschalten muss (IServ-Freischaltung.md, Abschnitt 4).
 *
 * Sicherheit (Löschen ist endgültig):
 *  - zwei Schritte: „Prüfen" zeigt nur, wer entfernt würde; „Entfernen" prüft erneut gegen IServ und löscht höchstens,
 *    wer beim Prüfen angezeigt wurde und noch immer fehlt
 *  - Abbruch ohne Löschen bei Fehlern der API, bei 0 Konten aus IServ und wenn mehr als `schwelle` % der IServ-Konten
 *    entfernt würden (Standard 20 %, einstellbar)
 *  - Gastkonten mit IServ-Anmeldung (kontoVerknuepfung.ts): fehlt die Person in IServ, wird nur die Verknüpfung gelöst –
 *    das Konto bleibt, die Anmeldung mit Code/QR geht weiter
 *  - nie entfernt: Admins, das eigene Konto, Konten ohne IServ (Testkonten, Passwort, Notzugang, Gäste) und Vorschaukonten
 *  - vorher eine Sicherung der Datenbank (VACUUM INTO, nur die jüngste bleibt)
 *  - Protokoll nur mit Zahlen, ohne Namen
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, rmSync, statfsSync, statSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { ADMIN_BENUTZER, entdecken, iservBereit, iservEinstellung } from './anmeldung'
import { alleNutzer, datenbank, iservKennungen, nutzerNachId, serverGeheimnis, serverWert, type NutzerInfo } from './datenbank'
import { alleVerknuepfungen } from './kontoVerknuepfung'

/** Scope, den der Client für die Benutzerliste braucht */
export const ABGLEICH_SCOPE = 'iserv:idm:api-read'
export const ABGLEICH_PFAD = '/iserv/idm/api/v1/users'
/** Standard: Abbruch, wenn mehr als 20 % der IServ-Konten entfernt würden */
export const SCHWELLE_STANDARD = 20
export const abgleichSchwelle = (): number => {
  const s = Number(serverWert('iserv-abgleich-schwelle', SCHWELLE_STANDARD))
  return Number.isFinite(s) && s >= 1 && s <= 100 ? Math.round(s) : SCHWELLE_STANDARD
}

export class AbgleichFehler extends Error {}

const SCOPE_HINWEIS =
  `IServ gibt die Benutzerliste für Schul-Apps nicht frei. Die IServ-Administration muss in „Verwaltung › System › Single-Sign-On“ ` +
  `bei der Anwendung „Schul-Apps“ den Scope „${ABGLEICH_SCOPE}“ und den Grant-Typ „Client Credentials“ freischalten (Anleitung: IServ-Freischaltung.md, Abschnitt 4).`

export interface IservKonto {
  uuid: string
  benutzer: string
}

/** Fehlercode einer OAuth-Antwort, ohne Geheimnisse */
async function fehlerCode(r: Response): Promise<string> {
  const f = (await r.json().catch(() => ({}))) as { error?: unknown }
  return typeof f.error === 'string' && f.error.length < 80 ? f.error : ''
}

/** Token der App selbst (ohne Person): client_credentials mit dem Scope für die Benutzerliste */
export async function iservAppToken(abruf: typeof fetch = fetch): Promise<string> {
  if (!iservBereit()) throw new AbgleichFehler('Die IServ-Anbindung ist noch nicht eingerichtet (Client-ID und Geheimnis fehlen).')
  const e = iservEinstellung()
  const d = await entdecken(e.aussteller, abruf)
  const geheimnis = serverGeheimnis('iserv-client')
  const verfahren = d.token_endpoint_auth_methods_supported ?? []
  const imFormular = verfahren.includes('client_secret_post') && !verfahren.includes('client_secret_basic')
  const formular = new URLSearchParams({ grant_type: 'client_credentials', scope: ABGLEICH_SCOPE, client_id: e.clientId })
  if (imFormular) formular.set('client_secret', geheimnis)
  const r = await abruf(d.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...(imFormular ? {} : { authorization: `Basic ${Buffer.from(`${encodeURIComponent(e.clientId)}:${encodeURIComponent(geheimnis)}`).toString('base64')}` })
    },
    body: formular,
    signal: AbortSignal.timeout(20_000)
  })
  if (!r.ok) {
    const code = await fehlerCode(r)
    if (['invalid_scope', 'unauthorized_client', 'unsupported_grant_type', 'access_denied'].includes(code) || r.status === 401 || r.status === 403)
      throw new AbgleichFehler(`${SCOPE_HINWEIS} (IServ: ${r.status}${code ? ` ${code}` : ''})`)
    throw new AbgleichFehler(`IServ hat keinen Zugang für den Abgleich ausgestellt (${r.status}${code ? ` ${code}` : ''}).`)
  }
  const t = (await r.json().catch(() => ({}))) as { access_token?: unknown; scope?: unknown }
  if (typeof t.access_token !== 'string' || !t.access_token) throw new AbgleichFehler('IServ hat keinen Zugang für den Abgleich geliefert.')
  // Erteilte Scopes, falls IServ sie nennt: ohne den Lese-Scope gar nicht erst fragen
  if (typeof t.scope === 'string' && t.scope.trim() && !t.scope.split(/\s+/).includes(ABGLEICH_SCOPE)) throw new AbgleichFehler(SCOPE_HINWEIS)
  return t.access_token
}

/** Einträge einer Seite: JSON-LD (`hydra:member`/`member`) oder eine schlichte Liste */
function eintraegeAus(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  for (const k of ['hydra:member', 'member', 'items', 'data', 'users']) if (Array.isArray(o[k])) return o[k] as unknown[]
  return null
}

/** Verweis auf die nächste Seite: `hydra:view` › `hydra:next`, sonst Link-Kopf rel="next"; null = keine Angabe */
function naechsteAus(body: unknown, r: Response): string | null | undefined {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const o = body as Record<string, unknown>
    const view = (o['hydra:view'] ?? o.view) as Record<string, unknown> | undefined
    if (view && typeof view === 'object') {
      const n = view['hydra:next'] ?? view.next
      return typeof n === 'string' && n ? n : null
    }
  }
  const link = r.headers.get('link') ?? ''
  const m = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(link)
  if (m) return m[1]
  return undefined
}

/** Ein Konto der IDM-API; gelöschte (Papierkorb) zählen als nicht vorhanden */
function kontoAus(x: unknown): IservKonto | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (o.deleted === true) return null
  const uuid = typeof o.uuid === 'string' ? o.uuid.trim().toLowerCase() : ''
  const name = [o.user, o.account, o.username, o.act].find((v): v is string => typeof v === 'string' && v.trim().length > 0)
  const benutzer = name ? name.trim().toLowerCase() : ''
  return uuid || benutzer ? { uuid, benutzer } : null
}

/** Alle Konten des IServ, seitenweise (höchstens 2000 Seiten) */
export async function iservKontenLaden(abruf: typeof fetch = fetch, token?: string): Promise<IservKonto[]> {
  const zugang = token ?? (await iservAppToken(abruf))
  const basis = iservEinstellung().aussteller.replace(/\/$/, '')
  const herkunft = new URL(basis).origin
  const konten: IservKonto[] = []
  const gesehen = new Set<string>()
  let seite = 1
  let adresse = `${basis}${ABGLEICH_PFAD}?page=1`
  for (let n = 0; n < 2000; n++) {
    const r = await abruf(adresse, { headers: { authorization: `Bearer ${zugang}`, accept: 'application/ld+json, application/json' }, signal: AbortSignal.timeout(30_000) })
    if (r.status === 401 || r.status === 403) throw new AbgleichFehler(`${SCOPE_HINWEIS} (IServ: ${r.status})`)
    if (!r.ok) throw new AbgleichFehler(`IServ hat die Benutzerliste nicht geliefert (${r.status}).`)
    const body = (await r.json().catch(() => null)) as unknown
    const eintraege = eintraegeAus(body)
    if (!eintraege) throw new AbgleichFehler('IServ hat die Benutzerliste in unbekannter Form geliefert.')
    let neue = 0
    for (const x of eintraege) {
      const k = kontoAus(x)
      if (!k) continue
      const schluessel = `${k.uuid}|${k.benutzer}`
      if (gesehen.has(schluessel)) continue
      gesehen.add(schluessel)
      konten.push(k)
      neue++
    }
    const weiter = naechsteAus(body, r)
    if (weiter === null) break
    if (typeof weiter === 'string') {
      const ziel = new URL(weiter, basis)
      // Nur beim selben IServ weiterblättern – das Token geht nie an eine fremde Adresse
      if (ziel.origin !== herkunft) throw new AbgleichFehler('IServ verweist für die nächste Seite auf eine fremde Adresse.')
      adresse = ziel.toString()
      continue
    }
    // Keine Angabe zur nächsten Seite: weiterblättern, bis eine Seite leer ist oder nichts Neues mehr bringt
    if (!eintraege.length || !neue) break
    seite++
    adresse = `${basis}${ABGLEICH_PFAD}?page=${seite}`
  }
  return konten
}

export interface AbgleichKandidat {
  id: string
  benutzer: string
  name: string
  rolle: NutzerInfo['rolle']
  zuletzt: string | null
}

export interface AbgleichPlan {
  /** IServ-Konten in Schul-Apps */
  geprueft: number
  /** Konten aus IServ insgesamt */
  iservAnzahl: number
  entfernen: AbgleichKandidat[]
  /** Gastkonten mit IServ-Anmeldung */
  verknuepft: number
  /** Gastkonten, deren IServ-Person fehlt: nur die Verknüpfung wird gelöst, das Konto bleibt */
  loesen: AbgleichKandidat[]
  /** Grund, warum nichts entfernt werden darf */
  abbruch?: string
}

/** Darf dieses Konto beim Abgleich überhaupt entfernt werden? */
export const abgleichGeschuetzt = (n: NutzerInfo, ichId: string): boolean =>
  n.quelle !== 'iserv' || n.rolle === 'admin' || n.id === ichId || n.benutzer === ADMIN_BENUTZER

/**
 * Wer fehlt in IServ? Gefunden ist ein Konto, wenn seine gespeicherte Kennung (UUID/sub) ODER sein Benutzername in IServ
 * vorkommt – im Zweifel bleibt es.
 */
export function abgleichPlanen(
  nutzer: NutzerInfo[],
  kennungen: Map<string, string>,
  iserv: IservKonto[],
  ichId: string,
  schwelle: number,
  verknuepfungen: { nutzerId: string; benutzer: string; sub: string }[] = []
): AbgleichPlan {
  const eigene = nutzer.filter((n) => n.quelle === 'iserv')
  const plan: AbgleichPlan = { geprueft: eigene.length, iservAnzahl: iserv.length, entfernen: [], verknuepft: verknuepfungen.length, loesen: [] }
  if (!iserv.length) return { ...plan, abbruch: 'IServ hat keine Konten geliefert – zur Sicherheit wird nichts entfernt.' }
  const uuids = new Set(iserv.map((k) => k.uuid).filter(Boolean))
  const namen = new Set(iserv.map((k) => k.benutzer).filter(Boolean))
  for (const n of eigene) {
    if (abgleichGeschuetzt(n, ichId)) continue
    const k = kennungen.get(n.id)
    if ((k && uuids.has(k)) || namen.has(n.benutzer.toLowerCase())) continue
    plan.entfernen.push({ id: n.id, benutzer: n.benutzer, name: n.name, rolle: n.rolle, zuletzt: n.zuletzt })
  }
  plan.entfernen.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const nachId = new Map(nutzer.map((n) => [n.id, n]))
  for (const v of verknuepfungen) {
    if ((v.sub && uuids.has(v.sub)) || namen.has(v.benutzer)) continue
    const n = nachId.get(v.nutzerId)
    plan.loesen.push({ id: v.nutzerId, benutzer: v.benutzer, name: n?.name ?? v.benutzer, rolle: n?.rolle ?? 'schueler', zuletzt: n?.zuletzt ?? null })
  }
  const gesamt = eigene.length + verknuepfungen.length
  const betroffen = plan.entfernen.length + plan.loesen.length
  const grenze = (gesamt * schwelle) / 100
  if (betroffen > grenze)
    plan.abbruch = `Es würden ${betroffen} von ${gesamt} IServ-Konten entfernt bzw. gelöst (mehr als ${schwelle} %). Das deutet eher auf einen Fehler der Liste als auf Abgänge hin – zur Sicherheit wird nichts entfernt.`
  return plan
}

/** Prüfen gegen IServ (Schritt 1 und erneut vor dem Entfernen) */
export async function abgleichPruefen(ichId: string, abruf: typeof fetch = fetch, schwelle = abgleichSchwelle()): Promise<AbgleichPlan> {
  const iserv = await iservKontenLaden(abruf)
  return abgleichPlanen(alleNutzer(), iservKennungen(), iserv, ichId, schwelle, alleVerknuepfungen().filter((v) => nutzerNachId(v.nutzerId)?.quelle === 'gast'))
}

// ---------------------------------------------------------------- zwei Schritte

/** Angezeigte Prüfungen (Kennung → Konten), 15 Minuten gültig, nur im Speicher */
const pruefungen = new Map<string, { ich: string; ids: Set<string>; zeit: number }>()

export function pruefungMerken(ich: string, ids: string[]): string {
  const grenze = Date.now() - 15 * 60_000
  for (const [k, v] of pruefungen) if (v.zeit < grenze) pruefungen.delete(k)
  const kennung = randomBytes(12).toString('hex')
  pruefungen.set(kennung, { ich, ids: new Set(ids), zeit: Date.now() })
  return kennung
}

/** Die gemerkte Prüfung einlösen (einmalig) – null, wenn unbekannt, abgelaufen oder von jemand anderem */
export function pruefungEinloesen(kennung: string, ich: string): Set<string> | null {
  const p = pruefungen.get(kennung)
  pruefungen.delete(kennung)
  if (!p || p.ich !== ich || Date.now() - p.zeit > 15 * 60_000) return null
  return p.ids
}

// ---------------------------------------------------------------- Sicherung

const SICHERUNG = /^sicherung-vor-iserv-abgleich-.*\.db$/

/**
 * Sicherung der Datenbank vor dem Entfernen: `<ordner>/sicherung-vor-iserv-abgleich-<datum>.db` (VACUUM INTO). Die
 * personenbezogenen Spalten bleiben darin verschlüsselt. Nur die jüngste Sicherung bleibt liegen.
 */
export function sicherungVorAbgleich(ordner: string, jetzt = new Date()): string {
  const db = join(ordner, 'schulapps.db')
  const groesse = existsSync(db) ? statSync(db).size : 0
  try {
    const s = statfsSync(ordner)
    if (s.bavail * s.bsize < groesse * 1.5 + 50 * 1024 * 1024) throw new AbgleichFehler('Zu wenig Platz auf der Platte für die Sicherung vor dem Abgleich – nichts entfernt.')
  } catch (e) {
    if (e instanceof AbgleichFehler) throw e
    // statfs nicht verfügbar – die Sicherung selbst meldet einen Platzmangel
  }
  const stempel = jetzt.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const datei = join(ordner, `sicherung-vor-iserv-abgleich-${stempel}.db`)
  rmSync(datei, { force: true })
  datenbank().exec(`VACUUM INTO '${datei.replace(/'/g, "''")}'`)
  try {
    chmodSync(datei, 0o600)
  } catch {
    // Windows/Test – egal
  }
  for (const f of readdirSync(ordner)) if (SICHERUNG.test(f) && join(ordner, f) !== datei) rmSync(join(ordner, f), { force: true })
  return datei
}
