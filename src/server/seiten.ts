/**
 * Schlichte Seiten des Servers ohne die große Oberfläche (02.10.2026): Anmeldung.
 *
 * Bewusst ohne Skript (CSP: keine Skripte) – die Seite muss auf jedem Gerät sofort gehen, auch
 * auf alten iPads. Optimiert für Telefon, Tablet und PC (eine Spalte, große Schaltflächen).
 */
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const STIL = `
:root { color-scheme: light dark; --grund: #f3f6f8; --karte: #fff; --text: #1d2a33; --leise: #5b6b76; --akzent: #0f7b6c; --rand: #d5dde3; --fehler: #b42318; }
@media (prefers-color-scheme: dark) { :root { --grund: #11181d; --karte: #1b252c; --text: #e6edf1; --leise: #9fb0bb; --akzent: #34b39f; --rand: #2c3a43; --fehler: #ff8a80; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--grund); color: var(--text); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 16px; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
main { width: 100%; max-width: 420px; background: var(--karte); border: 1px solid var(--rand); border-radius: 16px; padding: 28px 24px; box-shadow: 0 8px 30px rgba(0,0,0,.06); }
h1 { margin: 0 0 4px; font-size: 1.6rem; }
p.leise { margin: 0 0 22px; color: var(--leise); }
a.knopf, button { display: block; width: 100%; text-align: center; padding: 14px 16px; border-radius: 10px; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; }
a.knopf { background: var(--akzent); color: #fff; border: 0; }
button { background: transparent; color: var(--akzent); border: 1.5px solid var(--akzent); margin-top: 12px; }
label { display: block; font-size: .9rem; color: var(--leise); margin: 12px 0 4px; }
input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--rand); background: transparent; color: var(--text); font: inherit; }
details { margin-top: 20px; border-top: 1px solid var(--rand); padding-top: 14px; }
summary { cursor: pointer; color: var(--leise); }
.fehler { background: color-mix(in srgb, var(--fehler) 12%, transparent); color: var(--fehler); border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; }
.hinweis { font-size: .85rem; color: var(--leise); margin-top: 18px; }
`

export function anmeldeSeite(o: { iserv: boolean; notzugang: boolean; fehler: string; ziel: string; benutzer?: string }): string {
  const ziel = /^\/[a-zA-Z0-9/_-]*$/.test(o.ziel) ? o.ziel : '/'
  const fuerSchueler = ziel.startsWith('/s/')
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Schul-Apps – Anmelden</title>
<style>${STIL}</style>
</head>
<body>
<main>
  <h1>Schul-Apps</h1>
  <p class="leise">${fuerSchueler ? 'Anmelden, um den Test zu starten.' : 'Anmelden mit dem Zugang der Schule.'}</p>
  ${o.fehler ? `<div class="fehler" role="alert">${esc(o.fehler)}</div>` : ''}
  ${
    o.iserv
      ? `<a class="knopf" href="/auth/iserv?ziel=${encodeURIComponent(ziel)}">Mit IServ anmelden</a>
  <p class="hinweis">Das IServ-Passwort gibst du nur bei IServ ein – Schul-Apps sieht und speichert es nicht.</p>`
      : `<p class="hinweis">Die Anmeldung über IServ ist noch nicht freigeschaltet. Bis dahin geht es nur mit einem Testkonto.</p>`
  }
  <details${o.iserv && !o.benutzer ? '' : ' open'}>
    <summary>${o.notzugang ? 'Testkonto oder Notzugang' : 'Testkonto'}</summary>
    <form method="post" action="/auth/lokal">
      <input type="hidden" name="ziel" value="${esc(ziel)}">
      <label for="benutzer">Benutzername</label>
      <input id="benutzer" name="benutzer" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="${esc((o.benutzer ?? '').replace(/[^a-z0-9._-]/gi, '').slice(0, 64))}">
      <label for="passwort">Passwort</label>
      <input id="passwort" name="passwort" type="password" autocomplete="current-password" required>
      <button type="submit">Anmelden</button>
    </form>
  </details>
</main>
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
