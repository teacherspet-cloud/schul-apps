/**
 * „Mit KI beheben" – der gemeinsame Teil ohne Oberfläche (Paket 12, Wunsch der Lehrkraft vom
 * 26.09.2026).
 *
 * Bis dahin meldeten die Prüfungen nur: „Es fehlt der Mustertext", „Die Aufgabe verweist auf
 * M3", „Anrede prüfen". Die Lehrkraft musste den Baustein selbst suchen, überarbeiten lassen
 * und dabei den Hinweis abschreiben. Jetzt steht an jedem behebbaren Hinweis ein Knopf; er
 * startet einen Hintergrund-Auftrag, der den Hinweis MIT seinem Zusammenhang an die KI gibt
 * (betroffener Baustein, Blatt oder Teil, Lernziel, Lerngruppe, Anrede-Regel) und eine
 * gezielte Reparatur zurückbekommt. Das Ergebnis wird als EIN Rückgängig-Schritt eingesetzt,
 * danach läuft die Prüfung neu.
 *
 * Nicht jeder Hinweis ist ein Auftrag: „Wortlaut vor dem Einsatz mit der Fundstelle
 * vergleichen" verlangt einen Blick der Lehrkraft, „Bilder: 3 aus dem Internet" ist ein
 * Bericht. Solche reinen Informationen bekommen keinen Knopf (`istBehebbar`).
 *
 * Diese Datei kennt weder React noch die Programme; sie wird in tests/kiBeheben.test.ts geprüft.
 */

/** Vorsilben, mit denen die Programme ihre Hinweise kennzeichnen („[Prüfung] …") */
const PRAEFIX = /^\s*\[(Prüfung|Blatt|Vollständigkeit|KI-Hinweis|Nachgebessert)\]\s*/

/** Der Hinweis ohne Kennzeichnung – so, wie ihn die Lehrkraft liest */
export const ohnePraefix = (hinweis: string): string => hinweis.replace(PRAEFIX, '').trim()

/*
 * Reine Informationen – FAUSTREGEL aus den Texten, die die Programme selbst schreiben
 * (finish.ts, worksheetImages.ts, vokabeltest/generate.ts, originalSources.ts). Wer einen neuen
 * Hinweis dieser Art einführt, trägt ihn hier ein; im Zweifel gilt ein Hinweis als behebbar –
 * ein Knopf zu viel kostet einen Klick, einer zu wenig lässt die Lehrkraft allein.
 */
const NUR_INFO: RegExp[] = [
  // Bericht über eine schon erfolgte Nachbesserung
  /^\s*\[Nachgebessert\]/,
  // Quellen und Wortlaut: Das muss ein Mensch mit dem Original vergleichen
  /vor dem Einsatz/i,
  /Fundstelle|Fundort|im Archiv|Wortlaut (vor|gegen|mit)/i,
  /Bildnachweis|Bilder: \d/i,
  /bitte (ein anderes Bild )?(aus)?w(ä|ae)hlen|noch auszuwählen|Bild (für|gefunden)/i,
  // Hinweise der KI an die Lehrkraft ohne Mangel am Material
  /^\s*Hinweis der KI/i,
  // Landesvorgaben und Umfang: Entscheidungen der Lehrkraft, keine Mängel am Material
  /Vokabel\(n\) weniger als gewünscht/i,
  /Landesvorgabe|Kalenderwoche|angekündigt/i
]

/** Lässt sich der Hinweis durch eine Änderung am Material beheben? */
export function istBehebbar(hinweis: string): boolean {
  const t = hinweis.trim()
  if (!t) return false
  return !NUR_INFO.some((r) => r.test(t))
}

/** Was die KI über den Ort des Hinweises wissen muss */
export interface ReparaturKontext {
  /** „Arbeitsblatt", „Lernzielkontrolle", „Klassenarbeit" … */
  material: string
  /** Fach, Jahrgang, Schulform, Niveau – ein Satz */
  lerngruppe: string
  /** Thema und Lernziele, soweit bekannt */
  lernziel?: string
  /** Wo der Hinweis steht: „Blatt ★★", „Teil 2: Sprachmittlung", „Fassung B" */
  ort?: string
  /** Satz zur Anrede der Lernenden (shared/anrede.ts, `anredeRegel`) */
  anredeRegel?: string
  /** Nummer (ab 1) des Bausteins, an dem der Hinweis hängt – fehlt bei Hinweisen zum ganzen Blatt */
  bausteinNummer?: number
}

/** Höchstens so viele Änderungen je Auftrag – eine Reparatur, kein neues Blatt */
export const MAX_AENDERUNGEN = 4

/**
 * Der Auftrag an die KI. Bewusst eng gefasst: nur beheben, was genannt ist, alles andere
 * unverändert lassen – sonst würde aus dem Knopf ein „Neu erzeugen", das Arbeit der Lehrkraft
 * überschreibt.
 */
