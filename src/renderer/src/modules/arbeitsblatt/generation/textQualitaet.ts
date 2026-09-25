/**
 * Gefundenes Originalmaterial messen, aussortieren und in eine Reihenfolge bringen.
 *
 * Wunsch der Lehrkraft (24.09.2026): „Recherchiere außerdem ausführlich nach
 * Qualitätskriterien für Originalmaterial, um gefundenes Material zu filtern und zu ranken
 * bevor es den Nutzern gezeigt wird."
 *
 * Zwei Arten von Kriterien stecken hier drin, und sie sind streng getrennt:
 *
 * 1. FACHLICH – was die amtlichen Prüfungsanforderungen von Material verlangen.
 *    EPA Geschichte 3.3.3 (KMK, i.d.F. 10.02.2005), wörtlich: Quellenauszüge müssen
 *    „ergiebig genug sein, um ein längeres Arbeiten mit ihnen zu ermöglichen"; „Umfang und
 *    Komplexität der Materialien sollen der Aufgabenstellung und der Prüfungszeit angemessen
 *    sein"; „Die Materialien sind in drucktechnisch einwandfreiem Zustand vorzulegen."
 *    EPA Geographie 3.3 ergänzt: „Die verwendete Datenbasis sollte in sich stimmig und so
 *    zeitnah wie möglich sein."
 *
 * 2. TECHNISCH – woran man einen unbrauchbaren Fund erkennt, bevor jemand ihn liest.
 *    Die Schwellenwerte stammen aus veröffentlichten Verfahren, nicht aus dem Gefühl:
 *    - jusText (corpus.tools): Blocklänge 70/200 Zeichen, Linkdichte 0,2, Stoppwortdichte
 *      0,30/0,32. Ein Block mit wenig Stoppwörtern ist fast immer Navigation, kein Fließtext.
 *    - C4 (Raffel u. a. 2019): nur Zeilen behalten, die auf einem Satzzeichen enden; Seiten
 *      mit weniger als drei Sätzen verwerfen; Zeilen mit „lorem ipsum", „Javascript" oder
 *      geschweiften Klammern entfernen; mehrfach vorkommende Drei-Satz-Fenster verwerfen.
 *
 * Warum das nötig ist: Eine Archivsuche liefert zuverlässig auch Registerseiten, Scans mit
 * Trennstrichen am Zeilenende und Seiten, die zu 80 % aus Navigation bestehen. Bekäme die
 * Lehrkraft die ungefiltert vorgelegt, müsste sie jeden Treffer selbst öffnen – und genau
 * die Arbeit soll ihr die Suche abnehmen.
 */

import { stoppwortSatz } from '@shared/stoppwoerter'

/** Zeilen und Wendungen, die kein Werk sind, sondern Beiwerk der Seite (C4, Raffel u. a. 2019). */
const MUELL = [
  /lorem ipsum/i,
  /\bjavascript\b/i,
  /\bcookies?\b.{0,20}\b(policy|richtlinie|einstellungen)\b/i,
  /nutzungsbedingungen|terms of use|privacy policy|datenschutzerkl/i,
  /\bimpressum\b/i,
  /alle rechte vorbehalten|all rights reserved/i,
  /diese seite (wurde|ist)|zur navigation springen|zur suche springen/i
]

/**
 * Wörter und Schreibweisen, an denen sich ein sprachlich sehr alter Text erkennen lässt.
 *
 * Frühneuhochdeutsch war orthografisch nicht geregelt; die Diphthongierung (hūs → haus) war
 * noch nicht abgeschlossen, und Fraktursatz bringt das lange s mit. Diese Liste ist eine
 * Heuristik und kein Beleg – sie soll nur verhindern, dass ein Text von 1550 ungefiltert in
 * einer siebten Klasse landet.
 */
const ALTERTUEMLICH = /\bſ|\b(vnd|vnnd|auff|seyn|jhr|jhm|alß|daß es sey|thun|thut|wardt|hatt|soll[ei]n wir|gewest)\b/gi

export interface Textbefund {
  woerter: number
  saetze: number
  /** mittlere Satzlänge in Wörtern */
  satzlaenge: number
  /** LIX nach Björnsson: Wörter/Sätze + (lange Wörter · 100)/Wörter */
  lix: number
  /** Wiener Sachtextformel 1 – Ergebnis ist eine Schulstufe (4 bis 15) */
  wstf: number
  /** Flesch-Reading-Ease in der deutschen Anpassung nach Amstad (0 schwer bis 100 leicht) */
  flesch: number
  /** Anteil der Zeilen, die auf einem Satzzeichen enden (C4) */
  satzende: number
  /** Anteil der Stoppwörter am Text (jusText) */
  stoppwortdichte: number
  /** Anteil rein alphabetischer Zeichen – niedrig bei Tabellen und Registern */
  buchstaben: number
  /** Anteil doppelter Drei-Satz-Fenster (C4-Deduplizierung) */
  wiederholung: number
  /** Trennstriche am Zeilenende je Wort – Hinweis auf einen unaufbereiteten Scan */
  trennstriche: number
  /** Treffer je 1000 Wörter für sprachlich sehr alte Formen */
  altertuemlich: number
  /** gefundene Beiwerk-Marker */
  muell: string[]
}

