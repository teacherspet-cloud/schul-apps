/**
 * Gliedert den „Hinweis der KI" (`meta.teacherNote`) in lesbare Gruppen.
 *
 * Befund der Lehrkraft (26.09.2026): Der Hinweis war EIN Absatz aus Planungsnotiz,
 * Quellenprotokoll, Kürzungsprotokoll und Quellenwarnung – „unübersichtlich und überfrachtet".
 * Der Text entsteht an vier Stellen (Gliederung der KI, `generate.ts` mit dem Kürzungs-
 * protokoll, `finish.ts` mit Quellen- und Bilderprüfung), die ihn nur aneinanderhängten.
 *
 * Gespeichert bleibt weiterhin EIN String – auch alte Blätter haben nur den. Deshalb wird
 * hier nicht nur an Zeilenumbrüchen getrennt (so schreiben die Erzeuger seit 26.09.2026),
 * sondern auch an den bekannten Satzanfängen der Protokollzeilen, damit ein früher mit
 * Leerzeichen zusammengeklebter Hinweis genauso aufgeht.
 *
 * Ergebnis: je Thema eine Gruppe mit Überschrift, einer Zeile zum Stand, wenigen Stichpunkten
 * und eingeklappten Einzelheiten (Auslassungen, Ergänzungen). Die freie Notiz der KI zum
 * Blatt bleibt im Wortlaut stehen.
 */

export type HinweisArt = 'blatt' | 'quelle' | 'quellen' | 'medien' | 'bilder'

export interface HinweisGruppe {
  art: HinweisArt
  titel: string
  /** Eine Zeile zum Stand, z. B. „Wortlaut gegen die Fundstelle geprüft" */
  stand?: string
  /** Etwas verlangt Aufmerksamkeit vor dem Einsatz */
  warnung: boolean
  punkte: string[]
  /** Einzelheiten, eingeklappt: Auslassungen, Ergänzungen */
  details: string[]
}

