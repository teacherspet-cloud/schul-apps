/**
 * Regeln für gute Grammatikaufgaben (28.10.2026, nach der Prüfung der ganzen Aufgabenbank am Schulserver; Bericht
 * „Grammatikbank-Prüfung Englisch“, Wunsch der Lehrkraft: „langfristig wirkend korrigieren, Prompts überarbeiten, auch für
 * andere Fremdsprachen“). Befunde der Prüfung (82.315 Aufgaben, 554 Formen):
 *  - Erkennen war meist eine freie Lücke ohne Knöpfe (rund 11.700), oft mit „Wähle …“, ohne Vorgabe musste geraten werden.
 *  - In rund 5.800 Lücken stand die Lösung schon in der Klammer („(should)“ → should) – reines Abschreiben.
 *  - Mehrere richtige Antworten, nur eine gelistet (Kontrastformen, Fragewörter, Konjunktionen).
 *  - Unterscheiden-Lücken mit Grundform prüften die Abgrenzung nicht.
 *  - Fehler finden mit Fehlern, die man nicht durch EIN Wort ersetzen kann (Streichen, Umstellen); Fehler in fremder Grammatik.
 *  - Nicht tippbare Lösungen („—“, „,“, „streichen“), mehrere Lücken bei einem Feld.
 *
 * Drei Bausteine, für alle Sprachen gleich:
 *  - `AUFGABEN_REGELN`: der Auftrag an die KI (Bank, Pool, „+ Aufgaben“, Prüfung).
 *  - `aufgabeNormalisiert`: was sich ohne KI richten lässt (Wahl in der Vorgabe → Auswahl, „Wähle“ bei Lücken, doppelte
 *    Möglichkeiten, Lücke mit Grundform beim Erkennen → Bilden).
 *  - `aufgabeMangel`: was übrig bleibt und eine Aufgabe unbrauchbar macht – neue Aufgaben mit Mangel fallen weg,
 *    vorhandene in der Bank werden für die Lernenden zurückgestellt, bis sie überarbeitet sind.
 */
import { selbsttest } from './grammatikSelbsttest'
import { normiert, satzanfang, woerterVon, type GrammatikAufgabe } from './grammatiktrainer'

