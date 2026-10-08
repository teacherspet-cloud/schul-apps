/**
 * „Als Schüler ansehen" – Musterschüler-Vorschau in „Meine Klassen" (06.10.2026, abgestimmt mit der Lehrkraft).
 *
 * Je Klasse und Lehrkraft gibt es ein unsichtbares Vorschaukonto (nutzer.quelle = 'vorschau'). Es gehört zu allen
 * Lerngruppen gleichen Namens der Lehrkraft (onlinetest.ts `gehoertZu` über die Gruppe `vorschau:<Lehrkraft>:<Klasse>`),
 * sieht genau die Freigaben der Klasse und kann wirklich bearbeiten, abgeben, KI-Feedback bekommen (über den Zugang der
 * Lehrkraft wie bei echten Lernenden), Reihen durchlaufen und Vokabeln/Grammatik üben. Es zählt NIE: `alleNutzer()`
 * lässt es aus (damit Lerngruppen, Verwaltung, Namensschutz), Auswertungen filtern seine Zeilen (`OHNE_VORSCHAU`).
 *
 * Anmeldung des Fensters: nicht über das Sitzungs-Cookie (das würde die Lehrkraft in der Haupt-App abmelden), sondern
 * über einen signierten Vorschau-Schlüssel (Konto, Lehrkraft, Ablauf 8 h). Das Fenster schickt ihn als Kopfzeile
 * `x-schulapps-vorschau` (bzw. als Parameter `vs` für Seiten, Bilder, Ton); der Server nimmt ihn NUR zusammen mit der
 * Cookie-Sitzung derselben Lehrkraft an (http.ts) und handelt dann als Vorschaukonto – Rolle schueler, nie mehr.
 *
 *   POST /server/klassen/<gruppe>/vorschau   {zustand}              → {schluessel, adresse}
 *   POST /server/vorschau/zuruecksetzen      {schluessel, zustand}  Daten löschen, Lernstand neu erzeugen
 *   GET  /vorschau?vs=…                      Fenster: Streifen (Gerät, Lernstand, Zurücksetzen) + Ansicht
 *
 * Lernstand beim Öffnen wählbar (neu / fleißig, noch unsicher / erfolgreich / länger nicht da): Beispieldaten für
 * Vokabel- und Grammatikkästen, Übungstage und Wochen-Schnappschüsse, so dass die Zustandslogik (shared/lernstand.ts)
 * den gewählten Zustand ergibt. Ohne KI-Anfrage; der Wochenrückblick der KI entfällt für das Vorschaukonto (lernstand.ts).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { TAG_MS, wocheVon } from '../shared/lernstand'
import { istSicher, neuerStand, type WortStand } from '../shared/vokabeltrainer'
import { datenbank, nutzerAendern, nutzerAnlegen, nutzerLoeschen, nutzerNachId, protokolliereServer, type NutzerInfo } from './datenbank'
import { hauptschluessel } from './geheim'
import { json, type Anfrage } from './http'
import { lerngruppe, vorschauGruppe } from './onlinetest'
import { standSpeichern as vokStandSpeichern, vokabelListenFuer, zeile as vokZeile } from './vokabeln'
import { grammatikStandSetzen } from './grammatik'
import { wocheSchreiben } from './lernstand'
import { DATEN } from './pfade'

/** Gültigkeit eines Vorschau-Schlüssels */
export const VORSCHAU_MS = 8 * 36e5

export const ZUSTAENDE = ['neu', 'fleissig', 'erfolgreich', 'inaktiv'] as const
export type VorschauZustand = (typeof ZUSTAENDE)[number]
const ZUSTAND_TEXT: Record<VorschauZustand, string> = {
  neu: 'Neu',
  fleissig: 'Fleißig, noch unsicher',
  erfolgreich: 'Erfolgreich',
  inaktiv: 'Länger nicht da'
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vorschau_konten (
  nutzer_id TEXT PRIMARY KEY REFERENCES nutzer(id) ON DELETE CASCADE,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  klasse TEXT NOT NULL,
  anzeige TEXT NOT NULL,
  zustand TEXT NOT NULL DEFAULT 'neu',
  erstellt TEXT NOT NULL,
  UNIQUE (lehrkraft_id, klasse)
);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    bereit = true
  }
  return d
}
/** Nur für Tests: Tabelle nach einer neuen Datenbank wieder anlegen */
export const vorschauZuruecksetzen = (): void => {
  bereit = false
}

