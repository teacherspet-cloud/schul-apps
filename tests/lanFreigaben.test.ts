import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { beschneide, erlaubteHerkunft, ERLAUBTE_KANAELE, istTailscaleAdresse } from '../src/main/services/lanServer'
import { gruppeVon, KANAELE_BILDER, KANAELE_HOERTEXTE, KANAELE_TEXTE, UEBER_REGISTER } from '../src/mobil/pcKi'
import { AUFTRAGS_KANAELE } from '../src/main/services/lanAuftraege'
import { REGISTER_KANAELE } from '../src/renderer/src/shared/netzAuftrag'

/*
 * Der Zugriff aus dem Netz arbeitet mit einer ERLAUBNISLISTE: Was dort nicht steht, wird
 * abgelehnt. Diese Tests halten beide Richtungen fest.
 *
 * Nach oben: Ein Kanal, den es gar nicht gibt, ist tote Last – und wenn ein vorhandener
 * Kanal umbenannt wird, fällt er still aus der Liste. Im Browser fehlte dann eine Funktion,
 * am Rechner liefe alles weiter, und es sähe nach einem Fehler der Oberfläche aus.
 *
 * Nach unten: Was gefährlich ist, darf nie versehentlich hineinrutschen. Der zweite Test
 * schlägt an, sobald jemand einen Schlüssel-, Datei- oder Löschaufruf freigibt.
 */
