import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { datenschutzHtml, elternHtml, type SeitenStand } from '../src/server/datenschutzSeiten'
import { KURZFASSUNG_SCHUELER, LEERE_ANGABEN } from '../src/shared/datenschutzInfo'
import { LOESCH_STANDARD } from '../src/server/loeschRegeln'
import { AUFSICHT_TAGE } from '../src/server/onlinetest'

/*
 * Nachprüfung des Schulträgers (23.10.2026): Datenschutzerklärung, Elternfassung, Kurzfassung und Hinweise müssen dem
 * Code entsprechen – eigene Zugänge (API ↔ privates Abo), Speicherung beim Anbieter, Sicherungen, Fristen, Empfänger,
 * Namensschutz, automatische Maßnahmen, Sprechtraining. Ohne KI, ohne Netz.
 */
const stand = (s: Partial<SeitenStand> = {}): SeitenStand => ({ angaben: { ...LEERE_ANGABEN }, schule: null, freigegeben: [], iserv: true, ...s })
const text = (h: string): string => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')

describe('Eigene Zugänge: API-Schlüssel ↔ privates Abo', () => {
  it('ohne Abo: Unterscheidung, kein „dieselben Schutzregeln", Prüfkasten', () => {
    const h = datenschutzHtml(stand())
    const t = text(h)
    expect(h).not.toMatch(/dieselben Schutzregeln/)
    expect(h).toContain('data-eigener-api')
    expect(h).toContain('data-eigenes-abo')
    expect(t).toMatch(/Vertrag zur Auftragsverarbeitung ist möglich/)
    expect(t).toMatch(/Verbraucherbedingungen/)
    expect(t).toMatch(/keinen Vertrag zur Auftragsverarbeitung/)
    expect(t).toMatch(/ChatGPT Plus\/Pro über Codex CLI/)
    expect(t).toMatch(/Claude Pro\/Max über Claude Code/)
    expect(h).toContain('data-kein-abo')
    expect(h).not.toContain('data-abo-genutzt')
    expect(t).toMatch(/Von der Schule zu prüfen: Die Schule entscheidet, ob Lehrkräfte eigene Zugänge nutzen dürfen/)
    expect(elternHtml(stand())).not.toMatch(/dieselben Schutzregeln/)
  })
  it('mit Abo einer Lehrkraft: genannt in Erklärung und Elternfassung', () => {
    const st = stand({ abos: ['openai'] })
    const h = datenschutzHtml(st)
    expect(h).toContain('data-abo-genutzt')
    expect(text(h)).toMatch(/Derzeit nutzen Lehrkräfte ein privates Abo am Server: ChatGPT Plus\/Pro \(Codex CLI\)/)
    expect(h).not.toContain('data-kein-abo')
    const e = text(elternHtml(st))
    expect(e).toMatch(/privaten Abo .* Verbraucherbedingungen – ohne Vertrag zur Auftragsverarbeitung/)
    expect(e).toMatch(/Derzeit nutzen Lehrkräfte ein privates Abo/)
  })
})

describe('Speicherung beim Anbieter', () => {
  it('store: false, Missbrauchsprotokolle bis 30 Tage, Realtime, andere Anbieter – keine falsche „keine Speicherung"', () => {
    const t = text(datenschutzHtml(stand()))
    expect(t).toMatch(/„store: false“/)
    expect(t).toMatch(/bis zu 30 Tage zur Erkennung von Missbrauch/)
    expect(t).toMatch(/Zero Data Retention/)
    expect(t).toMatch(/Im Sprechtraining verarbeitet OpenAI Stimme und Gesprächstext live/)
    expect(t).toMatch(/Für alle anderen Anbieter gelten deren Bedingungen/)
    expect(t).not.toMatch(/keine Speicherung beim Anbieter/i)
    expect(text(elternHtml(stand()))).toMatch(/bis zu 30 Tage zur Missbrauchserkennung/)
  })
})

