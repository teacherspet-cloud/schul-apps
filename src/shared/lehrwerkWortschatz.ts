/**
 * Wortschatz nach Lehrwerksstand (29.10.2026, Auftrag der Lehrkraft: „Manche Aufgaben benutzen Vokabular, das bis
 * einschließlich Green Line 1 Unit 1 – zur jeweiligen Station der Grammatikform – nicht bekannt ist … und Formulierungen
 * und Grammatikformen, die Schüler bis dahin noch nicht kennen (z. B. ‚Ella has an hour for lunch.')").
 *
 * Die Aufgabenbank gilt für alle Lehrwerke – maßgeblich ist darum die FRÜHESTE Einführung einer Form (Band, Unit, Abschnitt).
 * Bekannt ist dort: alle Einträge früherer Bände der Reihe, früherer Units und der Abschnitte der Unit bis einschließlich
 * dem der Form. Geprüft werden die englischen Teile einer Aufgabe; Namen (groß mitten im Satz), Zahlen und
 * Grundformen hinter Plural-s, Kurzformen ('m, 're, 's, n't) zählen nicht als unbekannt.
 */
import type { GrammatikAufgabe } from './grammatiktrainer'

export interface WortschatzBand {
  name: string
  grade?: number
  units: { name: string; sections: { name: string; entries: { term: string; translation?: string; example?: string; exampleTranslation?: string }[] }[] }[]
}

/**
 * Deutsch und Englisch einer Lehrwerksreihe (29.10.2026, Nachtrag: „sichtbaren", „vorher", „gefasster" in deutschen
 * Situationen galten als unbekannte englische Wörter – eine feste Liste reicht nicht): alle deutschen Wörter aus Übersetzungen
 * und Beispielübersetzungen, alle englischen aus Begriffen und Beispielen
 */
export interface Lexikon {
  deutsch: ReadonlySet<string>
  englisch: ReadonlySet<string>
}
export function lexikonAus(baende: readonly WortschatzBand[]): Lexikon {
  const deutsch = new Set<string>()
  const englisch = new Set<string>()
  for (const b of baende)
    for (const u of b.units)
      for (const s of u.sections)
        for (const e of s.entries) {
          for (const t of `${e.term} ${e.example ?? ''}`.toLowerCase().match(/[a-z]+/g) ?? []) englisch.add(t)
          for (const t of `${e.translation ?? ''} ${e.exampleTranslation ?? ''}`.toLowerCase().match(/[a-zäöüß]+/g) ?? []) deutsch.add(t)
        }
  return { deutsch, englisch }
}

/** Grammatik eines Bands: Unit → Abschnitt → Punkte mit Katalog-Kennungen (wie LEHRWERK_GRAMMATIK) */
export type GrammatikBand = Record<string, Record<string, { text: string; t: string[] }[]>>

export interface Einfuehrung {
  buch: string
  unit: string
  abschnitt: string
}

