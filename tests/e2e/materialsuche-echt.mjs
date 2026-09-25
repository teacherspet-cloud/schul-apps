// EINMALIGER Test der Materialsuche mit ECHTER KI (verbraucht Abo-Kontingent).
// Aufruf: node tests/e2e/materialsuche-echt.mjs
//
// Ausdrücklich freigegeben von der Lehrkraft am 24.09.2026: „probier es. sei gründlich, damit
// gutes originalmaterial zuverlässig gefunden wird."
//
// Geprüft wird die ganze Kette an drei Themen, die unterschiedlich schwer sind:
//  1. ein bestimmtes Werk (gezielte Suche muss greifen),
//  2. ein Sachthema ohne Werk (allgemeine Suche muss greifen),
//  3. ein deutscher Gebrauchstext für die Sprachmittlung (nur über das offene Netz zu finden).
//
// Gemessen wird nicht „kam etwas zurück", sondern: Lässt sich der Fund LADEN, und hält er der
// Qualitätsprüfung stand? Eine erfundene Adresse fällt genau hier durch.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const BERICHT = process.argv[2] ?? join(tmpdir(), 'materialsuche-echt.txt')

const PROBEN = [
  {
    name: 'Bestimmtes Werk (Deutsch, Jg. 12)',
    auftrag: [
      'Fach: Deutsch. Thema: Heinrich Heine, „Die Lore-Ley". Jahrgang: 12.',
      'Gesucht wird ein veröffentlichter Originaltext in Deutsch von etwa 300 Wörtern (länger ist erlaubt, er wird gekürzt).',
      'Suche zuerst allgemein nach Material zum Thema. Nach einem bestimmten Urheber oder Werktitel nur dann, wenn der Unterrichtsgegenstand selbst ein bestimmtes Werk ist.',
      'Nenne bis zu ACHT Fundstellen.'
    ].join('\n'),
    sprache: 'de',
    ziel: 200
  },
  {
    name: 'Sachthema ohne Werk (Politik, Jg. 12)',
    auftrag: [
      'Fach: Politik-Wirtschaft. Thema: Wohnungsmangel in deutschen Großstädten. Jahrgang: 12.',
      'Gesucht wird ein veröffentlichter Originaltext in Deutsch von etwa 700 Wörtern (länger ist erlaubt, er wird gekürzt).',
      'Geeignet sind Zeitungsartikel und Kommentare, Reden, Essays, Sachtexte, amtliche Veröffentlichungen und Beiträge von Bildungseinrichtungen – alles mit frei zugänglichem Volltext.',
      'Suche zuerst allgemein nach Material zum Thema. Bei einem Sachthema gibt es keinen Werktitel, nach dem sich suchen ließe.',
      'Nenne bis zu ACHT Fundstellen.'
    ].join('\n'),
    sprache: 'de',
    ziel: 700
  },
  {
    name: 'Wissenschaftliche Quelle (Biologie, Jg. 13)',
    auftrag: [
      'Fach: Biologie. Thema: Antibiotikaresistenz. Jahrgang: 13.',
      'Gesucht wird ein veröffentlichter Originaltext in Deutsch von etwa 900 Wörtern (länger ist erlaubt, er wird gekürzt).',
      'GEEIGNETE FUNDORTE (alles mit frei zugänglichem Volltext):',
      '- überregionale Tageszeitungen und ihre Online-Ausgaben (Kommentar, Reportage, Hintergrundbericht)',
      '- Nachrichtenseiten des öffentlich-rechtlichen Rundfunks, auch Manuskripte gesendeter Beiträge',
      '- Wissenschaftsportale von Universitäten, Max-Planck- und Helmholtz-Instituten',
      '- frei zugängliche Fachaufsätze (Open Access) und ihre allgemein verständlichen Zusammenfassungen',
      '- Veröffentlichungen von Fachgesellschaften, Umwelt- und Gesundheitsbehörden',
      '- Datensätze und Berichte mit Zahlenmaterial (Statistikämter, Umweltbundesamt, Our World in Data)',
      'Nenne bis zu ACHT Fundstellen.'
    ].join('\n'),
    sprache: 'de',
    ziel: 900
  },
  {
    name: 'Sprachmittlung: deutscher Gebrauchstext (Englisch, Jg. 12)',
    auftrag: [
      'Fach: Englisch. Thema: Schüleraustausch und Auslandsaufenthalt. Jahrgang: 12.',
      'Gesucht wird ein veröffentlichter Originaltext in DEUTSCH von etwa 500 Wörtern.',
      'Es geht um eine Sprachmittlungsaufgabe: Der Ausgangstext ist ein deutscher Gebrauchstext (Informationsseite, Ratgeber, Behörden- oder Schulinformation), den Lernende später auf Englisch wiedergeben.',
      'Nenne bis zu ACHT Fundstellen.'
    ].join('\n'),
    sprache: 'de',
    ziel: 500
  }
]

