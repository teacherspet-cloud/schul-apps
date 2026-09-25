/**
 * Bilingualer Sachfachunterricht (CLIL).
 *
 * Wunsch der Lehrkraft (25.09.2026): „Recherchiere außerdem gründlich zum bilingualen
 * Sachfachunterricht und entwirf einen Plan, wie dieser in den Apps eingebunden werden kann,
 * sodass er einwandfrei funktioniert. Beachte Länderunterschiede (Bundesländer) und ggfs.
 * Schulformen, Jahrgänge und Fächer."
 *
 * Grundlage ist der KMK-Bericht „Konzepte für den bilingualen Unterricht – Erfahrungsbericht
 * und Vorschläge zur Weiterentwicklung" (Beschluss vom 17.10.2013), dazu die Vorschriften und
 * Handreichungen der Länder. Berlin fasst das Prinzip am klarsten (AV bilingualer Unterricht,
 * 21.12.2020, Nr. 2 Abs. 2): „Die Fremdsprache ist hierbei nicht vorrangig Gegenstand,
 * sondern Instrument zur Vermittlung fachlicher Inhalte."
 *
 * ENTSCHEIDUNGEN DER LEHRKRAFT (25.09.2026), in dieser Reihenfolge abgefragt:
 *
 * - Eingeschaltet wird beim Fach, mit Arbeitssprache und Form (Zug / durchgängig / Modul).
 * - Die Bewertung folgt dem Bundesland, soweit dort belegt; sonst gilt die KMK-Grundregel.
 * - Klassenarbeiten bekommen einen Hinweis zur Prüfungssprache.
 * - Mathematik bekommt einen Hinweis, weil mehrere Länder sie einschränken.
 * - Die Operatorenlisten aus Hessen und Niedersachsen werden übernommen.
 * - Alle vier Arbeitssprachen der App.
 * - Arbeitsanweisungen in der Arbeitssprache, Fachbegriffe zweisprachig.
 * - Das zweisprachige Glossar STICHT die Einsprachigkeits-Schwelle des Hilfsblatts
 *   (siehe `zeigtUebersetzung` in `phraseRules.ts`).
 */
import type { BilingualForm, Sheet, WorksheetMeta } from '../model/types'
import type { DidacticWarning } from './checks'
import { subjectById } from '../model/subjects'
import { plainText } from '../../../shared/richtext/parse'
import { istUebungsklausur } from '../generation/abiturPrompt'

/** Ist das Blatt bilingual? Nur in Sachfächern – Deutsch und die Fremdsprachen sind keine. */
export function bilingualAktiv(meta: Pick<WorksheetMeta, 'bilingual' | 'subjectId'>): boolean {
  if (!meta.bilingual?.an || !meta.bilingual.sprache) return false
  const fach = subjectById(meta.subjectId)
  /*
   * Berlin, AV 2020, Nr. 2 Abs. 3: „Sachfächer im Sinne der Regelung sind alle
   * Unterrichtsfächer mit Ausnahme von Deutsch und den Fremdsprachen."
   */
  return !fach.foreignLanguage && !fach.uebersetzungssprache && !['deutsch', 'daz'].includes(fach.id)
}

export const FORM_LABEL: Record<BilingualForm, string> = {
  zug: 'bilingualer Zug',
  sachfach: 'durchgängiger bilingualer Sachfachunterricht',
  modul: 'bilinguales Modul'
}

/**
 * Wie im Land bewertet wird.
 *
 * Die Spreizung ist beträchtlich, und sie ist der Grund für diese Tabelle. Alle Einträge sind
 * belegt – überwiegend aus dem Anhang zu Kapitel 2.3 des KMK-Berichts 2013, Berlin aus der
 * aktuellen AV von 2020, Niedersachsen zusätzlich aus der Handreichung des Kultusministeriums
 * von 2014. Länder ohne Eintrag bekommen die KMK-Grundregel.
 *
 * Eine Formulierung wie „Sprachfehler dürfen nicht zu Abzügen führen" hat die Recherche in
 * dieser Absolutheit NIRGENDS gefunden. Die belegbare gemeinsame Linie ist schwächer und
 * zugleich genauer: Bewertet wird das Sachfach; Sprachmängel wirken sich aus, sobald sie die
 * fachliche Aussage beeinträchtigen – dann aber als fachlicher, nicht als sprachlicher Abzug.
 */
