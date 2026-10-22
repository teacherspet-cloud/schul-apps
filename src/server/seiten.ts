/**
 * Schlichte Seiten des Servers ohne die große Oberfläche (02.10.2026): Anmeldung.
 *
 * Bewusst ohne Skript (CSP: keine Skripte) – die Seite muss auf jedem Gerät sofort gehen, auch
 * auf alten iPads. Optimiert für Telefon, Tablet und PC (eine Spalte, große Schaltflächen).
 * Ausnahme (08.10.2026): ein kleines, per Hash freigegebenes Skript für das Anmeldefenster
 * (Esc, Fokus) – ohne Skript öffnet das Fenster per #Anker (:target), es geht also auch so.
 */
import { createHash } from 'node:crypto'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const STIL = `
/*
 * Abendrot (20.10.2026, Entscheidung der Lehrkraft): dunkler Grund mit weichen Farbwolken (Blau, Violett, warmer
 * Schimmer unten), Karte wie Milchglas, Hauptknopf im Verlauf Blau → Violett – dieselben Töne wie das Farbprofil
 * „Abendrot“ der App (themes.ts, schuelerFarben.ts). Alte Browser ohne color-mix/backdrop-filter zeigen schlicht dunkel.
 */
:root { color-scheme: dark; --grund: #120f22; --grund2: #1a1530; --karte: rgba(30, 24, 52, .72); --karte-rand: rgba(255,255,255,.09);
  --feld: rgba(8, 6, 20, .55); --feld-rand: rgba(255,255,255,.12); --text: #eeecf8; --leise: #b0a8c8; --akzent: #9a8cff; --fehler: #ff8f86;
  --verlauf: linear-gradient(135deg, #5b7cff 0%, #a35cff 100%); --verlauf-hover: linear-gradient(135deg, #7290ff 0%, #b677ff 100%); }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: var(--text); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 16px; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background-color: var(--grund);
  background-image: radial-gradient(520px 420px at 12% 8%, rgba(91,108,255,.38), transparent 70%), radial-gradient(560px 460px at 92% 22%, rgba(180,92,255,.34), transparent 70%),
    radial-gradient(620px 520px at 50% 110%, rgba(255,122,89,.26), transparent 70%), linear-gradient(180deg, var(--grund2), var(--grund));
  background-attachment: fixed; }
.spalte { width: 100%; max-width: 400px; }
header { text-align: center; margin-bottom: 22px; }
.symbol { display: inline-block; padding: 4px; border-radius: 24px; background: var(--verlauf); box-shadow: 0 14px 40px rgba(130,92,255,.4); }
.symbol img { display: block; width: 76px; height: 76px; border-radius: 20px; }
h1 { margin: 0 0 4px; font-size: 1.6rem; letter-spacing: -.01em; }
header h1 { margin: 14px 0 2px; font-size: 1.85rem; font-weight: 800; letter-spacing: -.02em; }
header p { margin: 0; color: var(--leise); }
main { width: 100%; max-width: 400px; background: var(--karte); border: 1px solid var(--karte-rand); border-radius: 22px; padding: 26px 22px 22px;
  -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%); box-shadow: 0 24px 60px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.06); }
p.leise { margin: 0 0 18px; color: var(--leise); }
a.knopf, button { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 15px 16px; border: 0; border-radius: 14px;
  background: var(--verlauf); color: #fff; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer;
  box-shadow: 0 10px 26px rgba(120,92,255,.35), inset 0 1px 0 rgba(255,255,255,.25); transition: transform .08s, box-shadow .15s; }
a.knopf:hover, button:hover { background: var(--verlauf-hover); }
a.knopf:active, button:active { transform: translateY(1px); }
a.knopf:focus-visible, button:focus-visible { outline: 3px solid rgba(154,140,255,.6); outline-offset: 3px; }
a.knopf { font-size: 1.08rem; padding: 16px; }
a.knopf svg { width: 22px; height: 22px; flex: none; }
label { display: block; font-size: .9rem; color: var(--leise); margin: 12px 0 4px; }
input { width: 100%; padding: 12px; border-radius: 12px; border: 1.5px solid var(--feld-rand); background: var(--feld); color: var(--text); font: inherit; }
input:focus-visible { outline: none; border-color: var(--akzent); box-shadow: 0 0 0 4px rgba(154,140,255,.25); }
form button { margin-top: 16px; }
.fehler { background: rgba(255,143,134,.12); color: var(--fehler); border-radius: 10px; padding: 10px 12px; margin-bottom: 16px; }
.hinweis { display: flex; gap: 8px; align-items: flex-start; margin: 10px 2px 0; font-size: .85rem; color: var(--leise); }
.hinweis svg { flex: none; width: 15px; height: 15px; margin-top: 2px; color: var(--akzent); }
.oder { display: flex; align-items: center; gap: 12px; margin: 22px 0 14px; color: var(--leise); font-size: .82rem; text-transform: uppercase; letter-spacing: .12em; }
.oder::before, .oder::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--feld-rand), transparent); }
/* Mit Code öffnen: Feld und Knopf in einer Zeile */
form.code label { font-size: 1rem; font-weight: 600; color: var(--text); margin: 0 0 6px; }
.codezeile { display: flex; gap: 8px; }
.codezeile input { flex: 1; min-width: 0; padding: 12px 14px; border-radius: 14px; font: 600 1.3rem/1.2 ui-monospace, "Cascadia Mono", Consolas, monospace; letter-spacing: .16em; text-transform: uppercase; }
.codezeile input::placeholder { color: rgba(176,168,200,.5); }
.codezeile input[aria-invalid] { border-color: var(--fehler); }
form.code button { width: auto; flex: none; margin: 0; padding: 0 18px; border: 1.5px solid rgba(154,140,255,.7); background: rgba(154,140,255,.12); color: var(--akzent); box-shadow: none; }
form.code button:hover { background: rgba(154,140,255,.24); }
form.code .fehler { margin: 0 0 8px; }
.codehilfe { margin: 7px 2px 0; color: var(--leise); font-size: .85rem; }
/* Nutzername/Passwort: kleiner Verweis unter der Karte */
.fuss { text-align: center; margin-top: 18px; }
a.knopf2 { color: var(--leise); font-size: .88rem; text-decoration: underline; text-decoration-color: rgba(176,168,200,.4); text-underline-offset: 3px; }
a.knopf2:hover, a.knopf2:focus-visible { color: var(--text); }
.fuss.rechtliches { margin-top: 10px; color: var(--leise); font-size: .8rem; }
.fuss.rechtliches a.knopf2 { font-size: .8rem; }
/* Anmeldefenster (08.10.2026): mit Skript echtes Dialogfenster (showModal), ohne Skript per #Anker */
dialog.fenster { width: min(400px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto; padding: 0; border: 1px solid var(--karte-rand); border-radius: 20px; background: var(--grund2); color: var(--text); box-shadow: 0 30px 80px rgba(0,0,0,.45); }
dialog.fenster::backdrop { background: rgba(5,4,12,.6); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
dialog.fenster:target, dialog.fenster.offen { display: block; position: fixed; inset: 0; margin: auto; height: fit-content; z-index: 10; box-shadow: 0 0 0 100vmax rgba(5,4,12,.6); }
.fenster-innen { padding: 20px 22px 24px; }
.fenster-kopf { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.fenster-kopf h2 { margin: 0; font-size: 1.15rem; }
a.zu { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; color: var(--leise); text-decoration: none; font-size: 1.6rem; line-height: 1; }
a.zu:hover, a.zu:focus-visible { background: var(--feld-rand); color: var(--text); }
.fenster .fehler { margin: 12px 0 0; }
`

