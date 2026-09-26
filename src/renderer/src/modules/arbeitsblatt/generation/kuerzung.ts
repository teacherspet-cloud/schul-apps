/**
 * Originaltexte auf eine Längenvorgabe bringen – und nachweisen, dass dabei nur gekürzt wurde.
 *
 * Wunsch der Lehrkraft (24.09.2026): „Hier soll die KI im Hintergrund nach geeigneten
 * Originalmaterialien im Internet suchen. Diese dürfen gekürzt werden ‚[...]‘ und mit anderen
 * Methoden auf Längenvorgaben reduziert werden."
 *
 * Rechtlicher Rahmen (recherchiert, § aus dem Gesetzestext auf gesetze-im-internet.de):
 * - § 62 Abs. 5 UrhG: „bei Nutzungen für Unterricht und Lehre sowie für Unterrichts- und
 *   Lehrmedien bedarf es keiner Einwilligung, wenn die Änderungen deutlich sichtbar kenntlich
 *   gemacht werden." Das ist die Grundlage für die Kürzung – und zugleich ihre Bedingung.
 * - § 62 Abs. 1 UrhG: Grundsatz bleibt das Änderungsverbot. Umschreiben, Vereinfachen und
 *   Neuformulieren sind damit ausgeschlossen, auch wenn sie den Text „besser" machen würden.
 * - § 14 UrhG (Entstellung) nennt bewusst KEINE Prozentgrenze. Eine Zahl wäre erfunden; die
 *   App misst deshalb den Anteil und zeigt ihn der Lehrkraft, statt ihn zu bewerten.
 *
 * Deshalb prüft diese Datei nicht, ob der gekürzte Text „gut" ist, sondern ob er noch aus dem
 * Original besteht: Jedes Stück muss wörtlich und in der richtigen Reihenfolge im Original
 * stehen. Eine KI, die einen Satz „glättet", fällt hier auf – und genau das ist der Punkt,
 * denn ein geglätteter Satz sieht für die Lehrkraft aus wie ein Zitat.
 */

/** Auslassungszeichen, die als Kürzung gelten – in der Schreibweise, die in Prüfungsaufgaben üblich ist. */
const AUSLASSUNG = /\[\s*(?:…|\.\.\.|\. \. \.)\s*\]/g

/** Eckige Klammer mit Inhalt, also eine Einfügung wie „[Müller]" – keine Auslassung. */
const EINFUEGUNG = /\[([^\][]{1,80})\]/g

export interface Wort {
  /** zum Vergleichen: klein, ohne Satzzeichen */
  norm: string
  /** wie es im Text steht – dafür, dass das Protokoll lesbar bleibt */
  roh: string
}

/**
 * Text in vergleichbare Wörter zerlegen.
 *
 * Satzzeichen, Anführungszeichen und Zeilenumbrüche fallen weg: Sie unterscheiden sich
 * zwischen Fundort und Abschrift ständig (typografische vs. gerade Anführungszeichen,
 * Bindestrich vs. Gedankenstrich) und sagen nichts darüber, ob der Wortlaut stimmt.
 *
 * Die ursprüngliche Schreibweise bleibt erhalten: Im Kürzungsprotokoll soll „Am Hafen
 * standen die Kräne still" stehen und nicht „am hafen standen die kräne still".
 */
export function zerlege(text: string): Wort[] {
  const out: Wort[] = []
  for (const m of text.normalize('NFKC').matchAll(/[\p{L}\p{N}]+/gu)) {
    out.push({ roh: m[0], norm: m[0].toLowerCase().replace(/ſ/g, 's').replace(/ß/g, 'ss') })
  }
  return out
}

export function woerter(text: string): string[] {
  return zerlege(text).map((w) => w.norm)
}

export function wortzahl(text: string): number {
  return woerter(text.replace(AUSLASSUNG, ' ')).length
}

export interface Kuerzungsstelle {
  /** Wörter des Originals, die an dieser Stelle fehlen */
  wortzahl: number
  /** die ersten Wörter des weggelassenen Stücks – damit die Lehrkraft nachsehen kann, was fehlt */
  anfang: string
}