/** Satzanfänge der Protokollzeilen – an ihnen wird ein zusammengeklebter Hinweis getrennt. */
const ANFAENGE =
  /(?:Originalquellen? [„"(]|Vorbemerkung der Lehrkraft:|Gewählt:|Umfang:|Der Text beginnt|Der Text endet|Auslassung \d+:|Ergänzung in eckigen Klammern:|ACHTUNG:|Bilder:|Bilder konnten|Ton-\/Filmquellen:)/

/** Zerlegt den gespeicherten Hinweis in einzelne Aussagen. */
export function hinweisZeilen(note: string): string[] {
  return note
    .split('\n')
    .flatMap((z) => z.split(new RegExp(`\\s+(?=${ANFAENGE.source})`)))
    .map((z) => z.trim())
    // Leere Klammer-Ergänzung „" (Fehler früherer Fassungen) fällt weg
    .filter((z) => z && !/^Ergänzung in eckigen Klammern:\s*[„"]\s*["“]?\.?$/.test(z))
}

const ohnePunkt = (s: string): string => s.replace(/\.$/, '')

/** Der Text zwischen „ und " – Titel, Vorbemerkung, Ergänzung. */
const zitat = (s: string): string => {
  const m = /[„"]([\s\S]*?)["“]\s*:?/.exec(s)
  return m ? m[1].trim() : s
}

export function gliedereHinweise(note: string | undefined): HinweisGruppe[] {
  const zeilen = hinweisZeilen(note ?? '')
  if (!zeilen.length) return []

  const blatt: HinweisGruppe = { art: 'blatt', titel: 'Zum Blatt', warnung: false, punkte: [], details: [] }
  const quelle: HinweisGruppe = { art: 'quelle', titel: 'Originalquelle', warnung: false, punkte: [], details: [] }
  const quellen: HinweisGruppe = { art: 'quellen', titel: 'Quellen aus dem Gedächtnis der KI', warnung: true, punkte: [], details: [] }
  const medien: HinweisGruppe = { art: 'medien', titel: 'Ton- und Filmquellen', warnung: false, punkte: [], details: [] }
  const bilder: HinweisGruppe = { art: 'bilder', titel: 'Bilder', warnung: false, punkte: [], details: [] }

  let anfangFehlt = false
  let schlussFehlt = false
  let auslassungen = 0
  let ausgelasseneWoerter = 0
  let ergaenzungen = 0

  for (const z of zeilen) {
    let m: RegExpExecArray | null
    if ((m = /^Originalquelle [„"](.+?)["“]\s*:\s*(.*)$/.exec(z))) {
      quelle.titel = `Originalquelle: ${m[1]}`
      if (/^Wortlaut gegen die Fundstelle gepr/.test(m[2])) quelle.stand = 'Wortlaut gegen die Fundstelle geprüft.'
      else {
        quelle.stand = 'Beim Abgleich mit der Fundstelle gab es Abweichungen – vor dem Einsatz mit dem Original vergleichen.'
        quelle.warnung = true
      }
    } else if ((m = /^Gewählt:\s*(.+)$/.exec(z))) {
      // Alte Fassung: „Gewählt: Titel (2209 Wörter im Original, 238 auf dem Blatt)." – die Zahlen stehen unter „Umfang"
      const titel = ohnePunkt(m[1]).replace(/\s*\(\d+ Wörter im Original, \d+ auf dem Blatt\)$/, '')
      if (quelle.titel === 'Originalquelle') quelle.titel = `Originalquelle: ${titel}`
    } else if ((m = /^Vorbemerkung der Lehrkraft:\s*(.+)$/.exec(z))) {
      quelle.punkte.push(`Vorbemerkung auf dem Blatt: „${zitat(m[1])}“`)
    } else if ((m = /^Umfang:\s*(\d+) von (\d+) Wörtern \((\d+) %[^)]*\)/.exec(z))) {
      quelle.punkte.unshift(`Auszug: ${m[1]} von ${m[2]} Wörtern (${m[3]} % des Originals)`)
    } else if (/^Der Text beginnt nicht am Anfang/.test(z)) anfangFehlt = true
    else if (/^Der Text endet vor dem Schluss/.test(z)) schlussFehlt = true
    else if ((m = /^Auslassung (\d+):\s*(\d+) Wörter ab (.+)$/.exec(z))) {
      auslassungen++
      ausgelasseneWoerter += Number(m[2])
      quelle.details.push(`Auslassung ${m[1]}: ${m[2]} Wörter ab ${m[3]}`)
    } else if ((m = /^Ergänzung in eckigen Klammern:\s*(.+)$/.exec(z))) {
      ergaenzungen++
      quelle.details.push(`Ergänzung in eckigen Klammern: „${zitat(m[1])}“`)
    } else if ((m = /^ACHTUNG:\s*(.+)$/.exec(z))) {
      quelle.warnung = true
      quelle.punkte.push(m[1])
    } else if ((m = /^Originalquellen \((\d+) Textquelle\(n\)\):/.exec(z))) {
      const n = Number(m[1])
      quellen.stand = n === 1 ? 'Eine Textquelle stammt aus dem Gedächtnis der KI.' : `${n} Textquellen stammen aus dem Gedächtnis der KI.`
      quellen.punkte.push('Wortlaut und Quellenangabe vor dem Einsatz prüfen – die Hinweise dazu stehen an den Bausteinen.')
    } else if ((m = /^Ton-\/Filmquellen:\s*(.+)$/.exec(z))) {
      medien.stand = m[1]
      medien.warnung = /nicht bestätigen|nachsehen/.test(m[1])
    } else if ((m = /^Bilder:\s*(.+)$/.exec(z))) {
      bilder.stand = m[1]
      bilder.warnung = /auszuwählen/.test(m[1])
    } else if ((m = /^Bilder konnten nicht automatisch gewählt werden:\s*(.+)$/.exec(z))) {
      bilder.stand = 'Bilder konnten nicht automatisch gewählt werden.'
      bilder.punkte.push(m[1])
      bilder.warnung = true
    } else blatt.punkte.push(z)
  }

  // Zusammenfassung der Kürzung – eine Zeile statt vieler
  if (anfangFehlt && schlussFehlt) quelle.punkte.push('Ausschnitt aus der Mitte: beginnt nicht am Anfang und endet vor dem Schluss des Originals.')
  else if (anfangFehlt) quelle.punkte.push('Beginnt nicht am Anfang des Originals.')
  else if (schlussFehlt) quelle.punkte.push('Endet vor dem Schluss des Originals.')
  if (auslassungen || ergaenzungen) {
    const teile: string[] = []
    if (auslassungen) teile.push(auslassungen === 1 ? `1 Auslassung (${ausgelasseneWoerter} Wörter)` : `${auslassungen} Auslassungen (${ausgelasseneWoerter} Wörter)`)
    if (ergaenzungen) teile.push(ergaenzungen === 1 ? '1 Ergänzung in eckigen Klammern' : `${ergaenzungen} Ergänzungen in eckigen Klammern`)
    quelle.punkte.push(`${teile.join(', ')} – Einzelheiten unten.`)
  }

  const hatInhalt = (g: HinweisGruppe): boolean => Boolean(g.stand || g.punkte.length || g.details.length)
  return [blatt, quelle, quellen, medien, bilder].filter(hatInhalt)
}