const BEWERTUNG: Record<string, string> = {
  NW: 'Vorrangig werden die fachlichen Leistungen bewertet. Die fremdsprachliche Leistung geht als Darstellungsleistung ein, mit höchstens 20 % der Gesamtleistung; im Anfangsunterricht deutlich weniger.',
  HE: 'Der Inhalt ist entscheidend. Fachvokabular und gute Kommunikation werden positiv gewertet; gravierende Verstöße gegen die sprachliche Norm führen höchstens dann zu einem Abzug von bis zu zwei Punkten, wenn die Kommunikation in hohem Maße behindert ist.',
  BE: 'Es werden nur die Leistungen bewertet, die dem Sachfach zuzuordnen sind (AV bilingualer Unterricht 2020, Nr. 8). Zweisprachige Wörterbücher sind bei Klassenarbeiten zugelassen.',
  BB: 'Es werden nur die im Sachfach zu erbringenden Leistungen bewertet, die dem Sachfach zuzuordnen sind.',
  RP: 'Bewertet wird die fachliche Leistung. Führt fehlerhafte oder fachsprachlich unangemessene Sprache zu einer eingeschränkten fachlichen Leistung, wird das wie im deutschsprachigen Sachfachunterricht berücksichtigt.',
  SL: 'Nur die fachlichen Leistungen werden beurteilt. Führt fehlerhafte Sprache zu einer eingeschränkten fachlichen Leistung, wird das wie im deutschsprachigen Sachfachunterricht berücksichtigt.',
  HH: 'Nur bei gravierenden sprachlichen Mängeln, die die Verständlichkeit erheblich beeinträchtigen, kann die Sprache zu einem Abzug führen – analog zum deutschsprachigen Sachfachunterricht.',
  NI: 'Die fachlichen Leistungen entscheiden; eine angemessene Verwendung der Fremdsprache einschließlich der Fachsprache ist zu berücksichtigen. Im Einzelfall ist Deutsch zu tolerieren. Sprachliche Mängel werden kenntlich gemacht und verbessert; verhindern sie die inhaltliche Aussage, führt das zu inhaltlichen Abzügen.',
  BY: 'Die Lernenden können in der Regel wählen, ob die Leistungserhebung in der Fremdsprache oder auf Deutsch erfolgt.',
  TH: 'Die Sachfachleistung hat Vorrang; ein angemessenes Sprachniveau wird einbezogen.',
  BW: 'Für Gymnasien gibt es keine besonderen Vorgaben zur Leistungsfeststellung. Am beruflichen Gymnasium müssen Antworten in der Fremdsprache eindeutig sein; die Fremdsprachenkompetenz wird nicht gesondert bewertet.',
  SH: 'Bewertet wird wie im muttersprachlichen Sachfachunterricht; die Verwendung von Deutsch und Fremdsprache regeln schulinterne Absprachen.'
}

const KMK_GRUNDREGEL =
  'Ausschlaggebend sind die fachlichen Kompetenzen und Leistungen im Sachfach. Die Darstellung in der Fremdsprache wird je nach Land unterschiedlich einbezogen, höchstens mit 20 % der Gesamtleistung (KMK 2013).'

/** Die Bewertungsregel des Landes – bei Modulen in Thüringen die eigene Regel. */
export function bewertungsregel(meta: Pick<WorksheetMeta, 'stateId' | 'bilingual'>): { regel: string; belegt: boolean } {
  if (meta.stateId === 'TH' && meta.bilingual?.form === 'modul')
    return {
      regel:
        'In bilingualen Modulen steht die Leistungsbewertung nicht im Vordergrund. Für die Lernenden darf aufgrund von Sprachproblemen kein Nachteil entstehen; sie dürfen auf Deutsch zurückgreifen.',
      belegt: true
    }
  const regel = BEWERTUNG[meta.stateId]
  return regel ? { regel, belegt: true } : { regel: KMK_GRUNDREGEL, belegt: false }
}

/**
 * Die Operatoren der Arbeitssprache.
 *
 * Aus zwei belegten Listen zusammengeführt:
 *
 * - Hessisches Kultusministerium, „Operatoren – Geschichte bilingual (Englisch) / Politik und
 *   Wirtschaft bilingual (Englisch)", Landesabitur 2011, Stand 01.08.2010.
 * - Niedersächsisches Kultusministerium (2014), Kap. 3 „Operatoren" für Biologie, Erdkunde,
 *   Geschichte, Politik/Wirtschaft und Sport – Englisch UND Französisch.
 *
 * Beide sind ausdrücklich KEINE eigenen Systeme, sondern Übersetzungen der deutschen
 * Fachoperatoren; die AFB-Zuordnung bleibt dieselbe. Die Feinheiten sind der Grund, sie nicht
 * von der KI übersetzen zu lassen: „explain" steht für erklären UND erläutern, und „evaluate"
 * verlangt gegenüber „assess" zusätzlich, die eigenen Maßstäbe darzulegen.
 *
 * Für Spanisch und Italienisch gibt es keine belegte Liste; dort werden die Entsprechungen
 * nicht erfunden, sondern die Regel verweist auf die deutschen Operatoren.
 */
