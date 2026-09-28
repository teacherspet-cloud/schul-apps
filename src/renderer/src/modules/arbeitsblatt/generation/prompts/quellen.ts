import type { Stars } from '../../didactics/differentiation'
import type { OriginalMaterialAblage, SourceMaterial, WorksheetMeta } from '../../model/types'

// ---------- Originalquellen ----------

/** Fächer, in denen Quellenarbeit zum Kern gehört */
export const SOURCE_SUBJECTS = ['geschichte', 'politik', 'religion', 'werte-und-normen', 'deutsch', 'latein', 'kunst', 'musik', 'erdkunde']

/**
 * Automatisch: in Quellenfächern ab Klasse 7 (Quellenarbeit ist dort fester Bestandteil der Lehrpläne),
 * in Klasse 5–6 nur für die anspruchsvollste Niveaustufe.
 */
export function originalSourcesActive(meta: WorksheetMeta, level: Stars | null = null): boolean {
  const mode = meta.originalSources ?? 'auto'
  if (mode !== 'auto') return mode === 'on'
  if (!SOURCE_SUBJECTS.includes(meta.subjectId)) return false
  return meta.grade >= 7 || (meta.grade >= 5 && level === 3)
}

export function originalSourcesHint(meta: WorksheetMeta): string {
  if (!SOURCE_SUBJECTS.includes(meta.subjectId)) return `Automatisch: in ${meta.subjectLabel || 'diesem Fach'} keine Originalquellen.`
  if (meta.grade >= 7) return `Automatisch: in ${meta.subjectLabel} ab Klasse 7 mit Originalquellen.`
  if (meta.grade >= 5) return 'Automatisch: in Klasse 5–6 nur in der Fassung ★★★.'
  return 'Automatisch: in der Grundschule keine Originalquellen.'
}

/**
 * Regeln für Originalquellen, die die KI AUS DEM GEDÄCHTNIS nennt.
 *
 * Gemeldet von der Lehrkraft (24.09.2026): Zu einer Macbeth-Inszenierung wurde ein Text von
 * 2025 als bester Treffer angeboten – und dann doch nicht im Original verwendet.
 *
 * Die Ursache stand in diesen Regeln: „Kennst du den Wortlaut nicht sicher, verwende
 * stattdessen einen als Autorentext erkennbaren Darstellungstext." Den Wortlaut eines
 * Artikels von 2025 kennt kein Sprachmodell – also nahm es den angebotenen Ausweg, obwohl
 * der echte Text längst geladen danebenlag.
 *
 * Deshalb: Ist Material BESCHAFFT, treten diese Regeln zurück. Zwei Regelwerke aus zwei
 * Epochen im selben Prompt sind genau die Art Widerspruch, bei dem am Ende die allgemeinere
 * Regel gewinnt.
 */
export function originalSourceRules(meta: WorksheetMeta, level: Stars | null = null, material?: OriginalMaterialAblage | null): string {
  if (!originalSourcesActive(meta, level)) return ''
  if (material) {
    return [
      'ORIGINALQUELLE: Der Ausgangstext ist bereits beschafft, geladen und geprüft (siehe unten).',
      '- Er steht dort im Wortlaut. Du musst und darfst ihn NICHT aus dem Gedächtnis wiedergeben.',
      '- Weiche NICHT auf einen selbst geschriebenen Darstellungstext aus. Das war früher der Ausweg, wenn du einen Wortlaut nicht sicher kanntest – hier ist er falsch.',
      '- Aufgaben zur Quellenarbeit passend zum Jahrgang: Quelle einordnen (Wer? Wann? Für wen? Mit welcher Absicht?), Aussagen herausarbeiten, Perspektive und Glaubwürdigkeit beurteilen.'
    ].join('\n')
  }
  const literary = ['deutsch', 'latein'].includes(meta.subjectId)
  return [
    'ORIGINALQUELLEN: Setze, wo es dem Lernziel dient, authentische Quellen ein statt nur Autorentexte – ' +
      (literary
        ? 'z. B. gemeinfreie literarische Originaltexte (Autorin/Autor seit über 70 Jahren verstorben), Briefe, Reden, zeitgenössische Bilder.'
        : 'z. B. historische Textquellen (Urkunden, Gesetze, Reden, Briefe, Tagebücher, Zeitungsartikel), Bildquellen (Gemälde, Fotografien, Karikaturen, Plakate, historische Karten).'),
    '- Nur gemeinfreie oder frei zugängliche Quellen, z. B. Wikisource, Projekt Gutenberg, documentArchiv.de, LeMO (DHM), Bundeszentrale für politische Bildung, Wikimedia Commons.',
    '- Zitiere nur Wortlaute, die du sicher kennst. Erfinde NIEMALS Quellen, Zitate, Urheber oder Jahreszahlen. Kennst du den Wortlaut nicht sicher, verwende stattdessen einen als Autorentext erkennbaren Darstellungstext.',
    '- Textquelle als Baustein „text“: title beginnt mit „Q1:“, „Q2:“ …; Kürzungen mit […]; lineNumbers an (Zeilennummern setzt die App – nie selbst Nummern in den Text schreiben); veraltete oder unbekannte Wörter im Glossar erklären.',
    '- source bei Textquellen: „Urheber, Titel bzw. Art der Quelle, Datum. Fundort: <https-Adresse des frei zugänglichen Volltexts>“ – die Adresse nur, wenn du sie sicher kennst. Bei Übersetzung oder sprachlicher Anpassung „(Übersetzung)“ bzw. „(sprachlich angepasst)“ ergänzen.',
    '- Bildquelle als Baustein „image“: title = Bildunterschrift „Urheber: Titel, Jahr“; imageDescription = was zu sehen ist; imageSearch = 2–5 markante Suchwörter für Wikimedia Commons (Urheber bzw. Kernwörter des Originaltitels, ohne Gattungswörter wie „Karikatur“); imageIsSource = true. Nur tatsächlich existierende, bekannte Werke.',
    '- Aufgaben zur Quellenarbeit passend zum Jahrgang: Quelle einordnen (Wer? Wann? Für wen? Mit welcher Absicht?), Aussagen herausarbeiten, Perspektive und Glaubwürdigkeit beurteilen.',
    level === 1
      ? '- Diese Fassung: kurze Auszüge, sprachlich angepasst und gekennzeichnet, viele Worterklärungen, Leitfragen zur Quellenarbeit.'
      : level === 3
        ? '- Diese Fassung: längere Auszüge im Originalwortlaut, Quellenkritik und Vergleich von Perspektiven.'
        : '- Kürzungen erlaubt; in Stufe ★ sprachlich angepasste Auszüge, in Stufe ★★★ Originalwortlaut.'
  ].join('\n')
}

