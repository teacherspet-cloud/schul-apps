/**
 * Anmeldung am Server (02.10.2026).
 *
 * 1. IServ (gywem.de) über OpenID Connect – Authorization Code mit PKCE (S256), wie WebUntis.
 *    Das IServ-Passwort gibt die Lehrkraft nur bei IServ ein; der Server sieht es nie und
 *    speichert keine IServ-Zugangsdaten. Er bekommt Name, Benutzername, Rollen und Gruppen.
 *    Voraussetzung: Der IServ-Admin trägt die App unter „System › Single-Sign-On" ein
 *    (server/IServ-Freischaltung.md); Client-ID und Geheimnis stehen danach in der Verwaltung.
 * 2. Testkonten (vom Admin angelegt, löschbar) und der Notzugang des Admins: Benutzername +
 *    Passwort (scrypt). Der Notzugang hilft, solange IServ noch nicht freigeschaltet ist, und
 *    lässt sich in der Verwaltung abschalten.
 *
 * Wer darf hinein (Entscheidung der Lehrkraft):
 *  - Lehrkraft: IServ-Rolle „Lehrer" UND Benutzername im Format der Schule (m.mustermann)
 *  - t.kornahrens: Admin; alle anderen Lehrkräfte bekommen die Rolle „Lehrkraft"
 *  - Schülerinnen und Schüler: IServ-Rolle „Schüler" – nur der Schülerbereich (Onlinetest, Aufgaben)
 */
import { createHash, randomBytes } from 'node:crypto'
import type { Rolle } from './kontext'
import { nutzerAendern, nutzerAnlegen, nutzerNachBenutzer, nutzerNachId, passwortHashVon, protokolliereServer, serverGeheimnis, serverWert, type NutzerInfo } from './datenbank'
import { passwortPruefen } from './geheim'
import { registerVergessen } from './namensschutz'
import { gastFuerIserv, gastSuchen, verknuepfen, vorschlaegeAnlegen } from './kontoVerknuepfung'

export const ADMIN_BENUTZER = 't.kornahrens'

/** Format der Lehrkräfte an der Schule: erster Buchstabe des Vornamens, Punkt, Nachname (ggf. mit Ziffer/Bindestrich) */
export const LEHRKRAFT_MUSTER = /^[a-z]\.[a-z][a-z-]*[0-9]?$/

export interface IservEinstellung {
  /** Adresse des IServ, z. B. https://gywem.de */
  aussteller: string
  clientId: string
  /** Rechte der Schule abfragen: Rollen und Gruppen */
  scopes: string
}

export const ISERV_STANDARD: IservEinstellung = {
  aussteller: 'https://gywem.de',
  clientId: '',
  scopes: 'openid profile email roles groups iserv:roles iserv:groups'
}

export const iservEinstellung = (): IservEinstellung => ({ ...ISERV_STANDARD, ...serverWert<Partial<IservEinstellung>>('iserv', {}) })
export const iservBereit = (): boolean => Boolean(iservEinstellung().clientId && serverGeheimnis('iserv-client'))

// ---------------------------------------------------------------- Rollen aus IServ

/** Werte eines Claims als Liste von Texten (IServ liefert Rollen/Gruppen als Objekte oder Texte) */
export function claimTexte(wert: unknown): string[] {
  if (!wert) return []
  const liste = Array.isArray(wert) ? wert : [wert]
  return liste.flatMap((x) => {
    if (typeof x === 'string') return [x]
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      return [o.id, o.act, o.name, o.displayName, o.display_name, o.uuid].filter((v): v is string => typeof v === 'string')
    }
    return []
  })
}

export function gruppenAus(claims: Record<string, unknown>): { id: string; name: string }[] {
  const roh = [claims['iserv:groups'], claims.groups, claims.groups2].find((g) => Array.isArray(g) && g.length) as unknown[] | undefined
  if (!roh) return []
  const out: { id: string; name: string }[] = []
  for (const g of roh) {
    if (typeof g === 'string') out.push({ id: g, name: g })
    else if (g && typeof g === 'object') {
      const o = g as Record<string, unknown>
      const id = String(o.act ?? o.id ?? o.uuid ?? o.name ?? '')
      if (id) out.push({ id, name: String(o.name ?? o.displayName ?? id) })
    }
  }
  return out.slice(0, 300)
}

