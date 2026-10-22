/**
 * Bremse für das Raten von Codes (23.10.2026, Prüfung des Schulträgers, Punkt 9 „Härtung").
 *
 * Die Code-Abfragen der Lernenden (Arbeitsblatt, Aufgabe, Reihe, Vokabeln, Grammatik, Onlinetest, Spielrunde,
 * persönlicher Anmeldecode, Wiedereinstieg) gehen ohne Anmeldung. Wer viele Codes durchprobiert, findet sonst mit
 * der Zeit fremde Freigaben. Deshalb je Adresse: höchstens CODE_MAX verschiedene UNBEKANNTE Codes in 10 Minuten –
 * danach 10 Minuten lang 429 für alle Code-Abfragen dieser Adresse.
 *
 * Schul-NAT: Oft stehen alle Kinder hinter EINER Adresse. Darum zählen nur Fehlgriffe, und zwar je Code nur einmal:
 * Das Feld „Mit Code öffnen" (SchuelerBereich.tsx › oeffneCode) fragt einen Code nacheinander bei allen Arten ab –
 * ein gültiger Arbeitsblatt-Code ist erst bei „Aufgabe" unbekannt. Findet eine spätere Abfrage den Code, wird er
 * aus der Liste der Fehlgriffe wieder gestrichen. Richtige Codes zählen nie.
 *
 * Fehlgriff = Antwort 404 auf einen der Wege unten, 403 auf „…/wieder" (Name und persönlicher Code passen nicht)
 * sowie die Onlinetest-Abfrage /s/api/zugang mit bekannt:false (onlinetest.ts meldet das über `codeErgebnis`).
 * Bei POST-Wegen ist der Code im Körper – dort zählt jeder Fehlgriff einzeln.
 *
 * Nur im Speicher: Nach einem Neustart beginnt die Zählung neu – für eine Bremse genügt das.
 */
import type { Anfrage } from './http'

export const CODE_FENSTER_MS = 10 * 60_000
export const CODE_SPERRE_MS = 10 * 60_000
/** Verschiedene unbekannte Codes je Adresse und Fenster, ab denen gesperrt wird */
export const CODE_MAX = 30
export const CODE_BREMSE_MELDUNG = 'Von hier wurden gerade sehr viele unbekannte Codes eingegeben. Bitte in 10 Minuten noch einmal versuchen.'

/** GET-Abfragen mit ?code= */
const GET_WEGE = /^\/s\/api\/(?:(?:aufgabe|blatt|reihe|vokabeln|grammatik|spiel)\/)?zugang$/
/** POST-Wege mit dem Code im Körper */
const POST_WEGE = /^\/s\/api\/(?:gast|vokabeln\/anmelden|(?:aufgabe|blatt|reihe|vokabeln|grammatik)\/(?:gast|wieder))$/
/** Onlinetest: antwortet immer 200 (bekannt: true/false) – meldet selbst über codeErgebnis */
const SELBST_GEMELDET = '/s/api/zugang'

interface Stand {
  /** Code (bzw. Kennung eines POST-Fehlgriffs) → Zeitpunkt */
  fehlgriffe: Map<string, number>
  gesperrtBis: number
}

const staende = new Map<string, Stand>()
let zaehler = 0

const schluesselFuer = (ip: string): string => String(ip || '?').replace(/^::ffff:/, '')
const codeForm = (code: string): string => String(code ?? '').trim().toUpperCase().slice(0, 64)

function stand(ip: string, jetzt: number): Stand {
  const s = schluesselFuer(ip)
  let st = staende.get(s)
  if (!st) {
    st = { fehlgriffe: new Map(), gesperrtBis: 0 }
    staende.set(s, st)
    if (staende.size > 5000)
      for (const [k, v] of staende) if (v.gesperrtBis < jetzt && ![...v.fehlgriffe.values()].some((t) => jetzt - t < CODE_FENSTER_MS)) staende.delete(k)
  }
  for (const [c, t] of st.fehlgriffe) if (jetzt - t >= CODE_FENSTER_MS) st.fehlgriffe.delete(c)
  return st
}

/** Ist diese Adresse gerade für Code-Abfragen gesperrt? */
export function codeGesperrt(ip: string, jetzt = Date.now()): boolean {
  const st = staende.get(schluesselFuer(ip))
  return Boolean(st && st.gesperrtBis > jetzt)
}

/** Unbekannten Code zählen; ab CODE_MAX verschiedenen im Fenster beginnt die Sperre */
export function codeFehlgriff(ip: string, code: string, jetzt = Date.now()): void {
  const st = stand(ip, jetzt)
  if (st.gesperrtBis > jetzt) return
  st.fehlgriffe.set(codeForm(code) || `?${++zaehler}`, jetzt)
  if (st.fehlgriffe.size >= CODE_MAX) {
    st.gesperrtBis = jetzt + CODE_SPERRE_MS
    st.fehlgriffe.clear()
  }
}

/** Code wurde gefunden: ein früherer Fehlgriff mit demselben Code (andere Art) zählt nicht mehr */
export function codeGefunden(ip: string, code: string): void {
  const c = codeForm(code)
  if (c) staende.get(schluesselFuer(ip))?.fehlgriffe.delete(c)
}

/** Für Wege, die immer 200 antworten (Onlinetest /s/api/zugang) */
export function codeErgebnis(ip: string, code: string, bekannt: boolean): void {
  if (bekannt) codeGefunden(ip, code)
  else codeFehlgriff(ip, code)
}

/**
 * In http.ts vor allen Routen: gesperrte Adresse → 429 (true = beantwortet). Sonst wird das Ergebnis der Abfrage
 * nach dem Senden ausgewertet (Statuscode).
 */
export function codeBremseAnfrage(k: Pick<Anfrage, 'req' | 'res' | 'url' | 'ip'>): boolean {
  const { req, res, url, ip } = k
  const pfad = url.pathname
  const istGet = req.method === 'GET' && GET_WEGE.test(pfad)
  const istPost = req.method === 'POST' && POST_WEGE.test(pfad)
  if (!istGet && !istPost) return false
  if (codeGesperrt(ip)) {
    res.writeHead(429, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': String(CODE_SPERRE_MS / 1000) })
    res.end(JSON.stringify({ fehler: CODE_BREMSE_MELDUNG }))
    return true
  }
  if (istGet && pfad === SELBST_GEMELDET) return false
  const code = istGet ? String(url.searchParams.get('code') ?? '') : ''
  res.on('finish', () => {
    const fehl = res.statusCode === 404 || (res.statusCode === 403 && pfad.endsWith('/wieder'))
    if (fehl) codeFehlgriff(ip, code)
    else if (istGet && res.statusCode >= 200 && res.statusCode < 300) codeGefunden(ip, code)
  })
  return false
}

/** Für Tests */
export function codeBremseVergessen(): void {
  staende.clear()
}