export interface BilingualOperator {
  de: string
  en: string
  fr?: string
  afb: 'I' | 'II' | 'III'
}

export const BILINGUAL_OPERATOREN: BilingualOperator[] = [
  // AFB I
  { de: 'nennen', en: 'name / state', fr: 'nommer', afb: 'I' },
  { de: 'aufzählen', en: 'enumerate', fr: 'énumérer', afb: 'I' },
  { de: 'beschreiben', en: 'describe', fr: 'décrire', afb: 'I' },
  { de: 'wiedergeben', en: 'present / give an account of', fr: 'présenter, dégager', afb: 'I' },
  { de: 'zusammenfassen', en: 'summarise / outline', fr: 'résumer', afb: 'I' },
  { de: 'aufzeigen, darlegen', en: 'delineate / point out', fr: '(dé)montrer', afb: 'I' },
  { de: 'beschriften', en: 'label', fr: 'attribuer', afb: 'I' },
  { de: 'skizzieren', en: 'sketch', fr: 'esquisser', afb: 'I' },
  // AFB II
  { de: 'analysieren', en: 'analyse / examine', fr: 'analyser, examiner', afb: 'II' },
  { de: 'charakterisieren', en: 'characterise', fr: 'caractériser', afb: 'II' },
  { de: 'vergleichen', en: 'compare', fr: 'comparer', afb: 'II' },
  { de: 'herausarbeiten', en: 'examine', fr: 'dégager', afb: 'II' },
  { de: 'erklären, erläutern', en: 'explain / illustrate', fr: 'expliquer', afb: 'II' },
  { de: 'einordnen', en: 'put into context', fr: 'situer', afb: 'II' },
  // AFB III
  { de: 'beurteilen', en: 'assess', fr: 'juger', afb: 'III' },
  { de: 'bewerten, Stellung nehmen', en: 'evaluate', fr: 'évaluer, prendre position', afb: 'III' },
  { de: 'erörtern, diskutieren', en: 'discuss', fr: 'discuter', afb: 'III' },
  { de: 'entwickeln', en: 'develop', fr: 'développer', afb: 'III' },
  { de: 'interpretieren', en: 'interpret', fr: 'interpréter', afb: 'III' },
  { de: 'gestalten, verfassen', en: 'write / design', fr: 'rédiger', afb: 'III' }
]

/** Die Operatoren in der Arbeitssprache – oder `null`, wenn es keine belegte Liste gibt. */
export function operatorenFuer(sprache: string): { ziel: string; de: string; afb: string }[] | null {
  if (sprache !== 'en' && sprache !== 'fr') return null
  return BILINGUAL_OPERATOREN.filter((o) => (sprache === 'fr' ? o.fr : o.en)).map((o) => ({
    ziel: sprache === 'fr' ? o.fr! : o.en,
    de: o.de,
    afb: o.afb
  }))
}

/**
 * Hinweise, die beim Einschalten erscheinen – nicht als Sperre, sondern zur Kenntnis.
 *
 * Mathematik: In Berlin entscheidet allein für dieses Fach die Fachaufsicht, ob es bilingual
 * unterrichtet werden darf (AV 2020, Nr. 5 Abs. 6); Thüringen führt in Klasse 9/10 keine
 * Mathematik-Module durch; die Staatliche Europa-Schule Berlin unterrichtet Mathematik immer
 * auf Deutsch.
 */