/** Rolle aus den Angaben von IServ – null = kein Zugang */
export function rolleAus(benutzer: string, claims: Record<string, unknown>): Rolle | null {
  const rollen = [...claimTexte(claims['iserv:roles']), ...claimTexte(claims.roles)].join(' ')
  const lehrer = /lehr|teacher|ROLE_TEACHER/i.test(rollen)
  const schueler = /sch(ü|ue)ler|student|pupil|ROLE_STUDENT/i.test(rollen)
  if (lehrer && LEHRKRAFT_MUSTER.test(benutzer)) return benutzer === ADMIN_BENUTZER ? 'admin' : 'lehrkraft'
  if (schueler && !lehrer) return 'schueler'
  return null
}

/** UUID des IServ-Kontos aus den Angaben (iserv:uuid bzw. uuid, sonst sub) – leer, wenn keine geliefert wurde */
export function iservKennungAus(claims: Record<string, unknown>): string {
  for (const k of ['iserv:uuid', 'uuid', 'sub']) {
    const v = claims[k]
    if (typeof v === 'string' && v.trim() && v.length <= 200) return v.trim().toLowerCase()
  }
  return ''
}

// ---------------------------------------------------------------- OpenID Connect

export interface Discovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  end_session_endpoint?: string
  /** z. B. ['client_secret_post'] (IServ) oder ['client_secret_basic'] */
  token_endpoint_auth_methods_supported?: string[]
}

let discovery: { fuer: string; d: Discovery; zeit: number } | null = null