const SATZ_ENDE = /[.!?…"»«]["')\]]?\s*$/

/** Silben grob zählen: Vokalgruppen. Für Lesbarkeitsformeln genau genug, für Lyrik nicht. */
export function silben(wort: string): number {
  const gruppen = wort.toLowerCase().match(/[aeiouyäöü]+/g)
  return Math.max(1, gruppen?.length ?? 1)
}

export function saetzeVon(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

export function untersuche(text: string, sprache = 'de'): Textbefund {
  const woerter = text.match(/[\p{L}\p{N}]+/gu) ?? []
  const saetze = saetzeVon(text)
  const zeilen = text.split('\n').filter((z) => z.trim().length > 0)
  const stopp = stoppwortSatz(sprache)

  const lang = woerter.filter((w) => w.length > 6).length
  const mehrsilbig = woerter.filter((w) => silben(w) >= 3).length
  const einsilbig = woerter.filter((w) => silben(w) === 1).length
  const silbenGesamt = woerter.reduce((n, w) => n + silben(w), 0)
  const n = Math.max(1, woerter.length)
  const s = Math.max(1, saetze.length)

  const satzlaenge = woerter.length / s
  const MS = (mehrsilbig / n) * 100
  const IW = (lang / n) * 100
  const ES = (einsilbig / n) * 100
  const ASW = silbenGesamt / n

  // Drei-Satz-Fenster, die mehr als einmal vorkommen (C4)
  const fenster = new Map<string, number>()
  for (let i = 0; i + 3 <= saetze.length; i++) {
    const schluessel = saetze
      .slice(i, i + 3)
      .join(' ')
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]+/gu, '')
    fenster.set(schluessel, (fenster.get(schluessel) ?? 0) + 1)
  }
  const doppelt = [...fenster.values()].filter((v) => v > 1).length

  const buchstaben = (text.match(/[\p{L}]/gu) ?? []).length / Math.max(1, text.replace(/\s/g, '').length)

  return {
    woerter: woerter.length,
    saetze: saetze.length,
    satzlaenge,
    lix: satzlaenge + (lang * 100) / n,
    /*
     * Die Wiener Sachtextformel ist nur zwischen Schulstufe 4 und 15 definiert
     * (Bamberger/Vanecek 1984). Bei sehr einfachen Texten rechnet sie rechnerisch darunter –
     * „etwa Klasse 2" wäre dann eine Zahl, die die Formel gar nicht behauptet. Deshalb
     * begrenzt auf den Bereich, für den sie gilt.
     */
    wstf: Math.min(15, Math.max(4, 0.1935 * MS + 0.1672 * satzlaenge + 0.1297 * IW - 0.0327 * ES - 0.875)),
    flesch: 180 - satzlaenge - 58.5 * ASW,
    satzende: zeilen.length ? zeilen.filter((z) => SATZ_ENDE.test(z)).length / zeilen.length : 0,
    stoppwortdichte: woerter.filter((w) => stopp.has(w.toLowerCase())).length / n,
    buchstaben,
    wiederholung: fenster.size ? doppelt / fenster.size : 0,
    trennstriche: (text.match(/[\p{L}]-\n/gu) ?? []).length / n,
    altertuemlich: ((text.match(ALTERTUEMLICH) ?? []).length / n) * 1000,
    muell: MUELL.filter((r) => r.test(text)).map((r) => String(r))
  }
}

export interface Qualitaetswunsch {
  /** angestrebte Wortzahl des Ausgangstextes */
  zielWortzahl: number
  jahrgang: number
  sprache: string
}

/**
 * Gründe, einen Fund gar nicht erst anzuzeigen.
 *
 * Die Schwellenwerte stammen aus jusText und C4 (siehe Kopf der Datei). Sie sind bewusst
 * großzügig: Ein Filter, der stillschweigend gute Treffer wegwirft, ist schlimmer als
 * keiner – die Lehrkraft erfährt ja nicht, dass es sie gab.
 */