interface KontoZeile {
  nutzer_id: string
  lehrkraft_id: string
  klasse: string
  anzeige: string
  zustand: string
}

const klassenSchluessel = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** Vorschaukonten ohne Lehrkraft (Lehrkraft gelöscht) entfernen – sie würden sonst still liegen bleiben */
function verwaisteEntfernen(): void {
  const d = db()
  for (const z of d.prepare("SELECT id FROM nutzer WHERE quelle = 'vorschau' AND id NOT IN (SELECT nutzer_id FROM vorschau_konten)").all() as { id: string }[]) {
    datenLoeschen(z.id)
    nutzerLoeschen(z.id)
  }
}

/** Das Vorschaukonto der Klasse (Lerngruppen gleichen Namens) einer Lehrkraft – bei Bedarf angelegt */
export function vorschauKonto(lehrkraftId: string, klassenName: string): NutzerInfo {
  const klasse = klassenSchluessel(klassenName)
  const z = db().prepare('SELECT * FROM vorschau_konten WHERE lehrkraft_id = ? AND klasse = ?').get(lehrkraftId, klasse) as KontoZeile | undefined
  const gruppen = [{ id: vorschauGruppe(lehrkraftId, klassenName), name: klassenName.trim() }]
  const da = z ? nutzerNachId(z.nutzer_id) : null
  if (da) {
    // Schreibweise der Klasse kann sich ändern („7A" → „7a")
    if (da.gruppen[0]?.name !== klassenName.trim()) nutzerAendern(da.id, { gruppen })
    return nutzerNachId(da.id)!
  }
  verwaisteEntfernen()
  if (z) db().prepare('DELETE FROM vorschau_konten WHERE nutzer_id = ?').run(z.nutzer_id)
  const n = nutzerAnlegen({ benutzer: `vorschau-${randomBytes(6).toString('hex')}`, name: 'Musterschüler', rolle: 'schueler', quelle: 'vorschau', gruppen })
  // Eingerichtet: keine Einrichtung, kein Passwort – anmelden lässt sich das Konto nie, nur über den Schlüssel
  nutzerAendern(n.id, { eingerichtet: true })
  db()
    .prepare('INSERT INTO vorschau_konten (nutzer_id, lehrkraft_id, klasse, anzeige, zustand, erstellt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(n.id, lehrkraftId, klasse, klassenName.trim(), 'neu', new Date().toISOString())
  protokolliereServer('vorschau', 'Vorschaukonto angelegt', lehrkraftId)
  return nutzerNachId(n.id)!
}

// ---------------------------------------------------------------- Schlüssel

const signatur = (roh: string): string =>
  createHmac('sha256', createHmac('sha256', hauptschluessel()).update('schulapps-vorschau').digest())
    .update(roh)
    .digest('base64url')
    .slice(0, 32)

/** Signierter Schlüssel: Konto.Lehrkraft.Ablauf.Signatur */
export function vorschauSchluessel(kontoId: string, lehrkraftId: string, jetzt = Date.now()): string {
  const roh = `${kontoId}.${lehrkraftId}.${(jetzt + VORSCHAU_MS).toString(36)}`
  return `${roh}.${signatur(roh)}`
}

/**
 * Das Vorschaukonto zu einem Schlüssel – nur für die Lehrkraft, an die er gebunden ist (deren Cookie-Sitzung läuft),
 * nur gültig signiert, nicht abgelaufen und nur für ein Konto, das wirklich ihr Vorschaukonto ist.
 */
export function kontoZumSchluessel(schluessel: string, lehrkraft: Pick<NutzerInfo, 'id' | 'rolle'>, jetzt = Date.now()): NutzerInfo | null {
  if (!schluessel || schluessel.length > 200 || (lehrkraft.rolle !== 'lehrkraft' && lehrkraft.rolle !== 'admin')) return null
  const teile = schluessel.split('.')
  if (teile.length !== 4) return null
  const [konto, lk, ablauf, sig] = teile
  const soll = signatur(`${konto}.${lk}.${ablauf}`)
  if (sig.length !== soll.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(soll))) return null
  if (lk !== lehrkraft.id || !(parseInt(ablauf, 36) > jetzt)) return null
  if (!db().prepare('SELECT 1 FROM vorschau_konten WHERE nutzer_id = ? AND lehrkraft_id = ?').get(konto, lk)) return null
  const n = nutzerNachId(konto)
  if (!n || n.quelle !== 'vorschau' || n.rolle !== 'schueler' || n.gesperrt) return null
  return n
}