/** Discovery-Dokument des IServ (6 Stunden gemerkt) – auch für den Abgleich der Konten (iservAbgleich.ts) */
export async function entdecken(aussteller: string, abruf: typeof fetch = fetch): Promise<Discovery> {
  if (discovery && discovery.fuer === aussteller && Date.now() - discovery.zeit < 6 * 36e5) return discovery.d
  const r = await abruf(`${aussteller.replace(/\/$/, '')}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15_000) })
  if (!r.ok) throw new Error(`IServ antwortet nicht wie erwartet (${r.status}).`)
  const d = (await r.json()) as Discovery
  if (!d.authorization_endpoint?.startsWith('https://') || !d.token_endpoint?.startsWith('https://')) throw new Error('IServ: unsichere Anmeldeadresse.')
  discovery = { fuer: aussteller, d, zeit: Date.now() }
  return d
}

const b64url = (b: Buffer): string => b.toString('base64url')

interface Vorgang {
  verifier: string
  nonce: string
  ziel: string
  zeit: number
  /** Stufe der Berechtigungen (scopeStufen) – für den Rückfall bei „invalid_scope" */
  stufe: number
}

/**
 * Rückfall bei „invalid_scope" (09.10.2026, Befund am VPS): IServ kennt alle Scopes, gibt im Client aber nicht immer
 * alle frei. Dann der Reihe nach weniger anfragen; Rollen erkennt die App notfalls am Benutzernamen (LEHRKRAFT_MUSTER),
 * Klassen über die eingetragenen Lernenden.
 */
export function scopeStufen(eingestellt: string): string[] {
  const stufen = [eingestellt, 'openid profile email iserv:roles iserv:groups', 'openid profile email roles groups', 'openid profile email', 'openid profile']
  const norm = stufen.map((x) => x.trim().replace(/\s+/g, ' '))
  const erlaubt = new Set(norm[0].split(' '))
  // Nur weniger als eingestellt anfragen, nie mehr
  return norm.filter((x, i, a) => x && a.indexOf(x) === i && (i === 0 || x.split(' ').every((t) => erlaubt.has(t))))
}
/** Zuletzt erfolgreiche Stufe – die nächste Anmeldung beginnt gleich dort */
let guteStufe = 0

/** Laufende Anmeldungen (state → PKCE) – nur 10 Minuten gültig, nur im Speicher */
const vorgaenge = new Map<string, Vorgang>()

function aufraeumen(): void {
  const grenze = Date.now() - 10 * 60_000
  for (const [k, v] of vorgaenge) if (v.zeit < grenze) vorgaenge.delete(k)
}

/** Weiterleitung zu IServ; `ziel` = Pfad nach der Anmeldung (nur eigene Pfade) */
export async function iservAnmeldeAdresse(
  rueckruf: string,
  ziel: string,
  abruf?: typeof fetch,
  stufe = guteStufe
): Promise<{ adresse: string; state: string }> {
  aufraeumen()
  const e = iservEinstellung()
  const stufen = scopeStufen(e.scopes)
  const nr = Math.min(Math.max(0, stufe), stufen.length - 1)
  if (!iservBereit()) throw new Error('Die Anmeldung über IServ ist noch nicht eingerichtet (Schule & Daten › IServ-Anbindung).')
  const d = await entdecken(e.aussteller, abruf)
  const state = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(48))
  const nonce = b64url(randomBytes(16))
  vorgaenge.set(state, { verifier, nonce, ziel: /^\/[a-zA-Z0-9/_-]*$/.test(ziel) ? ziel : '/', zeit: Date.now(), stufe: nr })
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: e.clientId,
    redirect_uri: rueckruf,
    scope: stufen[nr],
    state,
    nonce,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256'
  })
  return { adresse: `${d.authorization_endpoint}?${q}`, state }
}

function jwtInhalt(jwt: string): Record<string, unknown> {
  const teil = jwt.split('.')[1]
  if (!teil) return {}
  try {
    return JSON.parse(Buffer.from(teil, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export class AnmeldeFehler extends Error {}

/** „invalid_scope" von IServ: mit weniger Berechtigungen neu anfragen – null, wenn keine Stufe mehr übrig ist */
export async function iservNaechsteStufe(rueckruf: string, state: string, abruf?: typeof fetch): Promise<string | null> {
  const v = vorgaenge.get(state)
  vorgaenge.delete(state)
  if (!v || Date.now() - v.zeit > 10 * 60_000) return null
  const stufen = scopeStufen(iservEinstellung().scopes)
  if (v.stufe + 1 >= stufen.length) return null
  return (await iservAnmeldeAdresse(rueckruf, v.ziel, abruf, v.stufe + 1)).adresse
}

/**
 * Rückkehr von IServ: Code einlösen, Angaben lesen, Nutzer anlegen bzw. aktualisieren.
 * Der Token von IServ wird danach verworfen – gespeichert werden nur Name, Rolle und Gruppen.
 */
export async function iservRueckruf(
  rueckruf: string,
  state: string,
  code: string,
  abruf: typeof fetch = fetch
): Promise<{ nutzer: NutzerInfo; ziel: string }> {
  const v = vorgaenge.get(state)
  vorgaenge.delete(state)
  if (!v || Date.now() - v.zeit > 10 * 60_000) throw new AnmeldeFehler('Die Anmeldung ist abgelaufen. Bitte noch einmal anmelden.')
  const e = iservEinstellung()
  const d = await entdecken(e.aussteller, abruf)
  const geheimnis = serverGeheimnis('iserv-client')
  /*
   * Client-Geheimnis so, wie IServ es annimmt (09.10.2026, Befund „400"): IServ unterstützt laut Discovery nur
   * „client_secret_post" – das Geheimnis gehört dann ins Formular, nicht in den Basic-Kopf. Andere Anbieter: Basic.
   */
  const verfahren = d.token_endpoint_auth_methods_supported ?? []
  const imFormular = verfahren.includes('client_secret_post') && !verfahren.includes('client_secret_basic')
  const formular = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: rueckruf, code_verifier: v.verifier, client_id: e.clientId })
  if (imFormular) formular.set('client_secret', geheimnis)
  const token = await abruf(d.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...(imFormular ? {} : { authorization: `Basic ${Buffer.from(`${encodeURIComponent(e.clientId)}:${encodeURIComponent(geheimnis)}`).toString('base64')}` })
    },
    body: formular,
    signal: AbortSignal.timeout(20_000)
  })
  if (!token.ok) {
    // Fehlercode von IServ mitnennen (z. B. invalid_client, invalid_grant) – enthält keine Geheimnisse
    const f = (await token.json().catch(() => ({}))) as { error?: unknown; error_description?: unknown }
    const grund = [f.error, f.error_description].filter((x): x is string => typeof x === 'string' && x.length < 200).join(': ')
    protokolliereServer('anmeldung', `IServ-Token abgelehnt (${token.status}${grund ? `, ${grund}` : ''})`)
    throw new AnmeldeFehler(`IServ hat die Anmeldung nicht bestätigt (${token.status}${grund ? ` – ${grund}` : ''}).`)
  }
  const t = (await token.json()) as { access_token?: string; id_token?: string; scope?: string }
  if (!t.access_token) throw new AnmeldeFehler('IServ hat keinen Zugang geliefert.')
  const idt = t.id_token ? jwtInhalt(t.id_token) : {}
  if (t.id_token) {
    if (idt.nonce !== v.nonce) throw new AnmeldeFehler('Die Anmeldung passt nicht zu dieser Sitzung.')
    const aud = Array.isArray(idt.aud) ? idt.aud : [idt.aud]
    if (!aud.includes(e.clientId)) throw new AnmeldeFehler('Die Anmeldung gilt nicht für diese App.')
  }
  const info = await abruf(d.userinfo_endpoint, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(20_000) })
  if (!info.ok) throw new AnmeldeFehler(`IServ hat die Angaben nicht geliefert (${info.status}).`)
  const claims = { ...idt, ...((await info.json()) as Record<string, unknown>) }
  // Befund 10.10.2026 (keine Gruppen am Server): gewährte Berechtigungen und vorhandene Angaben mitschreiben – nur
  // Namen der Berechtigungen/Felder und die Zahl der Gruppen, keine Inhalte
  const gruppenZahl = gruppenAus(claims).length
  protokolliereServer(
    'anmeldung',
    `IServ-Angaben: Stufe ${v.stufe + 1}, Berechtigungen „${(t.scope ?? scopeStufen(e.scopes)[v.stufe] ?? '').slice(0, 300)}", Felder ${Object.keys(claims)
      .filter((x) => !['nonce', 'at_hash', 'iat', 'exp', 'auth_time', 'jti'].includes(x))
      .sort()
      .join(' ')
      .slice(0, 400)}, Gruppen ${gruppenZahl}`
  )
  const nutzer = iservAngabenUebernehmen(claims)
  guteStufe = v.stufe
  return { nutzer, ziel: v.ziel }
}

/**
 * Nach der Anmeldung über IServ (10.10.2026): Klassen und Kurse aus den IServ-Gruppen erkennen und die Kurse der Lehrkraft
 * als Lerngruppen anlegen (iservKursgruppen.ts). Von start.ts eingetragen – hier kein Import, sonst ein Ring über
 * onlinetest.ts. Fehler dabei verhindern nie die Anmeldung.
 */
export const anmeldeHaken: { nachIserv?: (n: NutzerInfo, iservGruppen: { id: string; name: string }[]) => void } = {}
const nachIserv = (n: NutzerInfo, gruppen: { id: string; name: string }[]): void => {
  try {
    anmeldeHaken.nachIserv?.(n, gruppen)
  } catch {
    // Erkennung der Kurse ist Zugabe – die Anmeldung gelingt trotzdem
  }
}

/**
 * Die Angaben von IServ übernehmen: Nutzer anlegen bzw. aktualisieren (Rolle, Name, Gruppen), Gastkonten verbinden.
 * Getrennt vom OpenID-Ablauf, damit Browsertests eine IServ-Anmeldung mit nachgebauten Angaben durchspielen können
 * (http.ts `/auth/iserv-test`, nur mit SCHULAPPS_ISERV_TESTANMELDUNG=1).
 */
export function iservAngabenUebernehmen(claims: Record<string, unknown>): NutzerInfo {
  const benutzer = String(claims.preferred_username ?? claims['iserv:account'] ?? claims.username ?? '')
    .trim()
    .toLowerCase()
  if (!benutzer) throw new AnmeldeFehler('IServ hat keinen Benutzernamen geliefert.')
  const rolle = rolleAus(benutzer, claims)
  if (!rolle) {
    protokolliereServer('anmeldung', 'Anmeldung über IServ abgelehnt (keine passende Rolle)')
    throw new AnmeldeFehler('Mit diesem Konto ist keine Anmeldung möglich. Zugang haben Lehrkräfte und – für Onlinetests – Schülerinnen und Schüler.')
  }
  const name = String(claims.name ?? [claims.given_name, claims.family_name].filter(Boolean).join(' ') ?? benutzer).trim() || benutzer
  const gruppen = gruppenAus(claims)
  const kennung = iservKennungAus(claims)
  /*
   * Gastkonto mit Code/QR (09.10.2026, kontoVerknuepfung.ts): Ist diese IServ-Person schon mit einem Gastkonto verbunden,
   * geht es in genau dieses Konto – Name, Gruppen und Code des Gastes bleiben unverändert.
   */
  const gast = rolle === 'schueler' ? gastFuerIserv({ benutzer, sub: kennung }) : null
  if (gast) {
    if (gast.gesperrt) throw new AnmeldeFehler('Dieses Konto ist gesperrt. Bitte an die Verwaltung von Schul-Apps wenden.')
    protokolliereServer('anmeldung', 'Anmeldung über IServ (Gastkonto)', gast.id)
    // Gastkonten behalten ihre Gruppen – in IServ-Kursen werden sie als Mitglied eingetragen (iservKursgruppen.ts)
    nachIserv(gast, gruppen)
    return gast
  }
  let nutzer = nutzerNachBenutzer(benutzer)
  // Erste Anmeldung einer Schülerin/eines Schülers: bisheriges Gastkonto der Klasse eindeutig gefunden → verbinden, ohne Rückfrage
  let vorschlaege: string[] = []
  if (!nutzer && rolle === 'schueler') {
    const z = gastSuchen(claims, benutzer, gruppen)
    if (z.eindeutig && !z.eindeutig.gesperrt) {
      verknuepfen(z.eindeutig.id, { benutzer, sub: kennung })
      protokolliereServer('anmeldung', 'Erste Anmeldung über IServ mit bisherigem Gastkonto verbunden', z.eindeutig.id)
      nachIserv(z.eindeutig, gruppen)
      return z.eindeutig
    }
    vorschlaege = z.vorschlaege.map((n) => n.id)
  }
  if (nutzer) {
    // Ein Admin bleibt Admin, auch wenn IServ nur „Lehrer" meldet; gesperrt bleibt gesperrt
    // Von der Verwaltung zugeordnete Klasse („klasse:…") bleibt erhalten, IServ liefert sie nicht
    const zugeordnet = nutzer.gruppen.filter((g) => g.id.startsWith('klasse:') && !gruppen.some((x) => x.id === g.id))
    nutzerAendern(nutzer.id, { name, gruppen: [...gruppen, ...zugeordnet], rolle: nutzer.rolle === 'admin' ? 'admin' : rolle, quelle: nutzer.quelle === 'test' ? 'test' : 'iserv' })
    nutzer = nutzerNachBenutzer(benutzer)!
  } else {
    nutzer = nutzerAnlegen({ benutzer, name, rolle, quelle: 'iserv', gruppen })
    // Mehrdeutig oder ohne Klassenangabe: die Lehrkraft entscheidet (Meine Klassen › Lernende)
    if (vorschlaege.length) {
      vorschlaegeAnlegen(nutzer.id, vorschlaege)
      protokolliereServer('anmeldung', `Erste Anmeldung über IServ: ${vorschlaege.length} mögliche Gastkonten zum Zusammenführen vorgeschlagen`, nutzer.id)
    }
  }
  // Feste Kennung des IServ-Kontos (09.10.2026) für „Mit IServ abgleichen": übersteht Umbenennungen des Benutzernamens
  if (kennung && nutzer.quelle === 'iserv') nutzerAendern(nutzer.id, { iservSub: kennung })
  // Neue oder geänderte Namen sofort im Namensschutz (namensschutz.ts)
  registerVergessen()
  if (nutzer.gesperrt) throw new AnmeldeFehler('Dieses Konto ist gesperrt. Bitte an die Verwaltung von Schul-Apps wenden.')
  protokolliereServer('anmeldung', `Anmeldung über IServ (${nutzer.rolle})`, nutzer.id)
  nachIserv(nutzer, gruppen)
  return nutzerNachId(nutzer.id) ?? nutzer
}


/** Abmelden bei IServ (optional, nach dem eigenen Abmelden) */
export async function iservAbmeldeAdresse(abruf?: typeof fetch): Promise<string | null> {
  try {
    const d = await entdecken(iservEinstellung().aussteller, abruf)
    return d.end_session_endpoint ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- Passwort (Testkonten, Notzugang)

/** Fehlversuche je Schlüssel (IP bzw. Benutzer): höchstens 10 in 15 Minuten */
const fehlversuche = new Map<string, { n: number; seit: number }>()

export function gesperrtWegenVersuchen(schluessel: string): boolean {
  const f = fehlversuche.get(schluessel)
  if (!f) return false
  if (Date.now() - f.seit > 15 * 60_000) {
    fehlversuche.delete(schluessel)
    return false
  }
  return f.n >= 10
}

export function fehlversuch(schluessel: string): number {
  const f = fehlversuche.get(schluessel)
  const neu = f && Date.now() - f.seit < 15 * 60_000 ? { n: f.n + 1, seit: f.seit } : { n: 1, seit: Date.now() }
  fehlversuche.set(schluessel, neu)
  return neu.n
}

export const notzugangAn = (): boolean => serverWert('notzugang', true)

/** Anmeldung mit Passwort: Testkonten immer, der Notzugang nur, solange er eingeschaltet ist */
export async function passwortAnmeldung(benutzer: string, passwort: string, ip: string): Promise<NutzerInfo> {
  const b = benutzer.trim().toLowerCase()
  if (gesperrtWegenVersuchen(`ip:${ip}`) || gesperrtWegenVersuchen(`b:${b}`)) throw new AnmeldeFehler('Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.')
  const nutzer = nutzerNachBenutzer(b)
  // Testkonten und vom Admin angelegte Konten immer; der Notzugang nur, solange er eingeschaltet ist
  const erlaubt =
    nutzer && !nutzer.gesperrt && (nutzer.quelle === 'test' || nutzer.quelle === 'lokal' || (nutzer.quelle === 'notzugang' && notzugangAn()) || (nutzer.rolle === 'admin' && nutzer.hatPasswort && notzugangAn()))
  const stimmt = erlaubt ? passwortPruefen(passwort, passwortHashVon(b)) : false
  if (!stimmt || !nutzer) {
    const n = Math.max(fehlversuch(`ip:${ip}`), fehlversuch(`b:${b}`))
    await new Promise((r) => setTimeout(r, Math.min(4000, 300 * n)))
    protokolliereServer('anmeldung', 'Anmeldung mit Passwort fehlgeschlagen')
    throw new AnmeldeFehler('Benutzername oder Passwort stimmen nicht.')
  }
  fehlversuche.delete(`b:${b}`)
  protokolliereServer('anmeldung', `Anmeldung mit Passwort (${nutzer.quelle})`, nutzer.id)
  return nutzer
}
