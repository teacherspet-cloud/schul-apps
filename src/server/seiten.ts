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
/* Dunkel als Vorgabe (05.10.2026) */
:root { color-scheme: dark; --grund: #11181d; --karte: #1b252c; --text: #e6edf1; --leise: #9fb0bb; --akzent: #34b39f; --rand: #2c3a43; --fehler: #ff8a80; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--grund); color: var(--text); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 16px; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
main { width: 100%; max-width: 420px; background: var(--karte); border: 1px solid var(--rand); border-radius: 16px; padding: 28px 24px; box-shadow: 0 8px 30px rgba(0,0,0,.06); }
h1 { margin: 0 0 4px; font-size: 1.6rem; }
p.leise { margin: 0 0 22px; color: var(--leise); }
a.knopf, button { display: block; width: 100%; text-align: center; padding: 14px 16px; border-radius: 10px; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; }
a.knopf { background: var(--akzent); color: #08201c; border: 0; }
button { background: transparent; color: var(--akzent); border: 1.5px solid var(--akzent); margin-top: 12px; }
label { display: block; font-size: .9rem; color: var(--leise); margin: 12px 0 4px; }
input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--rand); background: transparent; color: var(--text); font: inherit; }
details { margin-top: 20px; border-top: 1px solid var(--rand); padding-top: 14px; }
summary { cursor: pointer; color: var(--leise); }
.fehler { background: color-mix(in srgb, var(--fehler) 12%, transparent); color: var(--fehler); border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; }
.hinweis { font-size: .85rem; color: var(--leise); margin-top: 18px; }
form.code button { margin-top: 10px; background: var(--akzent); color: #08201c; border: 0; }
section.anmelden { margin-top: 28px; border-top: 1px solid var(--rand); padding-top: 18px; }
section.anmelden p.leise { margin-bottom: 14px; }
a.knopf2 { display: block; width: 100%; text-align: center; padding: 14px 16px; border-radius: 10px; font-weight: 600; text-decoration: none; color: var(--akzent); border: 1.5px solid var(--akzent); margin-top: 16px; }
/* Anmeldefenster (08.10.2026): mit Skript echtes Dialogfenster (showModal), ohne Skript per #Anker */
dialog.fenster { width: min(420px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto; padding: 0; border: 1px solid var(--rand); border-radius: 16px; background: var(--karte); color: var(--text); }
dialog.fenster::backdrop { background: rgba(0,0,0,.6); }
dialog.fenster:target, dialog.fenster.offen { display: block; position: fixed; inset: 0; margin: auto; height: fit-content; z-index: 10; box-shadow: 0 0 0 100vmax rgba(0,0,0,.6); }
.fenster-innen { padding: 20px 22px 24px; }
.fenster-kopf { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.fenster-kopf h2 { margin: 0; font-size: 1.15rem; }
a.zu { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; color: var(--leise); text-decoration: none; font-size: 1.6rem; line-height: 1; }
a.zu:hover, a.zu:focus-visible { background: var(--rand); color: var(--text); }
.fenster .fehler { margin: 12px 0 0; }
.fenster input:focus-visible { outline: 2px solid var(--akzent); outline-offset: 1px; }
`

/*
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
if(d.classList.contains('offen')||location.hash==='#anmelden-fenster')auf()})()`

/** CSP der Anmeldeseite: keine Skripte außer dem kleinen Fensterskript (per Hash freigegeben) */
export const ANMELDE_CSP = `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'sha256-${createHash('sha256')
  .update(FENSTER_JS)
  .digest('base64')}'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'`

export function anmeldeSeite(o: { iserv: boolean; notzugang: boolean; fehler: string; ziel: string; benutzer?: string; konto?: boolean }): string {
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
<main>
  <h1>Schul-Apps</h1>
  ${o.fehler && !kontoFehler ? `<div class="fehler" role="alert">${esc(o.fehler)}</div>` : ''}
  <!-- Mit Code öffnen (08.10.2026, Befund im Unterricht): der übliche Weg der Lernenden, deshalb oben und groß -->
  <form method="get" action="/s/" class="code">
    <label for="code">Mit Code öffnen</label>
    <input id="code" name="code" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12" required
      placeholder="z. B. AB12CD" style="text-transform:uppercase;font-size:1.3rem;letter-spacing:.08em">
    <button type="submit">Öffnen</button>
  </form>
  <!-- Anmeldung (08.10.2026): IServ wie bisher, Nutzername/Passwort in einem kleinen Fenster -->
  <section class="anmelden">
  <p class="leise">${fuerSchueler ? 'Anmelden – zu den eigenen Arbeitsblättern, Vokabeln, Tests und Aufgaben.' : 'Anmelden mit dem Zugang der Schule.'}</p>
  ${
    o.iserv
      ? `<a class="knopf" href="/auth/iserv?ziel=${encodeURIComponent(ziel)}">Mit IServ anmelden</a>
  <p class="hinweis">Das IServ-Passwort gibst du nur bei IServ ein – Schul-Apps sieht und speichert es nicht.</p>`
      : `<p class="hinweis">Die Anmeldung über IServ ist noch nicht freigeschaltet. Bis dahin geht es nur mit einem Testkonto.</p>`
  }
  <a class="knopf2" id="anmelden-oeffnen" href="#anmelden-fenster" aria-haspopup="dialog" data-anmelden-oeffnen>Mit Nutzername und Passwort anmelden</a>
  </section>
</main>
<dialog id="anmelden-fenster" class="fenster${fensterOffen ? ' offen' : ''}" aria-labelledby="anmelden-titel" data-anmelden-fenster>
  <div class="fenster-innen">
  <div class="fenster-kopf">
    <h2 id="anmelden-titel">Mit Nutzername und Passwort anmelden</h2>
    <a class="zu" href="${fensterOffen ? `/anmelden?ziel=${encodeURIComponent(ziel)}` : '#'}" aria-label="Schließen" data-schliessen>×</a>
  </div>
  <p class="leise" style="margin:0">${o.notzugang ? 'Testkonto oder Notzugang' : 'Testkonto'}</p>
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