/** Auftrag an die KI: Regeln, die für jede Aufgabe gelten (alle Sprachen) */
export const AUFGABEN_REGELN = [
  'QUALITÄT – jede Aufgabe muss für sich allein EINDEUTIG lösbar sein; die Lernenden sehen nur Anweisung, Satz und Vorgabe:',
  '- LÜCKE ist ein freies Tippfeld ohne Knöpfe. Nur verwenden, wenn die Lernenden eine Form aus einem Grundwort BILDEN: „vorgabe“ nennt das Grundwort in Klammern (z. B. „(go)“, „(finir)“, „(tener)“, „(laudare)“), die Lösung ist eine ANDERE Form davon – nie das Wort aus der Vorgabe selbst.',
  '- Ist die Lösung ein Wort, das man WÄHLT statt bildet (Präposition, Konjunktion, Artikel, Pronomen, Relativ- oder Fragewort, Hilfs- oder Modalverb, Mengenwort, Signalwort), dann AUSWAHL mit Ablenkern – keine Lücke.',
  '- Der Satz erzwingt genau eine Form: Zeitsignal, Kontext oder Bezugswort machen klar, was gemeint ist. Passen grammatisch mehrere Formen (z. B. will / going to, who / that, passé composé / imparfait, ser / estar), nenne ALLE in „loesungen“ oder ändere den Satz so, dass nur eine passt.',
  '- Genau EINE Lücke „___“ je Satz. Die Lösung ist nur der Text für die Lücke – ohne Wörter, die schon im Satz stehen (kein doppeltes Subjekt oder Verb).',
  '- AUSWAHL: 3–4 Möglichkeiten, genau EINE davon ist im Satz richtig; keine zwei gleichwertigen; Ablenker sind typische Fehlformen bzw. die verwechselbare Nachbarform.',
  '- Die Anweisung passt zur Aufgabenart: „Wähle …“ nur bei Auswahl; bei Lücken „Setze … ein“ bzw. „Ergänze …“.',
  '- FEHLER FINDEN und RICHTIG ODER FALSCH: Der Fehlersatz ist in JEDER Lesart falsch – nicht nur in der gemeinten. Hängt der Fehler am Bezug (his/her, our/their, Pronomen, Person, Zeit), legt der Kontext den Bezug fest („Anna has a dog. She is here with ___ dog." statt „Anna is here with his dog.", denn der Hund kann einem Jungen gehören). Das Fehlerwort steht nur EINMAL im Satz, und der Satz lässt sich nur auf EINE Weise mit einem Wort berichtigen.',
  '- BEZUG eindeutig: Bei Possessivbegleitern, Pronomen und Personenformen steht der Bezug (Besitzer, Person) im Satz oder Kontext und ist der einzige mögliche – nicht zwei Personen verschiedenen Geschlechts oder ein Paar, aus dem einer gemeint sein könnte („Max and Lily are twins. ___ dog …" lässt Their, His und Her zu). Tiere mit Namen: it UND he/she gelten – beide in „loesungen" oder Tier ohne Namen.',
  '- FEHLER FINDEN und RICHTIG ODER FALSCH: nur Fehler, die sich durch Ersetzen GENAU EINES Wortes durch EIN anderes Wort beheben lassen (eine Kurzform zählt als ein Wort) – keine Fehler durch ein überflüssiges oder fehlendes Wort und keine Wortstellungsfehler. Der Fehler betrifft die geübte Grammatik, nicht Rechtschreibung oder anderes.',
  '- Zeichensetzung und Wortstellung (Komma bei Relativsätzen, Stellung von Adverbien, Inversion, Fragen): nie als Lücke mit einem Satzzeichen oder „—“ als Lösung; stattdessen Auswahl zwischen ganzen Sätzen (satz = „___“, optionen = vollständige Sätze), Satzbau oder Umformen.',
  '- UMFORMEN: Anweisung oder vorgabe nennt die Zielform; die Lösung ist ein anderer Satz als der Ausgangssatz; alle gleichwertigen Fassungen in „loesungen“.',
  '- SATZBAU: genau eine sinnvolle Reihenfolge; die geübte Form steht nicht schon fertig in einem einzigen Teil.',
  '- Satzanfang („anfang") beim Umformen, Verbinden und Fragenbilden: nie das Wort, das die Lernenden bilden sollen (Umformen „My hair …" über Ryan: kein Anfang „His").',
  '- Vorgabe beim Bilden: nie alle Wörter der Lösung („(can / ride)" → „can ride" ist Abschreiben); stattdessen Grundform plus Signal bzw. Verneinung („(ride)" mit Kontext, „(not / dance)" → „can\'t dance") oder Auswahl.',
  '- SORTIEREN und ZUORDNEN: Die Zuordnung verlangt die Regel, nicht ein äußeres Merkmal – nicht alle Elemente einer Gruppe mit demselben Anfangswort, das die anderen nicht haben („Don\'t …" gegen alles andere). Beim Zuordnen passt jede rechte Seite zu GENAU EINER linken: keine zwei Paare desselben Musters, die man vertauschen könnte (zwei „Is there …?"-Fragen mit „Yes, there is." und „No, there isn\'t." nur, wenn der Kontext die Antwort festlegt).',
  '- Lösungen sind tippbare Wörter der Zielsprache – keine Erklärungen („streichen“, „nichts“), keine Platzhalter („—“), kein „/“ zwischen Varianten (jede Variante einzeln in „loesungen“).',
  // Neubeginn 28.10.2026 – Recherche (Fachdidaktik, Übungsseiten, Ausarbeitung je Form) und Abstimmung mit der Lehrkraft
  'KONTEXT statt Einzelsatz: Legt ein Satz allein die Form nicht fest (Zeitform/Aspekt, will/going to, Modalverb nach Bedeutung, indirekte Rede, Artikel bei Erstnennung …), schreibe 1–3 kurze Sätze Vorlauf in „kontext“ (Situation, Zeit, Beleg) oder nutze Lückentext bzw. Dialog. Kontext sprachlich einfacher als die geübte Grammatik.',
  'Mittel für Eindeutigkeit: Verb UND Signalwort in die Klammer („(tidy / already)“); beim Bilden die Zielform als Etikett („Passiv, Past Perfect:“) – nie beim Erkennen; Kontrastpaar im selben Satz („often …, but today …“); vorgegebener Teilsatz (if-Satz, Zeitsatz); vorgegebene Antwort beim Fragenbilden; Wortkasten, in dem jedes Wort genau einmal passt.',
  'Gleichwertige Formen (might/may/could, must/have to, who/that, somebody/someone, Kurz- und Langform) nie als richtige und falsche Möglichkeit gegeneinander; beim Tippen alle in „loesungen“. Norm ist britisches Schulenglisch („If I were you“, „I have just bought“).',
  'Formate: LÜCKENTEXT („lueckentext“): 60–120 Wörter (oder Dialog mit Zeilen „A: …“/„B: …“), 3–6 Lücken „___“, je Lücke in „luecken“ das Grundwort als „vorgabe“ bzw. „optionen“ und alle „loesungen“; jede Lücke ohne die anderen lösbar, Lücken nicht direkt hintereinander, eine Verbform in genau eine Lücke. SÄTZE VERBINDEN („verbinden“): zwei kurze Sätze in „satz“, Bindewort in „vorgabe“ (z. B. „(who)“); „anfang“ höchstens der Satzgegenstand bzw. die ersten Wörter VOR der geübten Stelle (z. B. „I have a friend“ bei who) – nie das Bindewort samt ganzem Teilsatz und nie so viel, dass der Rest wörtlich in den Ausgangssätzen steht (sonst üben die Lernenden nur Abschreiben); ohne „…“; „loesungen“ = ganze Sätze mit allen Varianten (Stellung, who/that, mit und ohne weglassbares Pronomen). FRAGE BILDEN („frage“): die Antwort in „satz“, Fragewort bzw. Hilfe in „vorgabe“, „loesungen“ = ganze Fragen. MARKIEREN („markieren“): 1–3 Sätze in „satz“, die zu markierenden Wörter genau wie im Text in „zielWoerter“. SORTIEREN („sortieren“): 2–3 „gruppen“, 6–8 „elemente“ mit Gruppennummer (0 = erste Gruppe). MEHRFACHAUSWAHL („mehrfach“): 4–5 „optionen“, alle richtigen in „loesungen“ – für gleichwertige Varianten.',
  'Kommas: „kommaPruefen“ nur true, wenn die geübte Grammatik selbst eine Kommaregel ist (Relativsätze, if-Satz vorne, Satzadverbien) – sonst zählt ein Komma mehr oder weniger beim Tippen ganzer Sätze nicht.',
  'Möglichkeiten dürfen die Lösung nicht an der Oberfläche verraten: Fragt die Anweisung nach einer Form („Wähle alle Wörter mit an“), steht diese Form NICHT schon in den Möglichkeiten (also „apple, dog, hour“ statt „an apple, a dog“); beim Sortieren tragen die Elemente nicht schon das Gruppenwort.',
  'Personen in Aufgaben: erfundene, gewöhnliche englische Vornamen – NIE Platzhalter wie „[Person-1]“ (die stehen nur für echte Namen im Auftrag und dürfen nicht in Aufgaben erscheinen).',
  'Zu JEDER Aufgabe eine „erklaerung“: ein kurzer Satz auf Deutsch, warum diese Form (z. B. „Signal: yet → present perfect“) – die Lernenden sehen ihn nach der Antwort.'
].join('\n')