describe('Sicherungen und Fristen', () => {
  it('Sicherungen: 14 Tage (auch vor Updates), 30 Archive in Dropbox, gelöschte Personen bleiben bis Fristende', () => {
    const t = text(datenschutzHtml(stand()))
    expect(t).toMatch(/nächtliche Kopien und Kopien vor einem Update 14 Tage auf dem Server/)
    expect(t).toMatch(/die neuesten 30 Archive im Dropbox-Ordner des Betreibers/)
    expect(t).toMatch(/Gelöschte Personen bleiben bis zum Ablauf dieser Fristen in den Sicherungen enthalten/)
    expect(t).toMatch(/Wird eine Sicherung zurückgespielt, löscht der Server die seit der Sicherung gelöschten Konten erneut/)
    expect(t).not.toMatch(/mit derselben Frist/)
    // Werte wie in den Skripten
    const nacht = readFileSync('deploy/strato/schul-apps-sicherung.sh', 'utf-8')
    expect(nacht).toMatch(/BEHALTEN_TAGE=14/)
    expect(nacht).toMatch(/'vor-\*\.db' -mtime \+\$BEHALTEN_TAGE -delete/)
    expect(readFileSync('scripts/sicherung-holen.ps1', 'utf-8')).toMatch(/\[int\]\$Behalten = 30/)
  })
  it('alle Fristen des Löschkonzepts, aus der Einstellung der Verwaltung', () => {
    const t = text(datenschutzHtml(stand()))
    expect(t).toMatch(new RegExp(`länger als ${LOESCH_STANDARD.abgangTage} Tage weder angemeldet`))
    expect(t).toMatch(/automatische Löschung läuft nur mit einer aktuellen IServ-Benutzerliste; sonst löscht die Schule die Konten von Hand/)
    expect(t).toMatch(/Konten von Lehrkräften werden nicht automatisch gelöscht/)
    expect(t).toMatch(/spätestens 365 Tage nach dem Ende ihrer Freigaben/)
    expect(t).toMatch(/Bewertungsspur .* wird mit dem Konto der Person bzw\. mit dem Test oder Reihenschritt gelöscht/)
    expect(t).toMatch(new RegExp(`Aufsichtsvermerke im Onlinetest .* bis ${AUFSICHT_TAGE} Tage nach dem Ende des Tests .* danach bleibt nur die Anzahl je Art`))
    expect(t).toMatch(/Prüfprotokoll des Servers: 180 Tage/)
    expect(t).toMatch(/Datenpannen \(Art\. 33 Abs\. 5 DSGVO\): keine automatische Löschung; die Schule prüft nach drei Jahren/)
    expect(t).toMatch(/Krisenhinweise: 30 Tage/)
    const anders = text(datenschutzHtml(stand({ loesch: { ...LOESCH_STANDARD, an: false, gastTage: 200, protokollTage: 90 } })))
    expect(anders).toMatch(/spätestens 200 Tage/)
    expect(anders).toMatch(/Prüfprotokoll des Servers: 90 Tage/)
    expect(anders).toMatch(/und ist derzeit abgeschaltet/)
  })
})

describe('Empfänger', () => {
  it('Moderation, Text-KI der Lehrkraft, Vertrauenspersonen, Dropbox; Sprechtraining je nach Einrichtung', () => {
    const ohne = datenschutzHtml(stand())
    const t = text(ohne)
    expect(t).toMatch(/Moderation von OpenAI/)
    expect(t).toMatch(/Text-KI der freigebenden Lehrkraft/)
    expect(t).toMatch(/Vertrauenspersonen/)
    expect(t).toMatch(/Dropbox, USA/)
    expect(t).toMatch(/Dropbox erhält keine lesbaren Daten/)
    // kein Widerspruch: ohne Gesprächs-KI ist das Sprechtraining als nicht nutzbar beschrieben
    expect(ohne).toContain('data-sprech-empfaenger="nein"')
    expect(t).toMatch(/Eigene Zugänge von Lehrkräften und das Sprechtraining \(beides unten\) können trotzdem Daten an KI-Dienste übermitteln/)
    const mit = datenschutzHtml(stand({ gespraech: true }))
    expect(mit).toContain('data-sprech-empfaenger="ja"')
    expect(text(mit)).toMatch(/Das Sprechtraining ist eingerichtet/)
    expect(text(elternHtml(stand()))).toMatch(/derzeit nicht eingerichtet/)
    expect(text(elternHtml(stand({ gespraech: true })))).not.toMatch(/derzeit nicht eingerichtet/)
  })
})