const klein = (s: string): string => s.toLocaleLowerCase('en').replace(/[’‘`´]/g, "'")

/** Wörter eines englischen Textes (klein, Kurzformen aufgelöst) */
export function wortformen(text: string): string[] {
  const aus: string[] = []
  for (const roh of klein(text).match(/[a-z]+(?:'[a-z]+)?/g) ?? []) {
    const [w, k] = roh.split("'")
    if (k === undefined) aus.push(...(w === 'cannot' ? ['can', 'not'] : [w]))
    else if (k === 't' && w.endsWith('n')) aus.push(w === 'can' ? 'can' : w === 'won' ? 'will' : w.slice(0, -1), 'not')
    else if (k === 'm') aus.push(w, 'am')
    else if (k === 're') aus.push(w, 'are')
    else if (k === 've') aus.push(w, 'have')
    else if (k === 'll') aus.push(w, 'will')
    else if (k === 'd') aus.push(w, 'would')
    // 's: is bzw. Genitiv – die Grundform zählt
    else aus.push(w)
  }
  return aus
}

/** Bekannte Wörter aus Einträgen (Begriffe wie „to be", „Good morning.", „(to) like" in Einzelwörter) */
export function wortschatzAus(eintraege: readonly { term: string }[]): Set<string> {
  const s = new Set<string>()
  for (const e of eintraege) for (const w of wortformen(e.term.replace(/\([^)]*\)/g, (x) => x.slice(1, -1)))) s.add(w)
  return s
}

/** Grundformen eines Wortes für den Abgleich: Plural-/3.-Person-s, -es, -ies → -y */
// -ing und -ed (29.10.2026, Handbetrieb: „singing", „ringing" bei bekanntem sing/ring galten als unbekannt): making → make,
// running → run, played → play, liked → like, studied → study
const stamme = (w: string): string[] => [
  w,
  w.replace(/ies$/, 'y'),
  w.replace(/es$/, ''),
  w.replace(/s$/, ''),
  ...(/..ing$/.test(w) ? [w.slice(0, -3), `${w.slice(0, -3)}e`, w.slice(0, -4)] : []),
  ...(/..ed$/.test(w) ? [w.slice(0, -2), w.slice(0, -1), w.slice(0, -3), w.replace(/ied$/, 'y')] : []),
  // Adverbien auf -ly und Steigerung (29.10.2026, Handbetrieb Green Line 5: „quickly", „younger", „oldest" galten bei
  // bekanntem quick/young/old als unbekannt – die Listen führen nur die Grundform): quickly → quick, happily → happy,
  // gently → gentle, bigger → big, nicer → nice, easiest → easy
  ...(/...ly$/.test(w) ? [w.slice(0, -2), w.replace(/ily$/, 'y'), w.replace(/ly$/, 'le')] : []),
  ...(/...er$/.test(w) ? [w.slice(0, -2), w.slice(0, -1), w.slice(0, -3), w.replace(/ier$/, 'y')] : []),
  ...(/...est$/.test(w) ? [w.slice(0, -3), w.slice(0, -2), w.slice(0, -4), w.replace(/iest$/, 'y')] : [])
]

export const istBekanntesWort = (w: string, bekannt: ReadonlySet<string>): boolean => /^\d/.test(w) || stamme(w).some((x) => bekannt.has(x))

/**
 * Bekannter Wortschatz bis zu einer Stelle: `baende` sind die Bände der Reihe in Reihenfolge (Klasse aufsteigend).
 * Ohne passenden Abschnitt gilt die ganze Unit.
 */
export function bekannterWortschatz(baende: readonly WortschatzBand[], stelle: Einfuehrung): Set<string> {
  const eintraege: { term: string }[] = []
  for (const b of baende) {
    if (b.name !== stelle.buch) {
      for (const u of b.units) for (const s of u.sections) eintraege.push(...s.entries)
      continue
    }
    for (const u of b.units) {
      if (u.name !== stelle.unit) {
        for (const s of u.sections) eintraege.push(...s.entries)
        continue
      }
      const bis = u.sections.findIndex((s) => s.name === stelle.abschnitt)
      for (const [i, s] of u.sections.entries()) if (bis < 0 || i <= bis) eintraege.push(...s.entries)
      break
    }
    break
  }
  return wortschatzAus(eintraege)
}

/** Gehört die Bank-Kennung (Teilform, Thema, gemischt) zu einem Grammatikpunkt mit diesen Katalog-Kennungen? */
const passt = (kennung: string, t: readonly string[]): boolean => t.some((k) => k === kennung || (!k.includes('/') && kennung.split('/')[0] === k))

/**
 * Früheste Einführung einer Bank-Kennung: Bände in Reihenfolge, Units und Abschnitte in Buchreihenfolge. Gemischte
 * Übungen („mix:a+b") gelten ab der spätesten ihrer Formen.
 */
export function fruehesteEinfuehrung(schluessel: string, baende: readonly { name: string; grammatik: GrammatikBand }[]): Einfuehrung | null {
  if (schluessel.startsWith('mix:')) {
    const teile = schluessel.slice(4).split('+')
    const stellen = teile.map((k) => fruehesteEinfuehrung(k, baende))
    if (stellen.some((x) => !x)) return null
    const rang = (e: Einfuehrung): number[] => {
      const bi = baende.findIndex((b) => b.name === e.buch)
      const units = Object.keys(baende[bi].grammatik)
      const ui = units.indexOf(e.unit)
      return [bi, ui, Object.keys(baende[bi].grammatik[e.unit]).indexOf(e.abschnitt)]
    }
    return (stellen as Einfuehrung[]).reduce((a, b) => (rang(b).join('.').localeCompare(rang(a).join('.'), 'en', { numeric: true }) > 0 ? b : a))
  }
  for (const b of baende)
    for (const [unit, abschnitte] of Object.entries(b.grammatik))
      for (const [abschnitt, punkte] of Object.entries(abschnitte)) if (punkte.some((p) => passt(schluessel, p.t))) return { buch: b.name, unit, abschnitt }
  return null
}

/** Katalog-Kennungen der Grammatik, die bis zu einer Stelle eingeführt ist */
export function bekannteKennungen(baende: readonly { name: string; grammatik: GrammatikBand }[], stelle: Einfuehrung): string[] {
  const aus: string[] = []
  for (const b of baende) {
    for (const [unit, abschnitte] of Object.entries(b.grammatik)) {
      for (const [abschnitt, punkte] of Object.entries(abschnitte)) {
        aus.push(...punkte.flatMap((p) => p.t))
        if (b.name === stelle.buch && unit === stelle.unit && abschnitt === stelle.abschnitt) return aus
      }
      if (b.name === stelle.buch && unit === stelle.unit) return aus
    }
    if (b.name === stelle.buch) return aus
  }
  return aus
}

/**
 * Unregelmäßige Formen bekannter Verben (29.10.2026, Nachtrag: „told", „came" galten in Klasse 11 als unbekannt – die
 * Vokabellisten führen nur die Grundform): Vergangenheitsformen, sobald das simple past eingeführt ist, Partizipien ab
 * present perfect bzw. Passiv. Vorher bleiben sie unbekannt (in Green Line 1, Unit 1 also kein „went").
 */
export function mitUnregelmaessigenFormen(
  bekannt: ReadonlySet<string>,
  verben: readonly { formen: Record<string, string> }[],
  kennungen: readonly string[]
): Set<string> {
  const aus = new Set(bekannt)
  const past = kennungen.some((k) => k.startsWith('en.verb.past_simple'))
  const pp = kennungen.some((k) => /^en\.verb\.(present_perfect|past_perfect|passive)/.test(k))
  if (!past && !pp) return aus
  const woerter = (s: string | undefined): string[] => (s ?? '').toLowerCase().match(/[a-z]+/g) ?? []
  for (const v of verben) {
    if (!woerter(v.formen.inf).some((w) => w !== 'to' && bekannt.has(w))) continue
    if (past) woerter(v.formen.past).forEach((w) => aus.add(w))
    if (pp) woerter(v.formen.pp).forEach((w) => aus.add(w))
  }
  return aus
}

/** Grammatik, die bis zu einer Stelle eingeführt ist (Bezeichnungen der Punkte) */
export function bekannteGrammatik(baende: readonly { name: string; grammatik: GrammatikBand }[], stelle: Einfuehrung): string[] {
  const aus: string[] = []
  for (const b of baende) {
    for (const [unit, abschnitte] of Object.entries(b.grammatik)) {
      for (const [abschnitt, punkte] of Object.entries(abschnitte)) {
        aus.push(...punkte.map((p) => p.text))
        if (b.name === stelle.buch && unit === stelle.unit && abschnitt === stelle.abschnitt) return aus
      }
      if (b.name === stelle.buch && unit === stelle.unit) return aus
    }
    if (b.name === stelle.buch) return aus
  }
  return aus
}

/**
 * Wörter der geübten Form selbst sind immer erlaubt (29.10.2026: „own" steht bei der Teilform „own" nicht in der Liste
 * bis Station 3 – es ist der Lernstoff): englische Teile der Kennungen hinter „/" („his-her" → his, her)
 */
export function formWoerter(schluessel: string): string[] {
  const teile = schluessel.replace(/^mix:/, '').split('+')
  const zusatz = Object.entries(FORM_ZUSATZ)
    .filter(([k]) => teile.some((t) => t.startsWith(k)))
    .flatMap(([, w]) => w)
  return [...new Set([...teile.flatMap((k) => (k.split('/')[1] ?? '').split(/[-_]/)).filter((w) => /^[a-z]+$/.test(w)), ...zusatz])]
}

/**
 * Wörter, die zur geübten Form gehören, auch wenn die Vokabelliste sie nicht führt (29.10.2026, Handbetrieb Green Line 5:
 * „myself", „yourselves" fehlen in der Liste, obwohl -self-Pronomen geübt werden; „probably" ist das Signal der Vorhersage)
 */
const SELF = ['myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves', 'themselves', 'oneself']
const FORM_ZUSATZ: Record<string, string[]> = {
  'en.pron.emphatic': SELF,
  'en.pron.reflexive': SELF,
  'en.focus.emphasis': SELF,
  'en.focus.inversion': ['seldom', 'scarcely', 'sooner', 'circumstances', 'account'],
  'en.verb.will_vs_goingto': ['probably', 'perhaps', 'maybe', 'sure']
}

/** Typische Fehlformen, die als Fehlerwort oder Ablenker absichtlich vorkommen – keine Vokabeln */
const FEHLFORMEN = new Set(['hisself', 'theirself', 'theirselves', 'ourself', 'themself', 'themselfs', 'yourselfs', 'myselves', 'hisselves'])

/**
 * Deutsche Wörter, die in Aufgaben neben Englischem stehen (29.10.2026, Handbetrieb: „Emma statt Tom", „unter dem Tisch",
 * „richtig / falsch", „Verbot (tu es nicht)" zählten als unbekannte englische Wörter – 54 gute Aufgaben fielen weg).
 * Ohne Wörter, die es auch im Englischen gibt (hat, war, will, also, so, man, kind, art …).
 */
const DEUTSCHE_WOERTER = new Set(
  (
    'der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner und oder aber nicht ist sind sein ' +
    'seine seinen seinem seiner ihr ihre ihren ihrem ihrer unser unsere euer eure mein meine dein deine ich du er sie es wir ' +
    'mich dich sich uns euch mir dir ihm ihnen wer wen wem wessen wie wo wann warum wieso welche welcher welches mit ohne ' +
    'für gegen von vom zu zum zur bei beim nach aus auf unter über hinter vor neben zwischen gegenüber statt anstatt im ins am an ' +
    'als auch noch schon nur jetzt heute gestern morgen hier dort ja nein bitte danke richtig falsch gleich ganz sehr viel ' +
    'satz sätze wort wörter frage fragen antwort antworten aufforderung verbot verbote besitz besitzer form formen lücke ' +
    'verneinen verneint verneinte verneinter verneinung kurzform langform kurzantwort zeitform signal signalwort gruppe ' +
    'tu tue tun mach macht machen hast habe haben darf dürfen kann können muss müssen soll sollen schief spontan spontane ' +
    'singt sitzen sitzt steht stehen liegt liegen geht gehen gibt ort zeit person personen ding dinge tier tiere jemand etwas'
  ).split(' ')
)

const KURZ_ENDUNGEN = new Set(['ll', 're', 've'])

/**
 * Typisch deutsche Wortformen (29.10.2026, Handbetrieb Green Line 5: „reflexiv", „indirekte", „emphatisches", „gebacken",
 * „angeschnitten" in Gruppen- und Zuordnungstexten galten als unbekannte englische Wörter): -isch, -ung, -keit, -heit, -iv,
 * -kt(e), Partizip ge…en/ge…t – nur für Wörter, die kein englischer Eintrag der Reihe kennt
 */
const DEUTSCHE_FORM = /(isch|ische[nrs]?|ung|ungen|keit|heit|iv|kte[nrs]?|kt)$|^[a-z]{0,4}ge[a-z]{3,}(en|t)$/

/** Ein deutsches Wort (auch gebeugt: „sichtbaren" ← „sichtbar"), das in keinem englischen Eintrag der Reihe vorkommt */
export function istDeutschesWort(w: string, lex: Lexikon): boolean {
  if (istBekanntesWort(w, lex.englisch)) return false
  if (DEUTSCHE_FORM.test(w)) return true
  return [w, w.slice(0, -1), w.slice(0, -2), w.slice(0, -3)].some((x) => x.length >= 4 && lex.deutsch.has(x)) || (w.length < 4 && lex.deutsch.has(w))
}

/** Deutsch statt Englisch? (Kontexte und Anweisungen sind oft deutsch – die werden nicht geprüft) */
const DEUTSCH = /\b(der|die|das|und|ist|du|ich|nicht|ein|eine|mit|für|zu|auf|im|wie|was|wird|sind|gestern|heute)\b|[äöüß]/i
export const istDeutsch = (s: string): boolean => DEUTSCH.test(s)

/** Englische Texte einer Aufgabe (ohne Anweisung, Erklärung und deutschen Kontext) */
export function englischeTexte(a: GrammatikAufgabe): string[] {
  // Was Lernende sehen, dazu die Hauptlösung – weitere gleichwertige Lösungen (z. B. „Are there any …?") erweitern nur,
  // was als richtig zählt, und lassen eine Aufgabe nicht wegfallen
  const t: string[] = [a.satz, a.anfang ?? '', a.vorgabe ?? '', a.loesungen?.[0] ?? '', ...(a.optionen ?? []), ...(a.teile ?? []), ...(a.wortkasten ?? [])]
  for (const p of a.paare ?? []) t.push(p.links, p.rechts)
  for (const e of a.elemente ?? []) t.push(e.text)
  for (const l of a.luecken ?? []) t.push(l.vorgabe ?? '', l.loesungen[0] ?? '', ...(l.optionen ?? []))
  if (a.kontext && !istDeutsch(a.kontext)) t.push(a.kontext)
  // Gruppen beim Sortieren sind Beschriftungen („Passiv-Infinitiv", „reflexiv") – keine Vokabeln (29.10.2026)
  return t.filter((x) => x && x.trim() && !istDeutsch(x))
}

/**
 * Unbekannte Wörter einer Aufgabe. Namen: groß geschriebene Wörter, die nicht am Satzanfang stehen bzw. als Name in einer
 * Liste stehen (Wörter, die mit Großbuchstaben bekannt sind, bleiben Wörter). `extra`: zusätzlich erlaubte Wörter.
 */
export function unbekannteWoerter(a: GrammatikAufgabe, bekannt: ReadonlySet<string>, extra: readonly string[] = [], lexikon?: Lexikon): string[] {
  const erlaubt = new Set([...bekannt, ...extra.map(klein)])
  const aus = new Set<string>()
  for (const text of englischeTexte(a)) {
    const roh = text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) ?? []
    roh.forEach((r) => {
      // Name: groß und kein bekanntes Wort (am Satzanfang nur, wenn es klein auch unbekannt ist)
      const gross = /^[A-Z]/.test(r)
      for (const w of wortformen(r)) {
        if (istBekanntesWort(w, erlaubt)) continue
        // Einzelne Buchstaben (Sprecher „A:"/„B:", Aufzählungen) und deutsche Wörter neben dem Englischen
        // Kurzformen-Endungen („'ll", „'re", „'ve" – 29.10.2026) und absichtliche Fehlformen zählen nicht
        if (w.length < 2 || KURZ_ENDUNGEN.has(w) || FEHLFORMEN.has(w) || DEUTSCHE_WOERTER.has(w) || (lexikon && istDeutschesWort(w, lexikon))) continue
        if (gross && w === klein(r).split("'")[0]) continue
        aus.add(w)
      }
    })
  }
  return [...aus]
}