/*
 * Tab/Enter im Feld „Benutzername“ führt ausdrücklich ins Passwortfeld (08.10.2026, Befund der Lehrkraft auf iPad,
 * Online-Exe und PC-Browser – vermutlich fangen Vorschlagslisten gespeicherter Anmeldungen den Tab-Druck ab).
 * Anmeldefenster (08.10.2026): öffnet als Dialog (Esc schließt, Klick daneben schließt, Fokus ins
 * Feld „Benutzername“, beim Schließen zurück auf den Knopf). Ohne showModal (sehr alte Browser)
 * bleibt der #Anker-Weg. Fester Text, damit der Hash in der CSP stimmt.
 */
const FENSTER_JS = `(function(){var d=document.getElementById('anmelden-fenster'),a=document.getElementById('anmelden-oeffnen');if(!d||!a||typeof d.showModal!=='function')return
function auf(){d.classList.remove('offen');if(location.hash==='#anmelden-fenster')history.replaceState(null,'',location.pathname+location.search);if(!d.open)d.showModal();var b=document.getElementById('benutzer'),p=document.getElementById('passwort');(b&&b.value&&p?p:b).focus()}
a.addEventListener('click',function(e){e.preventDefault();auf()})
d.addEventListener('click',function(e){if(e.target===d)d.close()})
var z=d.querySelectorAll('[data-schliessen]');for(var i=0;i<z.length;i++)z[i].addEventListener('click',function(e){e.preventDefault();d.close()})
d.addEventListener('close',function(){a.focus()})
var bn=document.getElementById('benutzer'),pw=document.getElementById('passwort');if(bn&&pw)bn.addEventListener('keydown',function(e){if((e.key==='Tab'&&!e.shiftKey)||e.key==='Enter'){e.preventDefault();pw.focus()}})
if(d.classList.contains('offen')||location.hash==='#anmelden-fenster')auf()})()`