export function reparaturAuftrag(hinweise: string[], k: ReparaturKontext): string {
  const liste = hinweise.map((h) => `- ${ohnePraefix(h)}`).join('\n')
  return [
    `Die Prüfung hat an diesem Material (${k.material}) Folgendes gemeldet. Behebe GENAU diese Punkte:`,
    liste,
    k.bausteinNummer ? `Der Hinweis gehört zu Baustein (${k.bausteinNummer}).` : 'Der Hinweis betrifft das ganze Blatt.',
    k.ort ? `Ort: ${k.ort}.` : '',
    `Lerngruppe: ${k.lerngruppe}.`,
    k.lernziel ? `Thema und Lernziel: ${k.lernziel}.` : '',
    k.anredeRegel ?? '',
    [
      'So wird repariert:',
      '- Fehlt etwas (Material, Ausgangstext, Mustertext, Erwartungshorizont, Lösung, Hilfsblatt), baue es nach und füge es an der passenden Stelle ein oder ergänze den Baustein.',
      '- Stimmt ein Verweis oder eine Nummerierung nicht, passe die Aufgabe an das vorhandene Material an (die App nummeriert Material selbst als M1, M2 … in der Reihenfolge der Bausteine; schreibe keine Nummern in Titel).',
      '- Passt eine Formulierung nicht (Anrede, Operator, Sprache, Wortzahl), formuliere den Baustein um und behalte Inhalt, Anforderungsbereich und Antwortform bei.',
      `- Ändere höchstens ${MAX_AENDERUNGEN} Bausteine. Alles, was der Hinweis nicht betrifft, bleibt wörtlich, wie es ist.`,
      '- art: "ersetzen" (Baustein mit dieser Nummer durch den neuen ersetzen), "davor"/"danach" (neuen Baustein vor/nach dieser Nummer einfügen), "entfernen" (Baustein streichen; block leer lassen).',
      '- Liefere jeden geänderten oder neuen Baustein VOLLSTÄNDIG, nicht nur die geänderte Stelle.',
      '- erklaerung: ein Satz für die Lehrkraft, was geändert wurde.'
    ].join('\n')
  ]
    .filter(Boolean)
    .join('\n\n')
}

export type ReparaturArt = 'ersetzen' | 'davor' | 'danach' | 'entfernen'

/** Eine Änderung, auf Kennungen bezogen – so lässt sie sich auch in einen inzwischen geänderten Stand einarbeiten */
export interface Reparatur<B> {
  art: ReparaturArt
  /** Kennung des Bausteins, auf den sich die Änderung bezieht */
  anker: string
  /** Neuer Baustein (fehlt bei „entfernen") */
  block?: B
}

/**
 * Die Änderungen in eine Bausteinliste einarbeiten. Bezug sind Kennungen, nicht Stellen:
 * Hat die Lehrkraft während des Auftrags Bausteine verschoben, landet die Reparatur trotzdem
 * am richtigen. Ist der Anker inzwischen gelöscht, wird ein neuer Baustein ans Ende gesetzt,
 * ein Ersetzen oder Entfernen entfällt.
 */
export function wendeReparaturAn<B extends { id: string }>(bloecke: B[], aenderungen: Reparatur<B>[]): B[] {
  let liste = [...bloecke]
  for (const a of aenderungen) {
    const i = liste.findIndex((b) => b.id === a.anker)
    if (a.art === 'entfernen') {
      if (i >= 0) liste = [...liste.slice(0, i), ...liste.slice(i + 1)]
      continue
    }
    if (!a.block) continue
    if (a.art === 'ersetzen') {
      if (i >= 0) liste = [...liste.slice(0, i), a.block, ...liste.slice(i + 1)]
      continue
    }
    if (i < 0) liste = [...liste, a.block]
    else if (a.art === 'davor') liste = [...liste.slice(0, i), a.block, ...liste.slice(i)]
    else liste = [...liste.slice(0, i + 1), a.block, ...liste.slice(i + 1)]
  }
  return liste
}

/** „Englisch, Klasse 9, Gymnasium, GER B1" – die Lerngruppe in einem Satz für den Auftrag */
export function lerngruppeSatz(t: { fach: string; jahrgang?: number; schulform?: string; niveau?: string }): string {
  return [t.fach, t.jahrgang ? `Klasse ${t.jahrgang}` : '', t.schulform ?? '', t.niveau ? `GER ${t.niveau}` : ''].filter(Boolean).join(', ')
}

/**
 * Die behobenen Hinweise aus den Bausteinen nehmen (genau diese Texte). Hinweise, die die
 * lokale Prüfung danach wieder findet, erscheinen über den neuen Prüflauf erneut – dann war
 * die Reparatur eben nicht vollständig, und das soll man sehen.
 */
export function ohneHinweise<B extends { id: string; warnings?: string[] }>(bloecke: B[], hinweise: { text: string; blockId?: string }[]): B[] {
  const weg = new Map<string, Set<string>>()
  for (const h of hinweise) if (h.blockId) weg.set(h.blockId, (weg.get(h.blockId) ?? new Set()).add(h.text))
  return bloecke.map((b) => {
    const raus = weg.get(b.id)
    return raus && b.warnings ? { ...b, warnings: b.warnings.filter((w) => !raus.has(w)) } : b
  })
}
