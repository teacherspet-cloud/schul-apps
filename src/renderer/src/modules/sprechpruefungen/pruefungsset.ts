/**
 * Druckbares Prüfungsset (19.10.2026, App „Sprechprüfungen", abgestimmt): für die ECHTE Sprechprüfung eines Paares –
 * Prüferblatt (Ablauf, Zeiten, Interviewfragen, Impulse), Kandidatenkarten A und B (Bild bzw. Rollen-/Diskussionskarte)
 * und je ein Bewertungsbogen (Sprechprüfung anstelle einer Klassenarbeit: 4 Kriterien je 0–5 + Gesamteindruck × 2 =
 * 30 Punkte, Notenschlüssel Sek I bzw. Notenpunkte). Gedruckt über ein unsichtbares Rahmenfenster (Browser und Exe).
 */
import type { BildKarte, DialogKarte, InterviewKarte } from '@shared/sprechen/karten'
import { KRITERIEN } from '@shared/sprechen/kriterien'
import { minutenJeTeil, type Niveau } from '@shared/sprechen/niveaus'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface PruefungsSet {
  fach: string
  jahrgang: number
  niveau: Niveau
  interview?: InterviewKarte
  monologA?: BildKarte
  monologB?: BildKarte
  dialog?: DialogKarte
  /** Bildadresse zu einer Datei im Pool */
  bildUrl: (datei: string) => string
}

function bogen(kandidat: string, oberstufe: boolean): string {
  const zeilen = KRITERIEN.filter((k) => k.id !== 'gesamt')
    .map((k) => `<tr><td><b>${esc(k.name)}</b><div class="klein">5: ${esc(k.stufen[5])}<br>3: ${esc(k.stufen[3])}<br>1: ${esc(k.stufen[1])}</div></td><td class="kreuz">0 1 2 3 4 5</td></tr>`)
    .join('')
  const ges = KRITERIEN.find((k) => k.id === 'gesamt')!
  return `<section class="seite"><h2>Bewertungsbogen – Kandidat/in ${kandidat}</h2>
<p>Name: ____________________ Datum: __________ Prüfer/in: __________ Protokollant/in: __________</p>
<h3>A. Protokollant/in (je 0–5)</h3><table>${zeilen}</table>
<h3>B. Prüfer/in – Gesamteindruck (0–5) × 2</h3><table><tr><td><div class="klein">5: ${esc(ges.stufen[5])}<br>3: ${esc(ges.stufen[3])}<br>1: ${esc(ges.stufen[1])}</div></td><td class="kreuz">0 1 2 3 4 5</td></tr></table>
<p>A: ____ / 20 &nbsp; B: ____ × 2 = ____ / 10 &nbsp; <b>Summe: ____ / 30</b> &nbsp; ${oberstufe ? 'Notenpunkte' : 'Note'}: ____</p>
<p class="klein">${
    oberstufe
      ? 'Notenpunkte: 15 = 30 · 14 = 29 · 13 = 28 · 12 = 27 · 11 = 26–25 · 10 = 24–23 · 9 = 22 · 8 = 21–20 · 7 = 19–18 · 6 = 17 · 5 = 16 · 4 = 15–14 · 3 = 13–12 · 2 = 11–9 · 1 = 8–6 · 0 = 5–0'
      : 'Notenschlüssel: 1 = 30–28 · 2 = 27–23 · 3 = 22–18 · 4 = 17–14 · 5 = 13–6 · 6 = 5–0'
  }</p><p>Bemerkungen:</p><div class="linien"></div></section>`
}