export function bilingualHinweise(meta: Pick<WorksheetMeta, 'subjectId' | 'stateId' | 'grade' | 'bilingual'>): string[] {
  const h: string[] = []
  if (meta.subjectId === 'mathematik') {
    h.push(
      'Mathematik ist ein Sonderfall: In Berlin braucht bilingualer Mathematikunterricht eine Genehmigung der Fachaufsicht, Thüringen führt in Klasse 9/10 keine Mathematik-Module durch, und die Staatliche Europa-Schule Berlin unterrichtet Mathematik grundsätzlich auf Deutsch.'
    )
  }
  const bewertung = bewertungsregel(meta)
  if (!bewertung.belegt)
    h.push(
      'Für dieses Bundesland hat die Recherche keine eigene Bewertungsregel gefunden. Es gilt die Grundregel der KMK: Ausschlaggebend ist die Sachfachleistung.'
    )
  if (!operatorenFuer(meta.bilingual?.sprache ?? ''))
    h.push(
      `Für ${meta.bilingual?.spracheLabel ?? 'diese Sprache'} gibt es keine amtliche bilinguale Operatorenliste. Die App nutzt die deutschen Operatoren und nennt die Entsprechung – prüfe sie vor dem Einsatz.`
    )
  return h
}

/**
 * Der Hinweis zur Prüfungssprache – bei Klassenarbeiten und Übungsklausuren.
 *
 * Canz u. a. (2021) fanden, dass Aufgaben in der dominanten Unterrichtssprache (Deutsch) höhere
 * Werte erzeugen und dass ein Prüfen ausschließlich in der Fremdsprache die SACHleistung
 * unterschätzt – besonders bei Anfängern und bei Lückentexten, weniger bei Multiple Choice.
 * Mischformate sind amtlich gedeckt: Rheinland-Pfalz verlangt am beruflichen Gymnasium sogar
 * mindestens je eine Aufgabe auf Deutsch und eine in der Fremdsprache, plus 15 Minuten
 * Einlesezeit.
 */
export const PRUEFUNGSSPRACHE_HINWEIS =
  'Wird ausschließlich in der Fremdsprache geprüft, fällt die gemessene Sachleistung niedriger aus – besonders bei Anfängern und bei offenen Formaten (Canz u. a. 2021). Mischformate sind amtlich gedeckt: Rheinland-Pfalz verlangt am beruflichen Gymnasium je mindestens eine Aufgabe auf Deutsch und eine in der Fremdsprache, dazu 15 Minuten Einlesezeit.'

/**
 * In welcher Sprache die Aufgaben stehen.
 *
 * Auf Arbeitsblättern immer in der Arbeitssprache. In einer Klassenarbeit wählbar
 * (Entscheidung der Lehrkraft, 25.09.2026) – siehe PRUEFUNGSSPRACHE_HINWEIS.
 */
function sprachregel(b: NonNullable<WorksheetMeta['bilingual']>): string {
  if (b.pruefsprache === 'deutsch')
    return `- Materialtexte stehen auf ${b.spracheLabel}; die AUFGABENSTELLUNGEN stehen auf Deutsch. Antworten auf ${b.spracheLabel} sind erwünscht, auf Deutsch zulässig.`
  if (b.pruefsprache === 'gemischt')
    return `- Materialtexte stehen auf ${b.spracheLabel}. MISCHFORMAT: Mindestens eine Aufgabe ist auf Deutsch gestellt, die übrigen auf ${b.spracheLabel}. Jede Aufgabe wird in der Sprache beantwortet, in der sie gestellt ist.`
  return `- Arbeitsanweisungen, Materialtexte und Aufgaben stehen auf ${b.spracheLabel}.`
}