/** Zusatz für die Prüfung durch die KI: dieselben Regeln als Prüfpunkte */
export const PRUEF_REGELN =
  'ok = false auch, wenn eine Regel aus QUALITÄT verletzt ist und sich nicht über Lösungen, Möglichkeiten oder Fehlerwort reparieren lässt – besonders: Lücke ohne Grundwort, deren Lösung man raten muss; Vorgabe gleich Lösung; mehrere Lücken; Fehler, der sich nicht durch EIN Wort beheben lässt; Auswahl mit zwei richtigen Möglichkeiten; nicht tippbare Lösung. ' +
  'Bei Fehler finden und Richtig oder falsch zusätzlich: „Gibt es eine Lesart (anderer Besitzer, andere Person, andere Situation), in der der Satz RICHTIG wäre?“ Wenn ja: ok = false. Beim Zuordnen: „Ließen sich zwei Paare vertauschen?“ Wenn ja: ok = false. ' +
  'Prüfe JEDE Aufgabe mit der Frage: „Wäre mit diesem Satz bzw. Kontext auch eine andere Form richtig?“ Wenn ja: gleichwertige Alternative in die Lösungen aufnehmen – sonst ok = false (der Kontext legt die Form nicht fest).'

// ---------------------------------------------------------------- ohne KI richten