export interface KuerzungsPruefung {
  ok: boolean
  wortzahlOriginal: number
  wortzahlGekuerzt: number
  /** Anteil des Originals, der übrig ist (0–1) */
  anteil: number
  /** die einzelnen Auslassungen, in der Reihenfolge des Textes */
  auslassungen: Kuerzungsstelle[]
  /** Inhalte eckiger Klammern, also Einfügungen der Bearbeitung */
  einfuegungen: string[]
  /** Anfang und Schluss des Originals sind erhalten */
  anfangErhalten: boolean
  schlussErhalten: boolean
  /** Klartext für die Lehrkraft – leer, wenn alles stimmt */
  verstoesse: string[]
}

/** Wie viele Wörter eine Einfügung in eckigen Klammern im Original höchstens ersetzt haben darf. */
const EINFUEGUNG_ERSETZT_MAX = 4

/**
 * Prüft, ob `gekuerzt` durch reines Weglassen aus `original` entstanden ist.
 *
 * Vorgehen: Der gekürzte Text wird an den Auslassungszeichen und an den eckigen Klammern in
 * Stücke zerlegt. Jedes Stück muss im Original wörtlich vorkommen, und zwar hinter dem
 * vorigen Stück. Dadurch fällt jede Umstellung und jede Umformulierung auf.
 *
 * An einem Auslassungszeichen darf beliebig viel fehlen. An einer eckigen Klammer darf nur
 * wenig fehlen: Dort wurde ein Bezugswort ersetzt („er" → „[Müller]"), nicht gekürzt. Wer
 * dort stillschweigend einen Absatz weglässt, umgeht die Kennzeichnungspflicht.
 */
export function pruefeKuerzung(original: string, gekuerzt: string): KuerzungsPruefung {
  const quelleRoh = zerlege(original)
  const quelle = quelleRoh.map((w) => w.norm)
  const verstoesse: string[] = []
  const auslassungen: Kuerzungsstelle[] = []
  const einfuegungen: string[] = []

  // Den gekürzten Text in Stücke zerlegen und dabei merken, welche Lücke davor erlaubt ist
  type Stueck = { woerter: string[]; luecke: 'frei' | 'klein' | 'keine' }
  const stuecke: Stueck[] = []
  let luecke: Stueck['luecke'] = 'keine'
  for (const teil of gekuerzt.split(AUSLASSUNG)) {
    // Innerhalb eines Stücks trennen die eckigen Klammern weitere Abschnitte ab
    const teile: string[] = []
    let letztes = 0
    let m: RegExpExecArray | null
    EINFUEGUNG.lastIndex = 0
    while ((m = EINFUEGUNG.exec(teil))) {
      einfuegungen.push(m[1].trim())
      teile.push(teil.slice(letztes, m.index))
      letztes = m.index + m[0].length
    }
    teile.push(teil.slice(letztes))
    /*
     * Die Lücke „klein" gilt erst ab dem ZWEITEN Stück mit Text. Steht die eckige Klammer
     * gleich am Anfang („[…] [Müller] sagte …"), gehört die vorangehende Auslassung noch zum
     * Auslassungszeichen davor – sonst würde die erlaubte Ergänzung als Verstoß gemeldet.
     */
    let schonText = false
    for (const t of teile) {
      const w = woerter(t)
      if (!w.length) continue
      stuecke.push({ woerter: w, luecke: schonText ? 'klein' : luecke })
      schonText = true
    }
    luecke = 'frei'
  }

  if (!stuecke.length) {
    return {
      ok: false,
      wortzahlOriginal: quelle.length,
      wortzahlGekuerzt: 0,
      anteil: 0,
      auslassungen: [],
      einfuegungen,
      anfangErhalten: false,
      schlussErhalten: false,
      verstoesse: ['Der gekürzte Text ist leer.']
    }
  }

  // Die Stücke der Reihe nach im Original wiederfinden
  let pos = 0
  let ersterTreffer = -1
  let letztesEnde = -1
  for (const stueck of stuecke) {
    const start = findeFolge(quelle, stueck.woerter, pos)
    if (start < 0) {
      /*
       * Eine umformulierte Stelle und eine stillschweigende Kürzung sind hier nicht zu
       * unterscheiden – in beiden Fällen steht die Wortfolge so nicht im Original. Die
       * Meldung nennt deshalb beides, statt sich auf eine Deutung festzulegen.
       */
      verstoesse.push(`Diese Stelle steht so nicht im Original – umformuliert oder ohne Kennzeichnung gekürzt: „${stueck.woerter.slice(0, 8).join(' ')} …"`)
      continue
    }
    if (ersterTreffer < 0) ersterTreffer = start
    const fehlend = letztesEnde >= 0 ? start - letztesEnde : 0
    if (fehlend > 0) {
      if (stueck.luecke === 'frei')
        auslassungen.push({
          wortzahl: fehlend,
          anfang: quelleRoh
            .slice(letztesEnde, letztesEnde + 8)
            .map((w) => w.roh)
            .join(' ')
        })
      else if (fehlend > EINFUEGUNG_ERSETZT_MAX)
        verstoesse.push(`An einer eckigen Klammer fehlen ${fehlend} Wörter des Originals – eine Kürzung gehört mit […] gekennzeichnet.`)
      else if (stueck.luecke === 'keine') verstoesse.push(`Zwischen zwei Stellen fehlen ${fehlend} Wörter ohne Kennzeichnung – Auslassungen brauchen ein […].`)
    }
    letztesEnde = start + stueck.woerter.length
    pos = letztesEnde
  }

  const wortzahlGekuerzt = stuecke.reduce((n, s) => n + s.woerter.length, 0)
  const anfangErhalten = ersterTreffer === 0
  const schlussErhalten = letztesEnde === quelle.length
  return {
    ok: verstoesse.length === 0,
    wortzahlOriginal: quelle.length,
    wortzahlGekuerzt,
    anteil: quelle.length ? wortzahlGekuerzt / quelle.length : 0,
    auslassungen,
    einfuegungen,
    anfangErhalten,
    schlussErhalten,
    verstoesse
  }
}