describe('Namen, automatische Maßnahmen', () => {
  it('Namen im Text ersetzt, Bilder und Stimme nicht', () => {
    for (const h of [datenschutzHtml(stand()), elternHtml(stand())]) {
      const t = text(h)
      expect(t).not.toMatch(/(erhält|erhalten) keine Namen/)
      expect(t).toMatch(/Bilder \(Fotos, Seitenbilder, Handschrift\) und die Stimme/)
      expect(t).toMatch(/keine Personen zu fotografieren und keine Namen zu nennen/)
    }
  })
  it('Noten durch die Lehrkraft; Sperre nach 3 Vorfällen und Lernpfad als automatische Maßnahmen', () => {
    const t = text(datenschutzHtml(stand()))
    expect(t).not.toMatch(/Entscheidungen trifft immer die Lehrkraft/)
    expect(t).toMatch(/Noten und Bewertungen legt immer die Lehrkraft fest/)
    expect(t).toMatch(/Nach drei Vorfällen .* pausiert das Training für die Person, bis die Lehrkraft es wieder freigibt/)
    expect(t).toMatch(/Schritt des Lernpfads .* als geschafft markieren/)
    expect(text(elternHtml(stand()))).not.toMatch(/Entscheidungen trifft immer die Lehrkraft/)
  })
})

describe('Kurzfassung für Lernende und Hinweis im Sprechtraining', () => {
  it('Aufsichtsvermerke, ein Satz 14 Tage, Krisenhinweise, Spiele zu zweit – höchstens 10 Einträge', () => {
    const k = KURZFASSUNG_SCHUELER.join(' ')
    expect(KURZFASSUNG_SCHUELER.length).toBeLessThanOrEqual(10)
    expect(k).toMatch(/Onlinetests merkt sich die App auch, wenn du die Seite verlässt/)
    expect(k).toMatch(/genau dieser Satz 14 Tage/)
    expect(k).toMatch(/vertraulichen Hinweis/)
    expect(k).toMatch(/Spielen zu zweit sehen die anderen deinen Kurznamen/)
    expect(k).not.toMatch(/Sie bekommt deinen Namen nicht/)
  })
  it('Gespraech.tsx: live an OpenAI, Moderation, Auswertung, ein Satz 14 Tage, Krise; Schätzung keine Note', () => {
    const g = readFileSync('src/renderer/src/modules/sprechen/Gespraech.tsx', 'utf-8').replace(/\s+/g, ' ')
    expect(g).toMatch(/live an den KI-Dienst OpenAI in den USA/)
    expect(g).toMatch(/von OpenAI automatisch auf unangemessene Inhalte geprüft/)
    expect(g).toMatch(/wertet eine KI den Text aus/)
    expect(g).toMatch(/genau dieser eine Satz 14 Tage für deine Lehrkraft aufbewahrt/)
    expect(g).toMatch(/vertraulichen Hinweis/)
    expect(g).toMatch(/Unverbindliche Schätzung, keine Note/)
    expect(g).not.toMatch(/das entspräche etwa der Note/)
  })
})

describe('KI-Kennzeichnung (Art. 50 KI-VO)', () => {
  it('Reiter „Abgaben": Impuls und Feedback mit KiMarke; Lernraum-Feedback mit KiMarke', () => {
    const r = readFileSync('src/renderer/src/modules/onlinetest/ReiheAnsicht.tsx', 'utf-8')
    const abschnitt = r.slice(r.indexOf('{a.impuls && ('), r.indexOf('{a.bewertung && ('))
    expect(abschnitt).toMatch(/<KiMarke art="impuls"/)
    expect(abschnitt).toMatch(/data-abgabe-feedback>\s*<KiMarke art="rueckmeldung"/)
    const l = readFileSync('src/renderer/src/modules/lernen/LernRaum.tsx', 'utf-8')
    expect(l.slice(l.indexOf('{s.feedback && ('), l.indexOf('Nächste Schritte'))).toMatch(/<KiMarke \/>/)
  })
})