/**
 * Der Ausgangstext steht schon fest – die KI plant nur noch die Aufgaben dazu.
 *
 * Wunsch der Lehrkraft (24.09.2026): Die App sucht das Originalmaterial im Netz. Sie hat es
 * geladen, gekürzt und den Wortlaut geprüft.
 *
 * Entscheidend ist der letzte Satz dieser Regeln: Die KI darf den Text NICHT abschreiben.
 * Ein Sprachmodell, das einen Text „übernimmt", ändert dabei Kleinigkeiten – ein Komma, eine
 * Schreibweise, ein Wort. Auf dem Blatt stünde das dann mit Quellenangabe da und sähe aus
 * wie ein Zitat. Die App setzt den Baustein deshalb selbst ein.
 */
export function originalMaterialVorgabe(material: OriginalMaterialAblage | null | undefined): string {
  if (!material) return ''
  return [
    'AUSGANGSTEXT – BEREITS BESCHAFFT, NICHT ZU ERZEUGEN:',
    `Titel: ${material.titel}${material.urheber ? ` · Urheber: ${material.urheber}` : ''}`,
    `Quellenangabe: ${material.quellenangabe}`,
    '--- Wortlaut (bereits gekuerzt) ---',
    material.text,
    '--- Ende des Wortlauts ---',
    'REGELN DAZU:',
    '- Dieser Text steht auf dem Blatt. Die App setzt ihn SELBST als Baustein ein, zusammen mit Quellenangabe und Zeilennummern – direkt hinter den Lernzielen, also als ERSTES Material, vor allen anderen Bausteinen.',
    '- Verweise auf diesen Text ausschließlich mit M{quelle} („Fasse die Rede M{quelle} zusammen"); die Nummer vergibt die App.',
    '- Erzeuge KEINEN eigenen Baustein fuer diesen Text und gib ihn NIRGENDS wieder – auch nicht auszugsweise, auch nicht „zur Sicherheit".',
    '- Plane die Aufgaben zu DIESEM Text. Beziehe dich auf seinen Inhalt, nicht auf einen gedachten anderen.',
    '- Zitiere in Aufgaben und Loesungen nur mit Zeilenangabe („Z. 4–7"), nicht durch Abschreiben laengerer Stellen.',
    '- Schreibe keine Aufgabe, die etwas verlangt, was in diesem Text nicht steht.'
  ].join('\n')
}

/** Material der Lehrkraft als Text (Bilder werden separat übergeben). */
export function materialText(sources: SourceMaterial[]): string {
  const used = sources.filter((s) => s.useAsBasis)
  if (!used.length) return ''
  return [
    'MATERIAL DER LEHRKRAFT (als Grundlage nutzen; längere Passagen nicht wörtlich übernehmen, sondern altersgerecht bearbeiten und die Quelle angeben):',
    ...used.map((s, i) =>
      s.text
        ? `--- Material ${i + 1}: ${s.fileName}${s.format === 'html' ? ' (als HTML)' : ''}${
            s.kind === 'web' ? ` (Webseite${s.url ? `: ${s.url}` : ''})` : s.kind === 'video' ? ` (Video-Transkript${s.url ? `: ${s.url}` : ''})` : ''
          } ---\n${s.text}`
        : `--- Material ${i + 1}: ${s.fileName} (als Bild beigefügt) ---`
    )
  ].join('\n\n')
}

export function materialImages(sources: SourceMaterial[]): string[] {
  return sources.filter((s) => s.useAsBasis).flatMap((s) => s.pageImages)
}

/** Bilder aus dem Material, die ins Blatt übernommen werden dürfen. */
export function embeddableImages(sources: SourceMaterial[]): { index: number; fileName: string; dataUrl: string }[] {
  return sources
    .filter((s) => s.embedImage && s.kind === 'image' && s.pageImages[0])
    .map((s, index) => ({
      index,
      fileName: s.fileName,
      dataUrl: s.pageImages[0]
    }))
}

export const MATERIAL_WARN_CHARS = 80_000