export function pruefungsSetHtml(s: PruefungsSet): string {
  const oberstufe = s.jahrgang >= 11
  const m = minutenJeTeil(s.niveau, oberstufe)
  const bild = (k?: BildKarte): string =>
    k
      ? `<h3>${esc(k.titel)}</h3>${k.bilder.map((b) => `<img src="${esc(s.bildUrl(b))}" alt="">`).join('')}<ul>${k.leitfragen.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
      : '<p class="klein">(keine Bildkarte gewählt)</p>'
  const dialogKarte = (k: DialogKarte, kandidat: 'A' | 'B'): string =>
    `<h3>${esc(k.titel)} – Partner ${kandidat}</h3><p>${esc(k.situation)}</p>${
      k.form === 'infogap' && kandidat === 'B' ? `<p><b>Info:</b> ${esc(k.rolleKi)}</p>` : `<p><i>${esc(kandidat === 'A' ? k.rolleSchueler : k.rolleKi)}</i></p>`
    }<ul>${k.punkte.map((p) => `<li>${esc(p)}</li>`).join('')}</ul><p><b>${esc(k.ziel)}</b></p>`
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Prüfungsset ${esc(s.fach)} Jg ${s.jahrgang}</title><style>
body{font-family:system-ui,Arial,sans-serif;font-size:11pt;color:#111;margin:0}
.seite{page-break-after:always;padding:14mm 16mm}
h1{font-size:16pt;margin:0 0 6px} h2{font-size:14pt;margin:0 0 6px} h3{font-size:12pt;margin:10px 0 4px}
table{width:100%;border-collapse:collapse} td{border:1px solid #888;padding:5px;vertical-align:top} .kreuz{width:120px;text-align:center;letter-spacing:6px;font-weight:700}
.klein{font-size:8.5pt;color:#333} img{max-width:48%;max-height:80mm;margin:4px;border-radius:4px} .linien{height:30mm;border-bottom:1px solid #888}
.karte{border:2px solid #222;border-radius:8px;padding:8mm;margin-bottom:8mm}
</style></head><body>
<section class="seite"><h1>Sprechprüfung ${esc(s.fach)} – Jahrgang ${s.jahrgang} (GER ${s.niveau})</h1>
<p class="klein">Ablauf für zwei Prüflinge, ohne Vorbereitungszeit. Prüfer/in greift nur nach längerer Pause (15–30 s) ein.</p>
<h2>Teil 1 – Interview (je ca. ${m.interview} Min.)</h2>${
    s.interview ? `<p><b>${esc(s.interview.thema)}</b></p><ol>${s.interview.fragen.map((f) => `<li>${esc(f)}</li>`).join('')}</ol>` : '<p class="klein">(kein Interview-Set gewählt)</p>'
  }
<h2>Teil 2 – Monolog (je ca. ${m.monolog} Min.)</h2><p class="klein">A: ${esc(s.monologA?.titel ?? '–')} · B: ${esc(s.monologB?.titel ?? '–')}</p>
${s.monologA ? `<p class="klein">Impulse A: ${esc(s.monologA.leitfragen.join(' · '))}</p>` : ''}${s.monologB ? `<p class="klein">Impulse B: ${esc(s.monologB.leitfragen.join(' · '))}</p>` : ''}
<h2>Teil 3 – Dialog (ca. ${m.dialog * 2} Min.)</h2>${
    s.dialog ? `<p><b>${esc(s.dialog.titel)}</b>: ${esc(s.dialog.situation)}</p><p class="klein">Ziel: ${esc(s.dialog.ziel)}</p>` : '<p class="klein">(keine Dialogkarte gewählt)</p>'
  }</section>
<section class="seite"><h1>Kandidat/in A</h1><div class="karte">${bild(s.monologA)}</div>${s.dialog ? `<div class="karte">${dialogKarte(s.dialog, 'A')}</div>` : ''}</section>
<section class="seite"><h1>Kandidat/in B</h1><div class="karte">${bild(s.monologB)}</div>${s.dialog ? `<div class="karte">${dialogKarte(s.dialog, 'B')}</div>` : ''}</section>
${bogen('A', oberstufe)}${bogen('B', oberstufe)}
</body></html>`
}

/** Über ein unsichtbares Rahmenfenster drucken (wartet auf die Bilder) */
export function drucken(html: string): void {
  const f = document.createElement('iframe')
  f.style.position = 'fixed'
  f.style.width = '0'
  f.style.height = '0'
  f.style.border = '0'
  document.body.appendChild(f)
  const doc = f.contentDocument!
  doc.open()
  doc.write(html)
  doc.close()
  const los = (): void => {
    f.contentWindow?.focus()
    f.contentWindow?.print()
    setTimeout(() => f.remove(), 60_000)
  }
  const bilder = [...doc.images]
  if (!bilder.length) setTimeout(los, 200)
  else Promise.all(bilder.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => ((i.onload = r), (i.onerror = r)))))).then(() => setTimeout(los, 100))
}
