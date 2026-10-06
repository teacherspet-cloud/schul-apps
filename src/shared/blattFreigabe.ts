/**
 * Freigegebene Arbeitsblätter (Etappe 5, 02.10.2026): gemeinsame Teile für Lehrkraft-Seite,
 * Lernenden-Seite und Server.
 *
 *  - `BlattAufgabe`: was der Server je Aufgabe kennt (Anweisung für die Lernenden, Erwartung samt
 *    Lösung NUR für die KI).
 *  - `BlattFeld`: ein Eingabefeld, gemessen auf dem Gerät der Lernenden (Linie, Lücke, Kästchen …),
 *    mit der Aufgabennummer, zu der es gehört.
 *  - `blattAbgabeText`: macht aus den Feldern einen lesbaren Text je Aufgabe (für Bogen und KI).
 *  - `aufgabenFeedbackAnfrage`: kurzes Feedback zu EINER Aufgabe, ohne die Lösung zu verraten.
 */
import type { StructuredRequest } from './types'
import type { AbschriftBefund } from './abschrift'

export interface BlattAufgabe {
  nr: number
  /** Arbeitsanweisung (wie auf dem Blatt) */
  anweisung: string
  /** Erwartung und Lösung – nur für die KI, nie an die Lernenden */
  erwartung: string
  /** Freiwillig (Reihen-Schritt, 05.10.2026): zählt nicht für Freischalten, Fortschritt und Erfolg */
  freiwillig?: boolean
  /** Zahl der Hilfekarten zu dieser Aufgabe (06.10.2026) – digital über das ?-Symbol */
  hilfekarten?: number
}

export type BlattFeldArt = 'text' | 'zeilen' | 'luecke' | 'flaeche' | 'kreuz'

export interface BlattFeld {
  id: string
  /** Aufgabennummer (0 = außerhalb einer nummerierten Aufgabe) */
  nr: number
  art: BlattFeldArt | string
  /** Seite (0-basiert) */
  seite: number
}

/** Antworten je Aufgabe als Text: „Aufgabe 2 (Anweisung): 1) … 2) …" – leere Felder fallen weg */
export function blattAbgabeText(aufgaben: BlattAufgabe[], felder: BlattFeld[], antworten: Record<string, string>): string {
  const nummern = [...new Set([...aufgaben.map((a) => a.nr), ...felder.map((f) => f.nr)])].sort((x, y) => x - y)
  const teile: string[] = []
  for (const nr of nummern) {
    const eigene = felder.filter((f) => f.nr === nr)
    const eintraege = eigene
      .map((f, i) => {
        const w = (antworten[f.id] ?? '').trim()
        if (!w) return ''
        return f.art === 'kreuz' ? `Kästchen ${i + 1}: angekreuzt` : `${i + 1}) ${w}`
      })
      .filter(Boolean)
    if (!eintraege.length) continue
    const a = aufgaben.find((x) => x.nr === nr)
    teile.push(
      `${nr ? `Aufgabe ${nr}` : 'Weitere Einträge'}${a?.anweisung ? ` (${a.anweisung.replace(/\s+/g, ' ').slice(0, 300)})` : ''}:\n${eintraege.join('\n')}`
    )
  }
  return teile.join('\n\n')
}

export interface AufgabenFeedback {
  einschaetzung: 'sicher' | 'teilweise' | 'noch nicht'
  /** Zusammengefasst (ältere Anzeigen) */
  text: string
  gelungen?: string
  fehlt?: string
  schritt?: string
  /** Markierungen in der Antwort: wörtliches Zitat, Art, Kommentar */
  markierungen?: { zitat: string; art: 'lob' | 'fehler' | 'hinweis'; text: string; zeichen?: string }[]
}

/** Zusätze zur Anfrage (03.10.2026): Korrekturzeichen des Fachs, Befund zum Abschreiben */
export interface FeedbackZusatz {
  zeichen?: { zeichen: string; bedeutung: string }[]
  abschrift?: AbschriftBefund
  /** Die Aufgabe hat nur eine Zeichenfläche (Zeitleiste, Diagramm), keine Schreiblinien */
  nurZeichenflaeche?: boolean
  /** Materialtexte mit Zeilennummern, wie gedruckt (materialZeilen.ts) */
  material?: string
}

