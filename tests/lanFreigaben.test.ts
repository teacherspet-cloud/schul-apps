import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { beschneide, ERLAUBTE_KANAELE } from '../src/main/services/lanServer'

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
const hauptprozess = readFileSync(resolve(__dirname, '../src/main/index.ts'), 'utf8')
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
      { muster: /^ai:(install|login|subscription|test)/, warum: 'richtet KI-Zugänge ein' }
    ]
    for (const kanal of ERLAUBTE_KANAELE) {
      for (const v of verboten) {
        expect(v.muster.test(kanal), `„${kanal}" ist freigegeben, ${v.warum}`).toBe(false)
      }
    }
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
      'designs:save',
      'exams:save',
      'grammarTests:save',
      'kurztests:save',
      'library:save',
      'sheets:save',
      'tests:save',
      'textbooks:save'
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

  it('lässt die Bibliotheken lesen', () => {
    for (const k of ['sheets:list', 'exams:list', 'tests:list', 'kurztests:list', 'grammarTests:list']) {
      expect(ERLAUBTE_KANAELE, `${k} fehlt – die Bibliothek bliebe im Browser leer`).toContain(k)
    }
  })
})