const klammerInhalt = (v: string | undefined): string =>
  String(v ?? '')
    .trim()
    .replace(/^\(\s*|\s*\)$/g, '')
    .trim()

/** Möglichkeiten aus einer Vorgabe wie „(since / for)“ oder „(who oder which)“; leer, wenn keine Wahl darin steht */
export function wahlAusVorgabe(vorgabe: string | undefined): string[] {
  const innen = klammerInhalt(vorgabe)
  if (!innen || !/\s\/\s|\/|\s(oder|or|ou|o)\s/i.test(innen)) return []
  const teile = innen
    .split(/\s*\/\s*|\s+(?:oder|or|ou|o)\s+|\s*,\s*/i)
    .map((x) => x.trim())
    .filter(Boolean)
  return teile.length >= 2 && teile.length <= 5 ? teile : []
}

/** Möglichkeiten aus einer Anweisung wie „Setze despite, in spite of oder because of ein.“ */
export function wahlAusAnweisung(anweisung: string | undefined): string[] {
  const m = /(?:setze|ergänze|wähle|trage)\s+(.+?)\s+(?:ein|richtig ein|in die lücke)\b/i.exec(String(anweisung ?? ''))
  if (!m) return []
  const teile = m[1]
    .replace(/[„“"‚‘']/g, '')
    .split(/\s*,\s*|\s+oder\s+|\s*\/\s*/i)
    .map((x) => x.trim())
    .filter(Boolean)
  return teile.length >= 2 && teile.length <= 5 && teile.every((t) => t.split(/\s+/).length <= 4) ? teile : []
}

const enthalten = (liste: readonly string[], wert: string): boolean => liste.some((x) => normiert(x) === normiert(wert))

/**
 * Was sich ohne KI richten lässt (28.10.2026). Rein: liefert eine neue Aufgabe, die Kennung bleibt.
 *  - Lücke beim Erkennen/Unterscheiden mit einer Wahl in Vorgabe oder Anweisung („(since / for)“) → Auswahl mit diesen Möglichkeiten.
 *  - Lücke beim Erkennen/Unterscheiden mit Grundform (≠ Lösung) → Übungsart Bilden (das ist sie in der Sache).
 *  - „Wähle …“ bei einer Lücke → „Setze … ein“.
 *  - doppelte Möglichkeiten bei der Auswahl entfernen.
 */
export function aufgabeNormalisiert<T extends GrammatikAufgabe>(a: T): T {
  let x: T = { ...a }
  if (x.art === 'luecke' && (x.uebung === 'erkennen' || x.uebung === 'unterscheiden') && x.loesungen.length) {
    const wahl = wahlAusVorgabe(x.vorgabe)
    const ausAnweisung = wahl.length ? [] : !x.vorgabe ? wahlAusAnweisung(x.anweisung) : []
    const moeglich = wahl.length ? wahl : ausAnweisung
    if (moeglich.length && enthalten(moeglich, x.loesungen[0]) && moeglich.filter((m) => enthalten(x.loesungen, m)).length === 1) {
      const richtig = moeglich.find((m) => normiert(m) === normiert(x.loesungen[0]))!
      const { vorgabe: _v, ...rest } = x
      void _v
      x = { ...(rest as T), art: 'auswahl', optionen: moeglich, loesungen: [richtig], anweisung: 'Wähle die passende Form.' }
    } else if (x.vorgabe && !wahl.length && !enthalten(x.loesungen, klammerInhalt(x.vorgabe))) {
      x = { ...x, uebung: 'bilden' }
    }
  }
  if (x.art === 'luecke' && /^\s*w[äa]hle\b/i.test(x.anweisung)) x = { ...x, anweisung: x.vorgabe ? 'Setze die passende Form ein.' : 'Ergänze die Lücke.' }
  // Grundwort doppelt (Probelauf 28.10.2026: „We ___ (have) this computer" UND Vorgabe „(have)") – die App zeigt die Vorgabe
  // selbst hinter der Lücke, im Satz fällt sie weg
  if (x.art === 'luecke' && x.vorgabe && x.satz.includes(x.vorgabe.trim())) {
    const satz = x.satz.replace(x.vorgabe.trim(), '').replace(/\s{2,}/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim()
    if (satz.includes('___')) x = { ...x, satz }
  }
  // Richtig-falsch (28.10.2026, Durchsicht der Bank: Lösungen ["falsch", "for"]): das Urteil gehört nicht in die Lösungen
  if (x.art === 'richtigfalsch' && x.loesungen.some((l) => /^(richtig|falsch|true|false)$/i.test(l.trim()))) {
    const rest = x.loesungen.filter((l) => !/^(richtig|falsch|true|false)$/i.test(l.trim()))
    if (rest.length) x = { ...x, loesungen: rest }
  }
  // Nummern vor den Lücken (29.10.2026, Blindprobe: „(1) (1) ___") – die App nummeriert die Lücken selbst
  if (x.art === 'lueckentext' && /\(\d+\)\s*_{3,}/.test(x.satz)) x = { ...x, satz: x.satz.replace(/\(\d+\)\s*(?=_{3,})/g, '') }
  if (x.art === 'auswahl' && x.optionen) {
    const ohne: string[] = []
    for (const o of x.optionen) if (!enthalten(ohne, o)) ohne.push(o)
    if (ohne.length !== x.optionen.length) x = { ...x, optionen: ohne }
  }
  return x
}

// ---------------------------------------------------------------- Mängel

// Ganze Lösung ein Platzhalter oder eine Anweisung (nicht einzelne Wörter darin – „nichts“ kann im Deutschen die Lösung sein)
const UNTIPPBAR = /^[\s—–\-.,;:!?…]*$|^\s*[—–]|^\s*\(?\s*(streichen|entfernen|weglassen|kein wort|leer lassen)\b|\b(streichen|entfernen)\s*\)?\s*$/i
const wortzahl = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length

/**
 * Mangel einer Aufgabe nach den Regeln (28.10.2026) – leer, wenn keiner. Geprüft wird, was sich am Text sicher erkennen
 * lässt; inhaltliche Fehler findet nur die KI bzw. die Prüfung durch eine Lehrkraft.
 */
export function aufgabeMangel(a: GrammatikAufgabe): string {
  const l = a.loesungen ?? []
  if (a.art === 'luecke' || a.art === 'auswahl') {
    const n = (a.satz.match(/___/g) ?? []).length
    if (n !== 1) return 'mehrere Lücken in einem Satz'
  }
  if (a.art === 'luecke') {
    const v = klammerInhalt(a.vorgabe)
    if (v && !wahlAusVorgabe(a.vorgabe).length && enthalten(l, v)) return 'Vorgabe ist schon die Lösung'
    if (vorgabeZusammengesetzt(a.vorgabe, l)) return 'Vorgabe ist schon die Lösung (nur abschreiben)'
    if (a.uebung === 'erkennen' || a.uebung === 'unterscheiden') return 'freie Lücke beim Erkennen bzw. Unterscheiden (braucht Auswahl)'
    // Eine Lücke heißt: aus einem Grundwort bilden – ohne Vorgabe und ohne genannte Wahl muss geraten werden (29.10.2026:
    // auch beim Anwenden, „Tom is ___ bed." mit „in" – die Präposition wird gewählt, nicht gebildet)
    if (!a.vorgabe && !wahlAusAnweisung(a.anweisung).length) return 'Lücke ohne Grundwort (gewähltes Wort braucht Auswahl)'
  }
  if (['luecke', 'umformen', 'fehler'].includes(a.art) && l.some((x) => UNTIPPBAR.test(x) || /\s\/\s/.test(x))) return 'Lösung nicht tippbar'
  if (a.art === 'auswahl') {
    if (!a.optionen || a.optionen.length < 2 || !enthalten(a.optionen, l[0] ?? '')) return 'Lösung steht nicht unter den Möglichkeiten'
  }
  if (a.art === 'fehler') {
    if (!a.fehlerWort || !woerterVon(a.satz).some((w) => normiert(w) === normiert(a.fehlerWort!))) return 'Fehlerwort steht nicht im Satz'
    if (enthalten(l, a.fehlerWort)) return 'Korrektur gleich Fehlerwort'
    if (fehlerWortMehrfach(a)) return 'Fehlerwort steht mehrmals im Satz'
    if (l.length && l.every((x) => wortzahl(x) > 2)) return 'Fehler lässt sich nicht durch ein Wort beheben'
  }
  if (a.art === 'umformen' && l.length && enthalten(l, a.satz)) return 'Lösung gleich Ausgangssatz'
  // Neue Formate (28.10.2026)
  const produktion = ['luecke', 'umformen', 'lueckentext', 'verbinden', 'frage', 'satzbau']
  if ((a.uebung === 'erkennen') && produktion.includes(a.art)) return 'Erkennen verlangt Auswahl, nicht Tippen'
  if (a.art === 'lueckentext') {
    const n = (a.satz.match(/___/g) ?? []).length
    if (!a.luecken?.length || n !== a.luecken.length) return 'Lückenzahl passt nicht zum Text'
    for (const g of a.luecken) {
      const v = klammerInhalt(g.vorgabe)
      if (v && !wahlAusVorgabe(g.vorgabe).length && enthalten(g.loesungen, v)) return 'Vorgabe ist schon die Lösung (Lückentext)'
      if (vorgabeZusammengesetzt(g.vorgabe, g.loesungen)) return 'Vorgabe ist schon die Lösung (Lückentext, nur abschreiben)'
      if (!g.vorgabe?.trim() && !g.optionen?.length && !a.wortkasten?.length) return 'Lücke ohne Grundwort (Lückentext)'
      if (g.loesungen.some((x) => UNTIPPBAR.test(x) || /\s\/\s/.test(x))) return 'Lösung nicht tippbar (Lückentext)'
    }
  }
  if (a.art === 'verbinden') {
    if (!a.vorgabe && !a.anfang) return 'Bindewort bzw. Satzanfang fehlt'
    if (l.length && enthalten(l, a.satz)) return 'Lösung gleich Ausgangssätzen'
  }
  // Platzhalter des Namensschutzes statt eines Namens (28.10.2026, Durchsicht der Bank: „[Person-3] has had this laptop …"
  // – die KI ahmte die Platzhalter für erfundene Personen nach, sie lassen sich nicht zurückübersetzen)
  if (PLATZHALTER.test(JSON.stringify([a.anweisung, a.kontext, a.satz, a.anfang, a.vorgabe, a.loesungen, a.optionen, a.teile, a.paare, a.elemente, a.luecken, a.wortkasten])))
    return 'Platzhalter statt Name ([Person-…])'
  if (moeglichkeitenVerraten(a)) return 'Möglichkeiten verraten die Lösung (das gesuchte Wort steht schon darin)'
  // Satzanfang verrät die Lösung (28.10.2026, Frage der Lehrkraft: „Woher wissen die Schüler, dass ‚Ella was watering the
  // plants' kommen müsste?" – Anfang „While the neighbours were talking," ließ nur das Abschreiben des zweiten Satzes übrig)
  if (satzanfangVerraet(a)) return 'Satzanfang verrät die Lösung (Rest steht wörtlich in der Vorgabe)'
  if ((a.art === 'verbinden' || a.art === 'frage') && l.some((x) => UNTIPPBAR.test(x))) return 'Lösung nicht tippbar'
  if (a.art === 'richtigfalsch' && fehlerWortMehrfach(a)) return 'Fehlerwort steht mehrmals im Satz'
  if (a.art === 'markieren' && !a.ziele?.length) return 'nichts zu markieren'
  if (a.art === 'sortieren' && ((a.gruppen?.length ?? 0) < 2 || (a.elemente?.length ?? 0) < 4)) return 'zu wenig zum Sortieren'
  if (a.art === 'satzbau' && a.teile?.length && l.length) {
    const nur = (s: string): string => normiert(s).replace(/[^\p{L}\p{N}]/gu, '')
    if (!l.some((x) => nur(x) === nur(a.teile!.join(' ')))) return 'Teile ergeben nicht die Lösung'
  }
  // Selbsttest (28.10.2026): eigene Lösung gilt, falsche Möglichkeiten nicht, Aufbau passt zum Format
  const st = selbsttest(a)
  if (st.length) return `Selbsttest: ${st[0]}`
  return ''
}

/**
 * Verraten die Möglichkeiten die Lösung? (29.10.2026, Befund der Lehrkraft: „Wähle alle Wortgruppen mit an" – die
 * Möglichkeiten „an apple", „a dog" … zeigten die Lösung schon an) Auswahl/Mehrfachauswahl: ein Wort aus der Anweisung
 * steht in allen richtigen und in keiner falschen Möglichkeit. Sortieren: jedes Element trägt das Wort seiner Gruppe.
 */
export function moeglichkeitenVerraten(a: Pick<GrammatikAufgabe, 'art' | 'anweisung' | 'optionen' | 'loesungen' | 'gruppen' | 'elemente'>): boolean {
  const w = (s: string): Set<string> => new Set(woerterVon(s).map((x) => normiert(x)))
  if (a.art === 'mehrfach' || a.art === 'auswahl') {
    const o = a.optionen ?? []
    const richtig = o.filter((x) => (a.loesungen ?? []).some((l) => normiert(l) === normiert(x)))
    const falsch = o.filter((x) => !richtig.includes(x))
    // Einzelwörter („since / for / from") sind selbst die Antwort – verraten nur Wortgruppen und Sätze etwas
    if (!richtig.length || !falsch.length || o.some((x) => woerterVon(x).length < 2)) return false
    const anweisung = w(a.anweisung)
    return [...w(richtig[0])].some((t) => anweisung.has(t) && richtig.every((x) => w(x).has(t)) && falsch.every((x) => !w(x).has(t)))
  }
  if (a.art === 'sortieren') {
    const g = (a.gruppen ?? []).map((x) => woerterVon(x).map(normiert))
    const e = a.elemente ?? []
    if (g.length < 2 || !e.length) return false
    // Ein Gruppenwort (z. B. „an"), das genau in den Elementen dieser Gruppe vorkommt
    if (
      g.some((gw, k) =>
        gw.some((t) => e.filter((x) => x.gruppe === k).every((x) => w(x.text).has(t)) && e.filter((x) => x.gruppe !== k).every((x) => !w(x.text).has(t)))
      )
    )
      return true
    // Alle Elemente einer Gruppe beginnen mit demselben Wort, das sonst kein Element trägt (29.10.2026, Prüfung: „Don't sit …",
    // „Don't forget …" gegen „Sit …", „Bring …" – sortierbar ohne die Regel, nur am ersten Wort)
    const erstes = (x: { text: string }): string => normiert(woerterVon(x.text)[0] ?? '')
    return g.some((_, k) => {
      const drin = e.filter((x) => x.gruppe === k)
      const t = drin.length >= 3 ? erstes(drin[0]) : ''
      return !!t && drin.every((x) => erstes(x) === t) && e.filter((x) => x.gruppe !== k).every((x) => !w(x.text).has(t))
    })
  }
  return false
}

/**
 * Vorgabe nur zusammengesetzt (29.10.2026, Prüfung: „(can / ride)" → „can ride", „(can't / dance)" → „can't dance"): Jedes
 * Wort jeder Lösung steht schon in der Vorgabe – die Lernenden schreiben ab, statt eine Form zu bilden. Eine echte Wahl
 * („(since / for)" → „for") ist eine einzelne Möglichkeit und fällt nicht darunter.
 */
export function vorgabeZusammengesetzt(vorgabe: string | undefined, loesungen: readonly string[]): boolean {
  const v = new Set(woerterVon(klammerInhalt(vorgabe).replace(/\//g, ' ')).map((x) => normiert(x)))
  if (v.size < 2 || !loesungen.length) return false
  return loesungen.every((l) => {
    const t = woerterVon(l).map((x) => normiert(x))
    return t.length >= 2 && t.every((x) => v.has(x))
  })
}

/** Fehlerwort mehrmals im Satz (29.10.2026, Prüfung: „While my sister was reading, my brothers was …") – welches ist gemeint? */
export function fehlerWortMehrfach(a: Pick<GrammatikAufgabe, 'satz' | 'fehlerWort'>): boolean {
  if (!a.fehlerWort?.trim()) return false
  const f = normiert(a.fehlerWort)
  return woerterVon(a.satz).filter((w) => normiert(w) === f).length > 1
}

/** Platzhalter des Namensschutzes („[Person-3]", auch ohne Klammern) */
export const PLATZHALTER = /\[?Person-\d+\]?/

/**
 * Verrät der Satzanfang die Lösung? Beim Umformen bzw. Sätzeverbinden: Was nach dem Anfang zu tippen bleibt, steht
 * wörtlich (ohne Satzzeichen, Groß-/Kleinschreibung) im Ausgangstext – dann übt die Aufgabe nur das Abschreiben.
 */
export function satzanfangVerraet(a: Pick<GrammatikAufgabe, 'art' | 'anfang' | 'satz' | 'loesungen'>): boolean {
  if ((a.art !== 'umformen' && a.art !== 'verbinden') || !a.anfang || !a.loesungen?.length) return false
  const nur = (s: string): string =>
    normiert(s)
      .replace(/[^\p{L}\p{N}' ]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const anfang = nur(satzanfang(a.anfang))
  const vorlage = ` ${nur(a.satz)} `
  return a.loesungen.every((x) => {
    const l = nur(x)
    if (!l.startsWith(anfang)) return false
    const rest = l.slice(anfang.length).trim()
    return rest.split(' ').length >= 2 && vorlage.includes(` ${rest} `)
  })
}

/** Neue Aufgaben (KI): erst richten, dann alles mit Mangel weglassen – mit Gründen für den Bericht */
export function aufgabenGeprueft<T extends GrammatikAufgabe>(liste: readonly T[]): { aufgaben: T[]; gestrichen: { grund: string; satz: string }[] } {
  const aufgaben: T[] = []
  const gestrichen: { grund: string; satz: string }[] = []
  for (const roh of liste) {
    const a = aufgabeNormalisiert(roh)
    const m = aufgabeMangel(a)
    if (m) gestrichen.push({ grund: m, satz: a.satz.slice(0, 80) })
    else aufgaben.push(a)
  }
  return { aufgaben, gestrichen }
}