/**
 * Feedback zu EINER Aufgabe während der Bearbeitung – lernförderlich, ohne Note und ohne die Lösung
 * zu verraten. Deutlich ausführlicher seit 03.10.2026 (Befund der Lehrkraft: „sehr rudimentär"):
 * gelungen / fehlt / nächster Schritt mit Beispiel, Inhalt vor Form, Markierungen mit Zitat.
 */
export function aufgabenFeedbackAnfrage(a: BlattAufgabe, antwort: string, bilder: string[], sprache?: string, zusatz: FeedbackZusatz = {}): StructuredRequest {
  const zeichen = (zusatz.zeichen ?? []).filter((z) => z.zeichen && z.bedeutung && !/✓|\^/.test(z.zeichen))
  const ab = zusatz.abschrift
  const abgeschrieben = ab && ab.anteil >= 0.4
  return {
    system:
      'Du bist eine erfahrene, zugewandte Lehrkraft. Du gibst Lernenden während der Bearbeitung eines Arbeitsblatts ein genaues, lernförderliches Feedback zu EINER Aufgabe. Sprich die Person mit „du" an.',
    user: [
      'REGELN:',
      '- gelungen: was inhaltlich stimmt – konkret, mit kurzem Zitat aus der Antwort (leer, wenn nichts stimmt).',
      '- fehlt: was nach Aufgabenstellung und Erwartung fehlt oder nicht stimmt, sachlich genau benannt („Die zweite Ursache fehlt", „Das Datum passt nicht zum Ereignis") – ohne das richtige Ergebnis zu nennen.',
      '- schritt: EIN machbarer nächster Schritt mit Beispiel, Satzanfang oder Leitfrage, der zeigt, WIE es weitergeht („Lies Z. 5–9 noch einmal: Welche Folge nennt der Autor? Beginne mit: Eine Folge war …").',
      '- INHALT VOR FORM: Prüfe, ob der Operator erfüllt ist („nenne" = Stichpunkte genügen; „erkläre", „beschreibe", „beurteile" = Zusammenhänge). Bemängle die Form (Fließtext, Stichpunkte) NUR, wenn die Aufgabe sie ausdrücklich verlangt.',
      '- Keine Allgemeinplätze („Schau noch einmal in die Quelle", „Achte auf Genauigkeit") ohne zu sagen, WORAUF genau.',
      '- markierungen: Stellen der Antwort mit wörtlichem Zitat (1–8 Wörter, genau wie geschrieben): art „lob" für Gelungenes, „fehler" für Falsches, „hinweis" für Unvollständiges; text = kurzer Randkommentar ohne die Lösung. Inhaltlich 1–6 Stellen.',
      '- SPRACHE WIE IN EINER KORRIGIERTEN ARBEIT: Markiere JEDEN sprachlichen Fehler einzeln (Rechtschreibung, Zeichensetzung, Grammatik, Satzbau, Ausdruck …) als eigene Markierung mit art „fehler", dem Korrekturzeichen im Feld „zeichen" und als Zitat genau das fehlerhafte Wort bzw. die kurze Wortgruppe; text = kurz, was falsch ist (z. B. „das/dass", „Komma vor dem Nebensatz"), ohne die ganze Verbesserung vorzuschreiben. Höchstens 15 Sprachmarkierungen. Inhaltliche Markierungen: „zeichen" leer oder „Inh".',
      zeichen.length ? `- Korrekturzeichen (nur diese verwenden): ${zeichen.map((z) => `${z.zeichen} = ${z.bedeutung}`).join('; ')}.` : '',
      '- EIGENE LEISTUNG: Wörtlich aus dem Material Übernommenes ist KEINE Bearbeitung von Operatoren wie „fasse zusammen", „beschreibe", „erkläre", „ordne ein", „beurteile". Lobe Abgeschriebenes nicht als gelungen; benenne es unter „fehlt" und zeige im nächsten Schritt, wie man in eigenen Worten verdichtet.',
      zusatz.nurZeichenflaeche
        ? '- ANTWORTFORM: Diese Aufgabe hat nur eine Zeichenfläche (z. B. Zeitleiste) und KEINE Schreiblinien. Beurteile das Eintragen/Zuordnen/Zeichnen. Verlangt die Anweisung zusätzlich eine Erklärung, bemängle deren Fehlen NICHT – dafür war kein Platz vorgesehen.'
        : '',
      abgeschrieben
        ? `- BEFUND (automatisch gezählt, verlässlich): ${Math.round(ab.anteil * 100)} % der Antwort stehen wörtlich im Material des Blatts (längste übernommene Stelle: ${ab.laengste} Wörter). Behandle das als Abschrift: einschaetzung höchstens „teilweise", ab 70 % „noch nicht"; sage das freundlich, aber klar.`
        : '',
      '- Verrate die Lösung NICHT – weder wörtlich noch umschrieben. Keine Note, keine Punkte.',
      '- einschaetzung: „sicher" = alles richtig, „teilweise" = Ansätze richtig, „noch nicht" = überwiegend falsch oder leer.',
      sprache && sprache !== 'de' ? `- Schreibe das Feedback auf Deutsch; Zitate aus der Antwort bleiben in der Originalsprache (${sprache}).` : '',
      bilder.length
        ? '- Mit dem Stift Eingetragenes, Textkästchen und Linien stehen auf den beigefügten Seitenbildern; beziehe nur ein, was zu dieser Aufgabe gehört.'
        : '',
      zusatz.material
        ? `${'MATERIAL DES BLATTS MIT ZEILENNUMMERN (genau so gedruckt; verbindlich für jede Zeilenangabe – prüfe Zeilenangaben und Belege der Person NUR hieran; was du hier nicht eindeutig widerlegen kannst, bemängelst du nicht; nicht Teil der Antwort):'}\n${zusatz.material}`
        : '',
      `AUFGABE ${a.nr}: ${a.anweisung}`,
      `ERWARTUNG UND LÖSUNG (nur für dich, nicht verraten):\n${a.erwartung}`,
      'ANTWORT DER PERSON (zwischen <<< und >>>):',
      `<<<\n${antwort.trim() || '(nur handschriftlich bzw. auf dem Blatt eingezeichnet, siehe Bild)'}\n>>>`
    ]
      .filter(Boolean)
      .join('\n'),
    ...(bilder.length ? { images: bilder.slice(0, 4) } : {}),
    schemaName: 'blatt_aufgabe_feedback',
    schema: {
      type: 'object',
      properties: {
        einschaetzung: { type: 'string', enum: ['sicher', 'teilweise', 'noch nicht'] },
        gelungen: { type: 'string' },
        fehlt: { type: 'string' },
        schritt: { type: 'string' },
        markierungen: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              zitat: { type: 'string' },
              art: { type: 'string', enum: ['lob', 'fehler', 'hinweis'] },
              text: { type: 'string' },
              zeichen: { type: 'string' }
            },
            required: ['zitat', 'art', 'text', 'zeichen'],
            additionalProperties: false
          }
        }
      },
      required: ['einschaetzung', 'gelungen', 'fehlt', 'schritt', 'markierungen'],
      additionalProperties: false
    }
  }
}