export function ausschlussgruende(b: Textbefund, wunsch: Qualitaetswunsch): string[] {
  const gruende: string[] = []
  /*
   * EPA Geschichte 3.3.3: Material muss „ergiebig genug sein, um ein längeres Arbeiten mit
   * ihnen zu ermöglichen". Aus 40 Wörtern lässt sich keine Klausuraufgabe bauen – und aus
   * einem Text, der kürzer ist als die Vorgabe, auch kein gekürzter Text.
   */
  if (b.woerter < Math.max(120, wunsch.zielWortzahl * 0.6)) gruende.push(`zu kurz (${b.woerter} Wörter)`)
  // C4: Seiten mit weniger als drei Sätzen sind kein Fließtext
  if (b.saetze < 3) gruende.push('kein zusammenhängender Text')
  // jusText: wenig Stoppwörter heißt fast immer Navigation, Register oder Tabelle
  if (b.stoppwortdichte < 0.12) gruende.push('Verzeichnis oder Tabelle, kein Fließtext')
  // C4: Fließtext endet auf Satzzeichen; Listen und Kolumnentitel tun das nicht
  if (b.satzende < 0.35) gruende.push('überwiegend Listenzeilen ohne Satzzeichen')
  if (b.buchstaben < 0.6) gruende.push('überwiegend Zahlen und Sonderzeichen')
  if (b.muell.length >= 2) gruende.push('überwiegend Seitenbeiwerk (Navigation, Rechtstexte)')
  // EPA Geschichte 3.3.3: „in drucktechnisch einwandfreiem Zustand"
  if (b.trennstriche > 0.02) gruende.push('unaufbereiteter Scan (Trennstriche am Zeilenende)')
  if (b.wiederholung > 0.3) gruende.push('viele wörtliche Wiederholungen')
  /*
   * Sprachlich sehr alte Texte sind in der Oberstufe Gegenstand des Unterrichts, in der
   * Mittelstufe aber eine Hürde, die mit dem Lernziel nichts zu tun hat.
   */
  if (wunsch.jahrgang < 9 && b.altertuemlich > 3) gruende.push('sprachlich zu alt für diesen Jahrgang')
  return gruende
}

/**
 * Rangwert von 0 bis 1 – je höher, desto besser passt der Text.
 *
 * Bewusst wenige Größen, und jede mit einem nachvollziehbaren Grund. Ein Rang aus zwanzig
 * gewichteten Zahlen sähe genauer aus, ließe sich aber nicht mehr erklären – und die
 * Lehrkraft muss die Reihenfolge nachvollziehen können, um ihr zu widersprechen.
 */
export function rangwert(b: Textbefund, wunsch: Qualitaetswunsch): number {
  /*
   * Umfang: EPA Geschichte 3.3.3 verlangt einen Umfang, der „der Aufgabenstellung und der
   * Prüfungszeit angemessen" ist. Ein Text, der ungefähr die Zielwortzahl hat, ist ideal;
   * ein deutlich längerer lässt sich kürzen, verliert dabei aber Zusammenhang.
   */
  const verhaeltnis = b.woerter / Math.max(1, wunsch.zielWortzahl)
  const umfang = verhaeltnis < 1 ? verhaeltnis : Math.max(0, 1 - (verhaeltnis - 1) / 12)

  /*
   * Schwierigkeit: Die Wiener Sachtextformel liefert eine Schulstufe (4 bis 15). Je näher
   * sie am Jahrgang liegt, desto besser. Nach OBEN wiegt die Abweichung schwerer: Ein zu
   * schwerer Text blockiert die Aufgabe, ein zu leichter macht sie nur weniger ergiebig.
   */
  const abstand = b.wstf - wunsch.jahrgang
  const schwierigkeit = Math.max(0, 1 - (abstand > 0 ? abstand / 4 : -abstand / 7))

  // Fließtextgüte nach jusText: Stoppwortdichte und Satzenden
  const fliesstext = Math.min(1, b.stoppwortdichte / 0.32) * 0.5 + b.satzende * 0.5

  return Number((umfang * 0.4 + schwierigkeit * 0.35 + fliesstext * 0.25).toFixed(4))
}

export interface Bewertung {
  befund: Textbefund
  /** leer, wenn der Text brauchbar ist */
  ausschluss: string[]
  rang: number
}

export function bewerte(text: string, wunsch: Qualitaetswunsch): Bewertung {
  const befund = untersuche(text, wunsch.sprache)
  return { befund, ausschluss: ausschlussgruende(befund, wunsch), rang: rangwert(befund, wunsch) }
}

/** Kurze Beschreibung für die Trefferliste – die Lehrkraft soll die Reihenfolge nachvollziehen können. */
export function befundText(b: Textbefund, wunsch: Qualitaetswunsch): string {
  const stufe = Math.round(b.wstf)
  const passung = stufe <= wunsch.jahrgang - 2 ? 'leicht' : stufe >= wunsch.jahrgang + 2 ? 'anspruchsvoll' : 'passend'
  return `${b.woerter.toLocaleString('de-DE')} Wörter · sprachlich ${passung} (etwa Klasse ${stufe}) · Sätze Ø ${Math.round(b.satzlaenge)} Wörter`
}