// Seit 29.09.2026 stehen die Aufrufe in main/kanaele.ts (gemeinsam für PC und iPad)
const hauptprozess = readFileSync(resolve(__dirname, '../src/main/kanaele.ts'), 'utf8')
const vorhandene = new Set([...hauptprozess.matchAll(/handle\('([^']+)'/g)].map((m) => m[1]))

describe('Freigaben für den Zugriff aus dem Netz', () => {
  it('gibt nur Aufrufe frei, die es wirklich gibt', () => {
    for (const kanal of ERLAUBTE_KANAELE) {
      expect(vorhandene, `„${kanal}" ist freigegeben, existiert aber nicht`).toContain(kanal)
    }
  })

  it('gibt nichts Gefährliches frei', () => {
    /*
     * Diese vier Gruppen sind der Grund für die ganze Erlaubnisliste:
     * Schlüssel schreiben, Dateien dieses Rechners, Material löschen, Einstellungen ändern.
     */
    const verboten = [
      { muster: /^lan:/, warum: 'stellt den Netzzugang selbst um' },
      { muster: /^files:(open|save|show|launch-file|choose-folder|save-in-folder|open-folder)$/, warum: 'öffnet Dialoge oder Ordner dieses Rechners' },
      { muster: /^export:pdf-in-folder$/, warum: 'schreibt in einen Ordner dieses Rechners' },
      { muster: /^audio:show$/, warum: 'öffnet den Explorer dieses Rechners' },
      { muster: /^secrets:set$/, warum: 'schreibt API-Schlüssel' },
      { muster: /:delete$/, warum: 'löscht gespeichertes Material' },
      { muster: /^export:print$/, warum: 'öffnet den Druckdialog dieses Rechners' },
      { muster: /^designs:delete$/, warum: 'löscht Designvorlagen' },
      // ai:subscription-status liest nur (Anzeige in der iPad-App, 30.09.2026) – alles andere am Abo richtet ein
      { muster: /^ai:(install|login|subscription-(?!status$)|test)/, warum: 'richtet KI-Zugänge ein' }
    ]
    for (const kanal of ERLAUBTE_KANAELE) {
      for (const v of verboten) {
        expect(v.muster.test(kanal), `„${kanal}" ist freigegeben, ${v.warum}`).toBe(false)
      }
    }
  })

  it('schneidet aus Einstellungen vom Gerät alles heraus, was den Rechner selbst betrifft', () => {
    // 27.09.2026: Der Pfad des KI-Programms wird per spawn gestartet – vom Tablet aus nicht setzbar
    const [rest] = beschneide('settings:set', [
      {
        lan: { pin: '1' },
        ai: { cliPaths: { codex: 'C:\\boese.exe' }, access: 'abo', imageAccess: 'abo', subscriptionAccepted: true, provider: 'openai' },
        material: { x: 1 }
      }
    ]) as [Record<string, unknown>]
    expect(rest.lan).toBeUndefined()
    expect(rest.material).toEqual({ x: 1 })
    expect(rest.ai).toEqual({ provider: 'openai' })
    expect(beschneide('settings:set', [{ ai: 'kaputt' }])).toEqual([{ ai: 'kaputt' }])
  })

  it('lässt die KI mit den Zugangsdaten des Rechners arbeiten', () => {
    /*
     * Ausdrücklicher Wunsch der Lehrkraft (23.09.2026): Vom Browser aus soll die KI mit den
     * in der App hinterlegten Zugangsdaten arbeiten. Genau so ist es gebaut – der Aufruf
     * läuft auf dem Rechner, der Schlüssel verlässt ihn nie. EINRICHTEN dagegen bleibt
     * gesperrt: Anmeldefenster und Installationen gehören an den Rechner.
     */
    for (const k of ['ai:structured', 'ai:image', 'ai:status', 'ai:models']) {
      expect(ERLAUBTE_KANAELE, `${k} fehlt – die KI ließe sich vom Gerät aus nicht nutzen`).toContain(k)
    }
    for (const k of ['ai:install', 'ai:login-start', 'ai:subscription-test']) {
      expect(ERLAUBTE_KANAELE, `${k} ist freigegeben, richtet aber Zugänge auf dem Rechner ein`).not.toContain(k)
    }
  })

  it('lässt jedes Programm speichern, aber keines löschen', () => {
    /*
     * Zuerst war nur `sheets:save` frei. Wer auf dem Tablet eine Klassenarbeit öffnete,
     * etwas änderte und speichern wollte, bekam eine Fehlermeldung – und hätte seine Arbeit
     * verloren. Ein gesperrtes Speichern verhindert nichts, es vernichtet Arbeit.
     * LÖSCHEN bleibt gesperrt: Das lässt sich nicht rückgängig machen.
     */
    const speichernd = ERLAUBTE_KANAELE.filter((k) => k.endsWith(':save')).sort()
    expect(speichernd).toEqual([
      'bewertungstabellen:save',
      'designs:save',
      'elternbriefe:save',
      'exams:save',
      'grammarTests:save',
      'kurztests:save',
      'library:save',
      // Rückmeldung (29.09.2026): Tabellenvorlagen und gemerkte Nachteilsausgleiche
      'nachteilsausgleiche:save',
      'rueckmeldungen:save',
      'sheets:save',
      // Tafelbilder (30.09.2026)
      'tafelbilder:save',
      'tests:save',
      'textbooks:save',
      // Verblisten je Lehrwerk-Band (30.09.2026)
      'verbLists:save'
    ])
  })

  it('lässt Schulname, Logo und Notenschlüssel vom Gerät aus einstellen', () => {
    // Ausdrücklicher Wunsch der Lehrkraft (23.09.2026)
    for (const k of ['settings:set', 'branding:set-logo', 'branding:remove-logo']) {
      expect(ERLAUBTE_KANAELE, `${k} fehlt – Schulname und Logo wären vom Gerät aus nicht änderbar`).toContain(k)
    }
  })

  it('lässt den Netzzugang selbst nicht über das Netz verstellen', () => {
    /*
     * `settings:set` trägt einen Teil-Datensatz. Darin steckt auch der Netzzugang. Ohne
     * diese Beschneidung könnte ein angemeldetes Gerät PIN und Port ändern – und dem
     * Rechner den Zugang unter den Füßen wegziehen.
     */
    const [patch] = beschneide('settings:set', [{ schoolName: 'Musterschule', lan: { port: 1234, pin: '000000' } }]) as [Record<string, unknown>]
    expect(patch.schoolName).toBe('Musterschule')
    expect(patch).not.toHaveProperty('lan')
  })

  it('lässt alles andere unverändert durch', () => {
    const args = [{ schoolName: 'Musterschule' }]
    expect(beschneide('settings:set', args)[0]).toEqual({ schoolName: 'Musterschule' })
    expect(beschneide('sheets:save', args)).toBe(args)
  })

  it('gibt alles frei, was die iPad-App mit „Abo über den PC" weiterreicht', () => {
    /*
     * Die iPad-App (mobil/pcKi.ts) schickt diese Aufrufe an den PC. Fehlte einer in der
     * Erlaubnisliste, scheiterte er auf dem iPad mit „nicht freigegeben" – etwa der Abbruch
     * eines Auftrags oder die Websuche mitten im Planen.
     */
    const weitergereicht = [...KANAELE_TEXTE, ...KANAELE_BILDER, ...KANAELE_HOERTEXTE, 'ai:cancel', 'ai:status', 'ai:subscription-status']
    for (const k of weitergereicht) expect(ERLAUBTE_KANAELE, `${k} fehlt – die iPad-App könnte ihn nicht an den PC weiterreichen`).toContain(k)
    // Einrichten bleibt am PC
    for (const k of ['ai:subscription-test', 'ai:subscription-image-test', 'ai:subscription-models', 'ai:login-start', 'ai:install', 'ai:test']) {
      expect(ERLAUBTE_KANAELE).not.toContain(k)
    }
    // Hörtexte über den PC: vertonen ja, den Explorer des PCs öffnen nie
    expect(gruppeVon('audio:speak')).toBe('hoertexte')
    expect(gruppeVon('audio:show')).toBeNull()
    expect(gruppeVon('audio:read')).toBeNull()
    expect(gruppeVon('secrets:set')).toBeNull()
  })

  it('erlaubt fremde Herkunft nur der iPad-App (CORS)', () => {
    for (const h of ['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'http://127.0.0.1:5188', 'https://localhost:3000']) {
      expect(erlaubteHerkunft(h), h).toBe(true)
    }
    for (const h of ['http://192.168.1.50', 'https://boese.example', 'http://localhost.boese.example', 'capacitor://localhost.example', 'null', '']) {
      expect(erlaubteHerkunft(h), h).toBe(false)
    }
  })

  it('erkennt Tailscale-Adressen (100.64.0.0/10)', () => {
    expect(istTailscaleAdresse('100.64.0.1')).toBe(true)
    expect(istTailscaleAdresse('100.101.102.103')).toBe(true)
    expect(istTailscaleAdresse('100.127.255.254')).toBe(true)
    expect(istTailscaleAdresse('100.128.0.1')).toBe(false)
    expect(istTailscaleAdresse('100.63.0.1')).toBe(false)
    expect(istTailscaleAdresse('192.168.1.24')).toBe(false)
  })

  it('lässt über das Auftragsregister nur lange, freigegebene Aufrufe laufen (30.09.2026)', () => {
    /*
     * Die Endpunkte /auftrag/… (Wiederanknüpfen nach Verbindungsabbruch) sind KEIN Umweg um die
     * Erlaubnisliste: Jeder dort startbare Kanal muss auch einzeln freigegeben sein – und iPad,
     * Browser und PC müssen dieselbe Liste kennen, sonst liefe eine Anfrage am Register vorbei.
     */
    for (const k of AUFTRAGS_KANAELE) expect(ERLAUBTE_KANAELE, `${k} startet als Auftrag, ist aber nicht freigegeben`).toContain(k)
    expect([...AUFTRAGS_KANAELE].sort()).toEqual(['ai:image', 'ai:structured', 'ai:websuche', 'audio:speak'])
    expect([...UEBER_REGISTER].sort()).toEqual([...AUFTRAGS_KANAELE].sort())
    expect([...REGISTER_KANAELE].sort()).toEqual([...AUFTRAGS_KANAELE].sort())
    // Der Abbruch bleibt ausdrücklich: ai:cancel bleibt frei
    expect(ERLAUBTE_KANAELE).toContain('ai:cancel')
  })

  it('lässt die Windows-Firewall-Freigabe nie über das Netz auslösen (30.09.2026)', () => {
    /*
     * Die Freigabe startet eine Adminabfrage und legt Firewall-Regeln an – das gehört an den
     * Rechner selbst. Beide Aufrufe existieren (Brücke), stehen aber in keiner Freigabeliste.
     */
    for (const k of ['lan:freigabe-status', 'lan:freigabe-einrichten']) {
      expect(vorhandene, `${k} fehlt in main/kanaele.ts`).toContain(k)
      expect(ERLAUBTE_KANAELE, `${k} darf aus dem Netz nicht erreichbar sein`).not.toContain(k)
      expect(AUFTRAGS_KANAELE).not.toContain(k)
      expect(gruppeVon(k)).toBeNull()
    }
  })

  it('lässt die Bibliotheken lesen', () => {
    for (const k of ['sheets:list', 'exams:list', 'tests:list', 'kurztests:list', 'grammarTests:list']) {
      expect(ERLAUBTE_KANAELE, `${k} fehlt – die Bibliothek bliebe im Browser leer`).toContain(k)
    }
  })
})