export function aufgabenFeedbackAus(roh: unknown): AufgabenFeedback {
  const r = (roh ?? {}) as Record<string, unknown>
  const e = String(r.einschaetzung ?? '')
  const t = (x: unknown, n = 600): string =>
    String(x ?? '')
      .trim()
      .slice(0, n)
  const gelungen = t(r.gelungen)
  const fehlt = t(r.fehlt)
  const schritt = t(r.schritt)
  const markierungen = (Array.isArray(r.markierungen) ? r.markierungen : [])
    .map((m) => (m ?? {}) as Record<string, unknown>)
    .map((m) => ({
      zitat: t(m.zitat, 120),
      art: (['lob', 'fehler', 'hinweis'].includes(String(m.art)) ? m.art : 'hinweis') as 'lob' | 'fehler' | 'hinweis',
      text: t(m.text, 240),
      zeichen: t(m.zeichen, 6)
    }))
    .filter((m) => m.zitat && m.text)
    .map(({ zeichen, ...m }) => (zeichen && zeichen !== '-' ? { ...m, zeichen } : m))
    .slice(0, 24)
  // Ältere Antworten (nur „text") bleiben lesbar
  const text =
    t(r.text, 1200) ||
    [gelungen && `Gelungen: ${gelungen}`, fehlt && `Noch offen: ${fehlt}`, schritt && `Nächster Schritt: ${schritt}`].filter(Boolean).join('\n')
  return {
    einschaetzung: e === 'sicher' || e === 'teilweise' ? e : 'noch nicht',
    text,
    ...(gelungen ? { gelungen } : {}),
    ...(fehlt ? { fehlt } : {}),
    ...(schritt ? { schritt } : {}),
    ...(markierungen.length ? { markierungen } : {})
  }
}

