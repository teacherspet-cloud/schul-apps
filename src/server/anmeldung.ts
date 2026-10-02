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
import { nutzerAendern, nutzerAnlegen, nutzerNachBenutzer, passwortHashVon, protokolliereServer, serverGeheimnis, serverWert, type NutzerInfo } from './datenbank'
import { passwortPruefen } from './geheim'

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

// ---------------------------------------------------------------- OpenID Connect

interface Discovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  end_session_endpoint?: string
}

let discovery: { fuer: string; d: Discovery; zeit: number } | null = null

async function entdecken(aussteller: string, abruf: typeof fetch = fetch): Promise<Discovery> {
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
}

/** Laufende Anmeldungen (state → PKCE) – nur 10 Minuten gültig, nur im Speicher */
const vorgaenge = new Map<string, Vorgang>()

function aufraeumen(): void {
  const grenze = Date.now() - 10 * 60_000
  for (const [k, v] of vorgaenge) if (v.zeit < grenze) vorgaenge.delete(k)
}

/** Weiterleitung zu IServ; `ziel` = Pfad nach der Anmeldung (nur eigene Pfade) */
export async function iservAnmeldeAdresse(rueckruf: string, ziel: string, abruf?: typeof fetch): Promise<{ adresse: string; state: string }> {
  aufraeumen()
  const e = iservEinstellung()
  if (!iservBereit()) throw new Error('Die Anmeldung über IServ ist noch nicht eingerichtet (Verwaltung › IServ-Anbindung).')
  const d = await entdecken(e.aussteller, abruf)
  const state = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(48))
  const nonce = b64url(randomBytes(16))
  vorgaenge.set(state, { verifier, nonce, ziel: /^\/[a-zA-Z0-9/_-]*$/.test(ziel) ? ziel : '/', zeit: Date.now() })
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: e.clientId,
    redirect_uri: rueckruf,
    scope: e.scopes,
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
  const token = await abruf(d.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${encodeURIComponent(e.clientId)}:${encodeURIComponent(geheimnis)}`).toString('base64')}`
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: rueckruf, code_verifier: v.verifier, client_id: e.clientId }),
    signal: AbortSignal.timeout(20_000)
  })
  if (!token.ok) throw new AnmeldeFehler(`IServ hat die Anmeldung nicht bestätigt (${token.status}).`)
  const t = (await token.json()) as { access_token?: string; id_token?: string }
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
  let nutzer = nutzerNachBenutzer(benutzer)
  if (nutzer) {
    // Ein Admin bleibt Admin, auch wenn IServ nur „Lehrer" meldet; gesperrt bleibt gesperrt
    nutzerAendern(nutzer.id, { name, gruppen, rolle: nutzer.rolle === 'admin' ? 'admin' : rolle, quelle: nutzer.quelle === 'test' ? 'test' : 'iserv' })
    nutzer = nutzerNachBenutzer(benutzer)!
  } else nutzer = nutzerAnlegen({ benutzer, name, rolle, quelle: 'iserv', gruppen })
  if (nutzer.gesperrt) throw new AnmeldeFehler('Dieses Konto ist gesperrt. Bitte an die Verwaltung von Schul-Apps wenden.')
  protokolliereServer('anmeldung', `Anmeldung über IServ (${nutzer.rolle})`, nutzer.id)
  return { nutzer, ziel: v.ziel }
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
  const erlaubt = nutzer && !nutzer.gesperrt && (nutzer.quelle === 'test' || (nutzer.quelle === 'notzugang' && notzugangAn()) || (nutzer.rolle === 'admin' && nutzer.hatPasswort && notzugangAn()))
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