// ---------------------------------------------------------------- Daten

/** Alles des Kontos löschen: jede Tabelle mit schueler_id bzw. nutzer_id (Abgaben, Kästen, Wochen, Beitritte …) und die Ablage */
export function datenLoeschen(id: string): void {
  const d = db()
  const tabellen = (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name)
  for (const t of tabellen) {
    if (!/^\w+$/.test(t) || ['nutzer', 'vorschau_konten', 'protokoll', 'sitzungen'].includes(t)) continue
    const spalten = new Set((d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((s) => s.name))
    for (const s of ['schueler_id', 'nutzer_id']) if (spalten.has(s)) d.prepare(`DELETE FROM ${t} WHERE ${s} = ?`).run(id)
  }
  const ordner = join(DATEN, 'nutzer', id)
  if (/^[a-z0-9]+$/.test(id) && existsSync(ordner)) rmSync(ordner, { recursive: true, force: true })
}

/** Plan je Zustand: Übungstage (vor so vielen Tagen), Trefferquote, Anteil sicherer und begonnener Einträge */
const PLAN: Record<Exclude<VorschauZustand, 'neu'>, { tage: number[]; quote: number; sicher: number; aufbau: number; trend: number | null }> = {
  // Fleißig (Wochenziel erreicht), Treffer niedrig, gegenüber der Vorwoche gleich → „fleissig"
  fleissig: { tage: [0, 1, 3, 5, 9, 12], quote: 0.5, sicher: 0.15, aufbau: 0.55, trend: 0 },
  // Fleißig und gut, mehr sicher als in der Vorwoche → „erfolgreich_fleissig"
  erfolgreich: { tage: [0, 1, 2, 4, 6, 8, 10, 13], quote: 0.9, sicher: 0.7, aufbau: 0.2, trend: 0.6 },
  // Letzte Übung vor knapp drei Wochen → „inaktiv"
  inaktiv: { tage: [19, 21, 24, 28, 33], quote: 0.7, sicher: 0.3, aufbau: 0.4, trend: null }
}

/** Beispielstand eines Eintrags (deterministisch nach seiner Stelle) */
function beispielStand(i: number, n: number, p: (typeof PLAN)[keyof typeof PLAN], zeiten: number[], jetzt: number): WortStand {
  const r = (i + 0.5) / Math.max(1, n)
  if (r >= p.sicher + p.aufbau) return neuerStand()
  const zuletzt = zeiten[i % zeiten.length]
  const versuche = 4 + (i % 3)
  // Fehler so verteilt, dass die Quote im Mittel stimmt
  const falsch = Math.min(versuche, Math.floor(versuche * (1 - p.quote) + ((i * 7) % 10) / 10))
  const s: WortStand = { ...neuerStand(), versuche, falsch, zuletzt, erkannt: 2 - (falsch ? 1 : 0), erkennenVersuche: 2 }
  if (r < p.sicher) return { ...s, fach: 5, frei: [zeiten[0] - 9 * TAG_MS, zeiten[0] - TAG_MS], faellig: jetzt + 5 * TAG_MS }
  // Im Aufbau: Fach 1–3; länger nicht da → längst fällig, sonst teils heute dran
  return { ...s, fach: 1 + (i % 3), faellig: p === PLAN.inaktiv ? jetzt - 10 * TAG_MS : i % 2 ? jetzt - TAG_MS : jetzt + 2 * TAG_MS }
}

/** Lernstand des Vorschaukontos neu aufsetzen: alles löschen, dann Beispieldaten für den Zustand (bei „neu" nichts) */
export function vorschauAufsetzen(konto: NutzerInfo, zustand: VorschauZustand, jetzt = Date.now()): void {
  datenLoeschen(konto.id)
  db().prepare('UPDATE vorschau_konten SET zustand = ? WHERE nutzer_id = ?').run(zustand, konto.id)
  if (zustand === 'neu') return
  const p = PLAN[zustand]
  const tage = p.tage.map((o) => new Date(jetzt - o * TAG_MS).toISOString().slice(0, 10))
  // Uhrzeit der Übung: mittags des Übungstags (heute höchstens jetzt)
  const zeiten = p.tage.map((o) => Math.min(jetzt, Date.parse(`${new Date(jetzt - o * TAG_MS).toISOString().slice(0, 10)}T12:00:00Z`)))
  let sicher = 0
  let versuche = 0
  let falsch = 0
  const zaehle = (st: Record<string, WortStand>): void => {
    for (const s of Object.values(st)) {
      if (istSicher(s)) sicher++
      versuche += s.versuche
      falsch += s.falsch
    }
  }
  const staende = (ids: string[]): Record<string, WortStand> => Object.fromEntries(ids.map((id, i) => [id, beispielStand(i, ids.length, p, zeiten, jetzt)]))
  for (const v of vokabelListenFuer(konto)) {
    const woerter = JSON.parse(vokZeile(v.id)?.woerter ?? '[]') as { id: string }[]
    const st = staende(woerter.map((w) => w.id))
    zaehle(st)
    vokStandSpeichern(v.id, konto.id, { woerter: st, tage })
  }
  grammatikStandSetzen(konto, (ids) => {
    const st = staende(ids)
    zaehle(st)
    return { aufgaben: st, tage }
  })
  // Übungstage und Treffer auch ohne Listen (Klasse ohne Vokabeln/Grammatik): Ergänzung, die lernstand.ts mitzählt
  const zusatz = { tage, versuche: 40, falsch: Math.round(40 * (1 - p.quote)), zuletzt: zeiten[0] }
  versuche += zusatz.versuche
  falsch += zusatz.falsch
  wocheSchreiben(konto.id, VORSCHAU_WOCHE, { vorschau: zusatz })
  // Schnappschuss der Vorwoche (Trend und „neu sicher" in der Begrüßung): halb so viele Versuche, gleiche Quote
  if (p.trend !== null)
    wocheSchreiben(konto.id, wocheVon(jetzt - 7 * TAG_MS), {
      schnapp: { sicher: Math.round(sicher * (p.trend || 1)), gesamt: 0, versuche: Math.round(versuche / 2), falsch: Math.round(falsch / 2), zeit: jetzt - 7 * TAG_MS }
    })
}

/** Zeile in lern_wochen mit den Beispiel-Übungstagen (kein Datum – fällt bei „frühere Woche" nie hinein) */
export const VORSCHAU_WOCHE = 'vorschau'

// ---------------------------------------------------------------- Fenster

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function fensterSeite(schluessel: string, klasse: string, zustand: string): string {
  const titel = `Vorschau als Musterschüler ${klasse}`
  const wahl = ZUSTAENDE.map((z) => `<option value="${z}"${z === zustand ? ' selected' : ''}>${esc(ZUSTAND_TEXT[z])}</option>`).join('')
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; height: 100%; background: #2b2d31; font: 14px system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .streifen { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 6px 12px; background: #0f7b6c; color: #fff; min-height: 36px; box-sizing: border-box; }
  .streifen b { font-weight: 650; }
  .hinweis { opacity: .85; font-size: 12px; }
  .rechts { margin-left: auto; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .geraete { display: inline-flex; border: 1px solid rgba(255,255,255,.55); border-radius: 999px; overflow: hidden; }
  .geraete button { border: 0; background: transparent; color: #fff; padding: 4px 12px; cursor: pointer; font: inherit; }
  .geraete button[aria-pressed="true"] { background: #fff; color: #0f7b6c; font-weight: 600; }
  select, .zurueck { font: inherit; border-radius: 999px; border: 1px solid rgba(255,255,255,.55); padding: 3px 10px; background: rgba(255,255,255,.12); color: #fff; }
  select option { color: #000; }
  .zurueck { cursor: pointer; }
  .buehne { height: calc(100% - var(--streifen, 48px)); display: flex; justify-content: center; align-items: stretch; overflow: auto; }
  iframe { border: 0; background: #fff; height: 100%; width: 100%; display: block; }
  .buehne[data-geraet="tablet"] iframe { width: 1024px; max-width: 100%; box-shadow: 0 0 0 1px #444, 0 6px 24px rgba(0,0,0,.4); }
  .buehne[data-geraet="handy"] iframe { width: 390px; max-width: 100%; box-shadow: 0 0 0 1px #444, 0 6px 24px rgba(0,0,0,.4); }
  .meldung { color: #fff; }
</style></head>
<body>
<div class="streifen" id="streifen" data-vorschau-streifen>
  <b>${esc(titel)}</b><span class="hinweis">zählt in keiner Auswertung</span>
  <span class="rechts">
    <span class="geraete" role="group" aria-label="Gerät">
      <button type="button" data-geraet="tablet" aria-pressed="true">Tablet</button>
      <button type="button" data-geraet="handy" aria-pressed="false">Handy</button>
      <button type="button" data-geraet="pc" aria-pressed="false">PC</button>
    </span>
    <label>Lernstand <select id="zustand" data-vorschau-zustand>${wahl}</select></label>
    <button type="button" class="zurueck" id="zuruecksetzen" data-vorschau-zuruecksetzen>Zurücksetzen</button>
    <button type="button" class="zurueck" id="schliessen" title="Vorschau schließen">Schließen</button>
    <span class="meldung" id="meldung" role="status"></span>
  </span>
</div>
<div class="buehne" id="buehne" data-geraet="tablet"><iframe id="ansicht" title="Schülersicht" src="/s/?vs=${encodeURIComponent(schluessel)}"></iframe></div>
<script>
(function () {
  var schluessel = ${JSON.stringify(schluessel).replace(/</g, '\\u003c')};
  try { sessionStorage.setItem('sa-vorschau', schluessel) } catch (e) {}
  var buehne = document.getElementById('buehne'), ansicht = document.getElementById('ansicht'), meldung = document.getElementById('meldung');
  var hoehe = function () { document.documentElement.style.setProperty('--streifen', document.getElementById('streifen').offsetHeight + 'px') };
  hoehe(); window.addEventListener('resize', hoehe);
  var geraet = function (g) {
    buehne.setAttribute('data-geraet', g);
    document.querySelectorAll('.geraete button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-geraet') === g)) });
    try { localStorage.setItem('sa-vorschau-geraet', g) } catch (e) {}
  };
  try { var gemerkt = localStorage.getItem('sa-vorschau-geraet'); if (gemerkt) geraet(gemerkt) } catch (e) {}
  document.querySelectorAll('.geraete button').forEach(function (b) { b.addEventListener('click', function () { geraet(b.getAttribute('data-geraet')) }) });
  // Eigenes Fenster schließen; ohne eigenes Fenster (iPad-App) zurück zur App
  // Beim Schließen den gemerkten Schlüssel vergessen – sonst liefe ein späterer Schülerbereich in diesem Reiter als Vorschau
  document.getElementById('schliessen').addEventListener('click', function () { try { sessionStorage.removeItem('sa-vorschau') } catch (e) {} if (window.opener || history.length <= 1) window.close(); if (!window.closed) location.assign('/') });
  /*
   * Lernstand wechseln wirkt sofort (08.10.2026, Befund der Lehrkraft: die Auswahl „fleißig" änderte nichts – erst der
   * Knopf „Zurücksetzen" setzte den Stand neu auf). Auswahl = Stand neu erzeugen und Ansicht neu laden; der Knopf setzt
   * den gewählten Stand erneut auf (z. B. nach eigenen Übungen in der Vorschau).
   */
  var auswahl = document.getElementById('zustand'), laufend = 0;
  var anwenden = function (text, fertig) {
    var nr = ++laufend;
    auswahl.disabled = true;
    meldung.textContent = text;
    fetch('/server/vorschau/zuruecksetzen', { method: 'POST', headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' }, body: JSON.stringify({ schluessel: schluessel, zustand: auswahl.value }), cache: 'no-store' })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || d.fehler) throw new Error(d.fehler || ('Fehler ' + r.status)); return d }) })
      .then(function () {
        if (nr !== laufend) return;
        meldung.textContent = fertig;
        ansicht.src = '/s/?vs=' + encodeURIComponent(schluessel) + '&t=' + Date.now();
        setTimeout(function () { if (nr === laufend) meldung.textContent = '' }, 2500)
      })
      .catch(function (e) { if (nr === laufend) meldung.textContent = e.message })
      .then(function () { if (nr === laufend) auswahl.disabled = false })
  };
  auswahl.addEventListener('change', function () { anwenden('Lernstand wird gesetzt …', 'Lernstand übernommen.') });
  document.getElementById('zuruecksetzen').addEventListener('click', function () { anwenden('Wird zurückgesetzt …', 'Zurückgesetzt.') });
})();
</script>
</body></html>`
}

const abgelaufenSeite = (): string =>
  '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Vorschau</title></head><body style="font:16px system-ui;padding:24px">' +
  '<p>Diese Vorschau ist abgelaufen oder gehört zu einer anderen Anmeldung. Bitte in „Meine Klassen“ erneut „Als Schüler ansehen“ wählen.</p></body></html>'

const zustandAus = (wert: unknown): VorschauZustand | null => (ZUSTAENDE.includes(wert as VorschauZustand) ? (wert as VorschauZustand) : null)

export function vorschauRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const p = url.pathname
    const oeffnen = /^\/server\/klassen\/[^/]+\/vorschau$/.test(p)
    if (!oeffnen && p !== '/server/vorschau/zuruecksetzen' && p !== '/vorschau') return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (ich.rolle !== 'lehrkraft' && ich.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)

    if (req.method === 'GET' && p === '/vorschau') {
      const schluessel = url.searchParams.get('vs') ?? ''
      const konto = kontoZumSchluessel(schluessel, ich)
      const z = konto ? (db().prepare('SELECT * FROM vorschau_konten WHERE nutzer_id = ?').get(konto.id) as KontoZeile | undefined) : undefined
      res.writeHead(konto && z ? 200 : 403, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      return (res.end(konto && z ? fensterSeite(schluessel, z.anzeige, z.zustand) : abgelaufenSeite()), true)
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const k0 = (await k.koerper()) as Record<string, unknown>

    if (oeffnen) {
      const g = lerngruppe(decodeURIComponent(p.split('/')[3] ?? ''))
      if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true)
      const konto = vorschauKonto(ich.id, g.name)
      // „behalten": weiter mit dem Stand von zuletzt (z. B. nach einer Abgabe)
      const zustand = zustandAus(k0.zustand)
      if (zustand) vorschauAufsetzen(konto, zustand)
      const schluessel = vorschauSchluessel(konto.id, ich.id)
      protokolliereServer('vorschau', `Schülervorschau geöffnet (${zustand ?? 'Stand behalten'})`, ich.id)
      return (json(res, 200, { schluessel, adresse: `/vorschau?vs=${encodeURIComponent(schluessel)}`, klasse: g.name.trim() }), true)
    }
    // Zurücksetzen aus dem Streifen des Fensters
    const konto = kontoZumSchluessel(String(k0.schluessel ?? ''), ich)
    if (!konto) return (json(res, 403, { fehler: 'Die Vorschau ist abgelaufen. Bitte neu öffnen.' }), true)
    vorschauAufsetzen(konto, zustandAus(k0.zustand) ?? 'neu')
    return (json(res, 200, { ok: true }), true)
  }
}