/** Die Regeln für den Prompt. */
export function bilingualRegeln(meta: WorksheetMeta): string {
  if (!bilingualAktiv(meta)) return ''
  const b = meta.bilingual!
  const sprache = b.spracheLabel
  const ops = operatorenFuer(b.sprache)
  const bewertung = bewertungsregel(meta)
  return [
    `BILINGUALER SACHFACHUNTERRICHT (${FORM_LABEL[b.form]}, Arbeitssprache ${sprache}):`,
    `- Das Fach bleibt ${meta.subjectLabel}. Die Fremdsprache ist Werkzeug, nicht Gegenstand: Lernziele, Inhalte und Anforderungen sind die des Sachfachs.`,
    sprachregel(b),
    // Die Liste selbst steht im Abschnitt OPERATOREN (`operatorRules`) – dort ersetzt sie die deutsche
    ops
      ? `- Operatoren auf ${sprache} aus dem Abschnitt OPERATOREN. Sie sind Übersetzungen der deutschen Fachoperatoren; der Anforderungsbereich bleibt derselbe.`
      : `- Für ${sprache} gibt es keine amtliche Operatorenliste. Verwende die deutschen Fachoperatoren aus dem Abschnitt OPERATOREN und nenne dahinter in Klammern die sprachliche Entsprechung.`,
    /*
     * Entscheidung der Lehrkraft (25.09.2026): „Bilingual sticht". Berlin verlangt, den
     * Fachwortschatz „grundsätzlich auch in Deutsch abzusichern"; Niedersachsen und NRW ebenso.
     * Wer Photosynthese auf Englisch lernt, muss den deutschen Fachbegriff trotzdem können.
     */
    b.pruefung
      ? '- Das zweisprachige Fachglossar liegt der Arbeit EINMAL als Hilfsmittel bei; die App erstellt es gesondert. Erstelle in diesem Teil KEINEN Baustein „phrases“.'
      : `- PFLICHT: ein zweisprachiges Fachglossar. Jeder Fachbegriff steht auf ${sprache} UND auf Deutsch – auch in der Oberstufe. Das ist hier keine Hilfe, die man mit steigendem Niveau weglässt, sondern Lernziel: Der deutsche Fachbegriff muss ebenfalls sitzen.`,
    b.pruefung
      ? ''
      : '- Trenne im Glossar Fachbegriffe (subject terms) von allgemeinen Arbeitswörtern (working vocabulary). Höchstens etwa 20 Fachbegriffe je Einheit (Kultusministerium Niedersachsen 2014).',
    /*
     * Niedersachsen 2014, Tipps für die Praxis: Bilder und Diagramme treten ausdrücklich an die
     * Stelle von Text, um die Textmenge zu senken.
     */
    '- Mehr Visualisierung als auf einem deutschsprachigen Blatt: Bilder, Schemata und Diagramme treten an die Stelle von Text, wo sie dasselbe leisten. Die Textmenge ist deutlich geringer als bei einem gleichwertigen deutschen Blatt.',
    '- Unterstütze getrennt nach Richtung: für das VERSTEHEN Annotationen, kurze Worterklärungen und Brückentexte; für das SCHREIBEN und SPRECHEN Satzbausteine und Redemittel.',
    '',
    'BEWERTUNG IM ERWARTUNGSHORIZONT:',
    `- ${bewertung.regel}`,
    '- Bewerte die fachliche Leistung. Sprachmängel zählen nur, wenn sie die fachliche Aussage beeinträchtigen – dann als fachlicher Abzug, nicht als sprachlicher.'
  ].join('\n')
}

/** Überschrift des Glossars in der Arbeitssprache. */
const GLOSSAR_TITEL: Record<string, string> = { en: 'Glossary', fr: 'Glossaire', es: 'Glosario', it: 'Glossario' }

/**
 * Das zweisprachige Glossar als Baustein „phrases".
 *
 * Es benutzt denselben Baustein wie das Hilfsblatt der Fremdsprachen, aber mit anderer
 * Füllung: `text` ist der Begriff in der Arbeitssprache, `german` der deutsche Fachbegriff –
 * und der steht IMMER daneben (`zeigtUebersetzung`).
 */
export function glossarRegeln(meta: WorksheetMeta, mode: 'blatt' | 'inline'): string {
  const b = meta.bilingual!
  return [
    `ZWEISPRACHIGES FACHGLOSSAR (Baustein „phrases“) – PFLICHT:`,
    `- Erstelle GENAU EINEN Baustein vom Typ „phrases“. title: „${GLOSSAR_TITEL[b.sprache] ?? 'Glossary'}“. hint: ein Satz auf ${b.spracheLabel}, wie das Glossar zu benutzen ist.`,
    `- Jeder Eintrag: text = Begriff auf ${b.spracheLabel}, german = deutscher Fachbegriff. Das Feld german ist NIE leer.`,
    `- Gruppen (groups[].label, auf ${b.spracheLabel}): zuerst die Fachbegriffe des Themas, dann allgemeine Arbeitswörter für die Aufgaben; bei Schreibaufgaben zusätzlich eine Gruppe mit Satzbausteinen.`,
    '- Nur Begriffe, die auf dem Blatt wirklich vorkommen oder für die Aufgaben gebraucht werden; höchstens etwa 20 Fachbegriffe.',
    mode === 'blatt'
      ? '- Das Glossar steht am Ende als eigene Seite; die Aufgaben dürfen darauf verweisen.'
      : '- Das Glossar steht vor der ersten Aufgabe, die es braucht, möglichst direkt beim Material.'
  ].join('\n')
}

/** Zweck des Gliederungspunkts, wenn die App das Glossar selbst einfügt. */
export function glossarZweck(meta: WorksheetMeta): string {
  return `Zweisprachiges Fachglossar (${meta.bilingual!.spracheLabel} – Deutsch): die Fachbegriffe dieses Blattes und die Arbeitswörter für die Aufgaben.`
}