/*
 * Schrittweise Freischaltung und Ampel (05.10.2026, Wunsch der Lehrkraft): „Erst wenn ein Schüler eine
 * Aufgabe teilweise treffend erledigt hat (KI-Feedback oder Lehrerfreigabe), wird die nächste Aufgabe
 * angezeigt. Für Schüler ist links neben der Aufgabe eine Ampel (rot = nicht bearbeitet, gelb = teilweise
 * treffend erledigt, grün = treffend erledigt)." Merkkästen auf Wunsch erst nach vollständiger Bearbeitung.
 * Server (Sperre, Lehrkraft-Ansicht) und Schüleransicht rechnen mit denselben Funktionen.
 */
export type Ampel = 'rot' | 'gelb' | 'gruen'

/** Feedback-Verlauf je Aufgabe, wie er gespeichert wird */
export type AufgabenVerlauf = Record<string, { einschaetzung: string }[] | undefined>

/** Ampel einer Aufgabe: das BESTE Urteil zählt (Fortschritt geht nicht verloren); Freigabe der Lehrkraft = mindestens gelb */
export function ampelVon(verlauf: { einschaetzung: string }[] | undefined, vonLehrkraft = false): Ampel {
  const urteile = (verlauf ?? []).map((v) => v.einschaetzung)
  if (urteile.includes('sicher')) return 'gruen'
  if (urteile.includes('teilweise') || vonLehrkraft) return 'gelb'
  return 'rot'
}

/**
 * Bis zu welcher Aufgabe (Nummer, einschließlich) ist das Blatt sichtbar? Die erste immer; jede weitere,
 * sobald die vorige mindestens gelb ist. `nummern` in Blattreihenfolge. Ohne Schrittweise: alle.
 */
export function sichtbarBis(nummern: number[], verlauf: AufgabenVerlauf, freigeschaltet: number[], schrittweise: boolean): number {
  const liste = [...nummern].sort((a, b) => a - b)
  if (!schrittweise || !liste.length) return Number.POSITIVE_INFINITY
  for (let i = 0; i < liste.length - 1; i++) {
    if (ampelVon(verlauf[String(liste[i])], freigeschaltet.includes(liste[i])) === 'rot') return liste[i]
  }
  // Keine offene mehr: alles sichtbar (auch freiwillige Aufgaben nach der letzten, die hier nicht mitzählen)
  return Number.POSITIVE_INFINITY
}

/**
 * „Vollständig bearbeitet" (Merkkästen erscheinen): ALLE Aufgaben mindestens gelb. Einreichen allein genügt
 * nicht (05.10.2026, Entscheidung der Lehrkraft).
 */
export function vollstaendigBearbeitet(nummern: number[], verlauf: AufgabenVerlauf, freigeschaltet: number[]): boolean {
  return nummern.length > 0 && nummern.every((nr) => ampelVon(verlauf[String(nr)], freigeschaltet.includes(nr)) !== 'rot')
}