/** CSP der Anmeldeseite: keine Skripte außer dem kleinen Fensterskript (per Hash freigegeben) */
export const ANMELDE_CSP = `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'sha256-${createHash('sha256')
  .update(FENSTER_JS)
  .digest('base64')}'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'`

export function anmeldeSeite(o: {
  iserv: boolean
  notzugang: boolean
  fehler: string
  ziel: string
  benutzer?: string
  konto?: boolean
  /** Unbekannter Code (09.10.2026): Meldung am Codefeld, eingegebener Code steht wieder darin */
  code?: string
  codeUnbekannt?: boolean
}): string {
  const code = (o.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  const ziel = /^\/[a-zA-Z0-9/_-]*$/.test(o.ziel) ? o.ziel : '/'
  const fuerSchueler = ziel.startsWith('/s/')
  // Fehlgeschlagene Anmeldung mit Nutzername/Passwort (oder vorbelegter Name): Fenster gleich offen,
  // damit die Meldung sichtbar ist; IServ-Fehler bleiben oben auf der Seite
  const kontoFehler = Boolean(o.fehler && o.konto)
  const fensterOffen = kontoFehler || Boolean(o.benutzer)
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="/favicon.ico" sizes="any">
<title>Schul-Apps – Anmelden</title>
<style>${STIL}</style>
</head>
<body>
<div class="spalte">
<header>
  <span class="symbol"><img src="/web-app/icon-192.png" alt=""></span>
  <h1>Schul-Apps</h1>
  <p>${fuerSchueler ? 'Arbeitsblätter, Vokabeln, Tests und Aufgaben' : 'Arbeitsblätter, Vokabeln, Tests und mehr'}</p>
</header>
<main>
  ${o.fehler && !kontoFehler ? `<div class="fehler" role="alert">${esc(o.fehler)}</div>` : ''}
  <!-- Neu gestaltet (20.10.2026, Entscheidung der Lehrkraft): IServ als Hauptweg oben, „Mit Code öffnen" direkt darunter
       ohne Aufklappen, Nutzername/Passwort als kleiner Verweis unter der Karte (Fenster wie seit 08.10.2026) -->
  ${
    o.iserv
      ? `<a class="knopf" href="/auth/iserv?ziel=${encodeURIComponent(ziel)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>Mit IServ anmelden</a>
  <p class="hinweis"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Das Passwort wird nur bei IServ eingegeben – Schul-Apps sieht und speichert es nicht.</p>`
      : `<p class="hinweis">Die Anmeldung über IServ ist noch nicht freigeschaltet.</p>`
  }
  <div class="oder">oder</div>
  <form method="get" action="/s/" class="code">
    <input type="hidden" name="von" value="anmelden">
    <label for="code">Mit Code öffnen</label>
    ${o.codeUnbekannt ? '<div class="fehler" role="alert" data-code-unbekannt>Diesen Code kennen wir nicht – bitte genau prüfen.</div>' : ''}
    <div class="codezeile">
      <input id="code" name="code" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12" required enterkeyhint="go"
        placeholder="AB12CD" aria-describedby="codehilfe" value="${esc(code)}"${o.codeUnbekannt ? ' autofocus aria-invalid="true"' : ''}>
      <button type="submit">Öffnen →</button>
    </div>
    <p class="codehilfe" id="codehilfe">Der Code steht auf dem Zettel oder unter dem QR-Code der Lehrkraft.</p>
  </form>
</main>
<div class="fuss"><a class="knopf2" id="anmelden-oeffnen" href="#anmelden-fenster" aria-haspopup="dialog" data-anmelden-oeffnen>Mit Nutzername und Passwort anmelden</a></div>
<!-- Informationspflichten (22.10.2026, Prüfung des Schulträgers): ohne Anmeldung erreichbar (datenschutzSeiten.ts) -->
<div class="fuss rechtliches" data-rechtliches><a class="knopf2" href="/datenschutz">Datenschutz</a> · <a class="knopf2" href="/datenschutz/eltern">Für Eltern</a> · <a class="knopf2" href="/impressum">Impressum</a></div>
</div>
<dialog id="anmelden-fenster" class="fenster${fensterOffen ? ' offen' : ''}" aria-labelledby="anmelden-titel" data-anmelden-fenster>
  <div class="fenster-innen">
  <div class="fenster-kopf">
    <h2 id="anmelden-titel">Mit Nutzername und Passwort anmelden</h2>
    <a class="zu" href="${fensterOffen ? `/anmelden?ziel=${encodeURIComponent(ziel)}` : '#'}" aria-label="Schließen" data-schliessen>×</a>
  </div>
  ${kontoFehler ? `<div class="fehler" role="alert">${esc(o.fehler)}</div>` : ''}
    <form method="post" action="/auth/lokal">
      <input type="hidden" name="ziel" value="${esc(ziel)}">
      <label for="benutzer">Benutzername</label>
      <input id="benutzer" name="benutzer" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="${esc((o.benutzer ?? '').replace(/[^a-z0-9._-]/gi, '').slice(0, 64))}">
      <label for="passwort">Passwort</label>
      <input id="passwort" name="passwort" type="password" autocomplete="current-password" required>
      <button type="submit">Anmelden</button>
    </form>
  </div>
</dialog>
<script>${FENSTER_JS}</script>
</body>
</html>`
}

/** Eigenes Passwort setzen – Pflicht nach der ersten Anmeldung mit einem vorübergehenden Passwort */
export function passwortSeite(o: { name: string; fehler: string; ziel: string }): string {
  const ziel = /^\/[a-zA-Z0-9/_-]*$/.test(o.ziel) ? o.ziel : '/'
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="/favicon.ico" sizes="any">
<title>Schul-Apps – Eigenes Passwort</title>
<style>${STIL}</style>
</head>
<body>
<main>
  <h1>Eigenes Passwort</h1>
  <p class="leise">Angemeldet als ${esc(o.name)}. Das vorübergehende Passwort gilt nur für die erste Anmeldung – bitte jetzt ein eigenes festlegen (mindestens 10 Zeichen).</p>
  ${o.fehler ? `<div class="fehler" role="alert">${esc(o.fehler)}</div>` : ''}
  <form method="post" action="/auth/passwort">
    <input type="hidden" name="ziel" value="${esc(ziel)}">
    <label for="neu">Neues Passwort</label>
    <input id="neu" name="neu" type="password" autocomplete="new-password" minlength="10" required>
    <label for="neu2">Neues Passwort wiederholen</label>
    <input id="neu2" name="neu2" type="password" autocomplete="new-password" minlength="10" required>
    <button type="submit">Speichern</button>
  </form>
</main>
</body>
</html>`
}