/**
 * Stimmen die Operatoren eines bilingualen Blattes?
 *
 * Die gewöhnliche Fachprüfung kennt nur deutsche Operatoren und meldete bei „Describe …"
 * jede Aufgabe als unbekannt. Hier wird gegen die zielsprachliche Liste geprüft – und dort,
 * wo es keine belegte Liste gibt (Spanisch, Italienisch), gar nicht: Eine Prüfung gegen eine
 * erfundene Liste wäre schlimmer als keine.
 */
export function checkBilingualOperatoren(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  const ops = operatorenFuer(meta.bilingual?.sprache ?? '')
  // Aufgaben auf Deutsch prüft die gewöhnliche Fachprüfung; hier gäbe es nichts zu vergleichen
  if (!ops || meta.bilingual?.pruefsprache === 'deutsch') return []
  // Im Mischformat sind auch die deutschen Entsprechungen richtig
  const gemischt = meta.bilingual?.pruefsprache === 'gemischt'
  const varianten = ops
    .flatMap((o) => [
      ...o.ziel.split(/\s*[/,]\s*/).map((v) => ({ wort: v.replace(/[()]/g, '').toLowerCase().trim(), afb: o.afb })),
      // Deutsch steht im Imperativ („Beschreibe“), die Liste im Infinitiv – verglichen wird der Stamm
      ...(gemischt ? o.de.split(/\s*,\s*/).map((v) => ({ wort: v.toLowerCase().trim().replace(/e?n$/, ''), afb: o.afb, stamm: true })) : [])
    ])
    .filter((v) => v.wort)
    .sort((a, b) => b.wort.length - a.wort.length)
  const out: DidacticWarning[] = []
  let nr = 0
  for (const block of sheet.blocks) {
    if (block.type !== 'task') continue
    nr++
    const text = plainText(block.instruction)
      .replace(/\*\*/g, '')
      .replace(/^[\s\d.)]+/, '')
      .trim()
      .toLowerCase()
    if (!text) continue
    const treffer = varianten.find((v) => text.startsWith(v.wort) && ('stamm' in v || !/\p{L}/u.test(text.charAt(v.wort.length))))
    const erstes = text.split(/\s+/)[0].replace(/[.,;:!?]/g, '')
    if (!treffer) {
      out.push({ kind: 'operator', message: `Aufgabe ${nr}: „${erstes}“ steht nicht in der bilingualen Operatorenliste (${meta.bilingual!.spracheLabel}).` })
      continue
    }
    if (block.afb && block.afb !== treffer.afb)
      out.push({ kind: 'operator', message: `Aufgabe ${nr}: „${treffer.wort}“ gilt als Anforderungsbereich ${treffer.afb}, angegeben ist ${block.afb}.` })
  }
  return out
}

/**
 * Alle Prüfungen eines bilingualen Blattes.
 *
 * Das Glossar wird eigens geprüft: Es ist PFLICHT, und ein Glossar mit leerer deutscher
 * Spalte wäre genau das, was die Lehrkraft ausgeschlossen hat („Bilingual sticht").
 */
export function checkBilingual(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  if (!bilingualAktiv(meta)) return []
  const out = checkBilingualOperatoren(sheet, meta)
  const glossare = sheet.blocks.filter((b) => b.type === 'phrases')
  // In einer Prüfung liegt das Glossar gesondert bei – ein Teil ohne Glossar ist dort richtig
  if (!glossare.length && !meta.bilingual?.pruefung)
    out.push({
      kind: 'bilingual',
      message: 'Das zweisprachige Fachglossar fehlt. Abhilfe: einen Baustein „Nützliche Ausdrücke“ einfügen und von der KI füllen lassen.'
    })
  const ohneDeutsch = glossare.flatMap((g) => g.groups.flatMap((gr) => gr.items)).filter((i) => i.text.trim() && !i.german.trim())
  if (ohneDeutsch.length)
    out.push({
      kind: 'bilingual',
      message: `Im Glossar fehlt bei ${ohneDeutsch.length} ${ohneDeutsch.length === 1 ? 'Begriff' : 'Begriffen'} der deutsche Fachbegriff (z. B. „${ohneDeutsch[0].text}“).`
    })
  if (istUebungsklausur(meta)) out.push({ kind: 'bilingual', message: `Prüfungssprache: ${PRUEFUNGSSPRACHE_HINWEIS}` })
  return out
}