/** Sucht die Wortfolge `nadel` in `heu` ab `ab` und liefert die Anfangsstelle oder -1. */
function findeFolge(heu: string[], nadel: string[], ab: number): number {
  if (!nadel.length) return ab
  for (let i = ab; i + nadel.length <= heu.length; i++) {
    let passt = true
    for (let j = 0; j < nadel.length; j++) {
      if (heu[i + j] !== nadel[j]) {
        passt = false
        break
      }
    }
    if (passt) return i
  }
  return -1
}

/**
 * Der Satz, der nach § 62 Abs. 5 UrhG unter dem Text stehen muss.
 *
 * „Deutlich sichtbar kenntlich gemacht" heißt: nicht nur die […] im Text, sondern ein Satz,
 * den auch jemand versteht, der die Stelle im Original nie gesehen hat.
 */
export function kuerzungsHinweis(p: KuerzungsPruefung): string {
  if (!p.auslassungen.length && !p.einfuegungen.length) return ''
  const teile: string[] = []
  if (p.auslassungen.length) teile.push('gekürzt')
  if (p.einfuegungen.length) teile.push('Ergänzungen in eckigen Klammern')
  return `Der Text wurde für diese Aufgabe ${teile.join(', ')}.`
}

/**
 * Das Protokoll für den Lehrkraftteil.
 *
 * Die Lehrkraft muss die Kürzung verantworten, ohne den Originaltext daneben zu legen.
 * Deshalb steht hier, wie viel wo fehlt – nicht nur, DASS gekürzt wurde.
 */
export function kuerzungsProtokoll(p: KuerzungsPruefung): string[] {
  const zeilen = [`Umfang: ${p.wortzahlGekuerzt} von ${p.wortzahlOriginal} Wörtern (${Math.round(p.anteil * 100)} % des Originals).`]
  if (!p.anfangErhalten) zeilen.push('Der Text beginnt nicht am Anfang des Originals.')
  if (!p.schlussErhalten) zeilen.push('Der Text endet vor dem Schluss des Originals.')
  for (const [i, a] of p.auslassungen.entries()) zeilen.push(`Auslassung ${i + 1}: ${a.wortzahl} Wörter ab „${a.anfang} …"`)
  // Leere Klammern „[]" ergaben die Zeile „Ergänzung in eckigen Klammern: „"" (gesehen 26.09.2026)
  for (const e of p.einfuegungen) if (e.trim()) zeilen.push(`Ergänzung in eckigen Klammern: „${e.trim()}"`)
  for (const v of p.verstoesse) zeilen.push(`ACHTUNG: ${v}`)
  return zeilen
}