const userData = mkdtempSync(join(tmpdir(), 'schulapps-matecht-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await warteAufOberflaeche(page)

/*
 * Der Abo-Zugang steht im Benutzerordner des Anbieters, nicht in dem der App – ein frischer
 * Ordner verliert also nur die App-Einstellungen. Die müssen hier gesetzt werden.
 */
await page.evaluate(() =>
  window.api.settings.set({
    ai: {
      textProvider: 'openai',
      access: { openai: 'subscription', anthropic: 'api', google: 'api' },
      // Die Zustimmung zu den Nutzungsbedingungen hat die Lehrkraft in ihrem echten Profil
      // laengst gegeben; im frischen Testprofil wird derselbe Zustand hergestellt.
      subscriptionAccepted: { openai: true, anthropic: false, google: false }
    }
  })
)
const zugang = await page.evaluate(() => window.api.ai.status())
console.log(`Zugang: ${zugang.provider ?? '?'} · bereit: ${zugang.ready ?? zugang.hasKey ?? '?'}`)

const zeilen = []
const sag = (t) => {
  zeilen.push(t)
  console.log(t)
}

let gesamtBrauchbar = 0
for (const probe of PROBEN) {
  sag(`\n═══ ${probe.name} ═══`)
  const t0 = Date.now()
  const funde = await page
    .evaluate((auftrag) => window.api.ai.websuche(auftrag), probe.auftrag)
    .catch((e) => {
      sag(`  FEHLER bei der Websuche: ${e.message}`)
      return []
    })
  sag(`  ${funde.length} Fundstellen in ${Math.round((Date.now() - t0) / 1000)} s`)

  let brauchbar = 0
  for (const f of funde) {
    const geprueft = await page.evaluate(
      async ({ url, ziel, sprache }) => {
        const quelle = await window.api.sources.laden(url)
        if (quelle.fehler) return { fehler: quelle.fehler }
        const b = window.__selftest.textQualitaet(quelle.text, { zielWortzahl: ziel, jahrgang: 12, sprache })
        return { woerter: quelle.wortzahl, ausschluss: b.ausschluss, rang: b.rang, stufe: Math.round(b.befund.wstf) }
      },
      { url: f.url, ziel: probe.ziel, sprache: probe.sprache }
    )
    if (geprueft.fehler) {
      sag(`  ✗ ${f.titel} — NICHT LADBAR: ${geprueft.fehler}`)
      sag(`      ${f.url}`)
    } else if (geprueft.ausschluss.length) {
      sag(`  ✗ ${f.titel} — verworfen: ${geprueft.ausschluss.join(', ')} (${geprueft.woerter} Wörter)`)
      sag(`      ${f.url}`)
    } else {
      brauchbar++
      sag(`  ✓ ${f.titel}${f.urheber ? ` — ${f.urheber}` : ''}`)
      sag(`      ${geprueft.woerter} Wörter · sprachlich etwa Klasse ${geprueft.stufe} · Rang ${geprueft.rang}`)
      sag(`      ${f.url}`)
    }
  }
  sag(`  → ${brauchbar} von ${funde.length} brauchbar`)
  gesamtBrauchbar += brauchbar
}

sag(`\n═══ ERGEBNIS: ${gesamtBrauchbar} brauchbare Quellen über alle drei Proben ═══`)
writeFileSync(BERICHT, zeilen.join('\n'), 'utf8')
await app.close()
rmSync(userData, { recursive: true, force: true })
process.exit(gesamtBrauchbar > 0 ? 0 : 1)
