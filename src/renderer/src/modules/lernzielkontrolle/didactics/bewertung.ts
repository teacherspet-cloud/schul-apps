/**
 * Punkte und Notenschlüssel der Lernzielkontrolle.
 *
 * ENTSCHEIDUNG DER LEHRKRAFT (23.09.2026): Punkte je Aufgabe stehen auf dem Blatt der
 * Lernenden (abschaltbar), der NOTENSCHLÜSSEL steht nur auf dem Lösungsblatt.
 *
 * Das ist auch die rechtlich sichere Seite: Berlin verlangt einen Notenspiegel ausdrücklich
 * nur bei Klassenarbeiten (Sek I-VO § 19 Abs. 7). Für Kurztests ist er nirgends
 * vorgeschrieben, und die echten Vorlagen, die der Recherche zugrunde lagen – bayerische
 * Stegreifaufgaben – tragen weder Punkte noch Schlüssel.
 *
 * ZUR BELEGLAGE DER SCHLÜSSEL: Nur EIN Land hat einen verbindlichen Prozentschlüssel.
 * Mecklenburg-Vorpommern, LeistBewVO § 4 Abs. 3: ab 96 % = 1, 80 % = 2, 60 % = 3, 40 % = 4,
 * 20 % = 5, darunter 6. Wörtlich: „Maßgeblich … sind ganze Prozentwerte. Eine Rundung findet
 * nicht statt." Nach § 4 Abs. 4 gilt diese Tabelle für schriftliche Lernerfolgskontrollen
 * ausdrücklich nur „als Orientierung" – „unter Berücksichtigung von Umfang und Komplexität".
 *
 * Die verbreiteten linearen Schlüssel (100/87/75/62/50) und der „IHK-Schlüssel"
 * (92/81/67/50/30) sind Faustregeln OHNE Rechtsgrundlage. Sie werden hier angeboten, aber
 * ausdrücklich so benannt – wer sie nutzt, soll wissen, dass er keine Vorschrift befolgt.
 */

export type SchluesselId = 'keiner' | 'standard' | 'mv' | 'linear' | 'ihk' | 'eigen'

export interface Notenschluessel {
  id: SchluesselId
  name: string
  /** Prozentgrenzen für die Noten 1 bis 5; darunter 6 */
  grenzen: [number, number, number, number, number]
  /** true = in mindestens einem Land verbindlich vorgeschrieben */
  verbindlich: boolean
  herkunft: string
}

export const SCHLUESSEL: Notenschluessel[] = [
  {
    id: 'standard',
    name: 'Eigener Schlüssel aus den Einstellungen',
    // Platzhalter: Die tatsächlichen Schwellen stehen in den Einstellungen, je Fach
    grenzen: [91, 78, 64, 50, 25],
    verbindlich: false,
    herkunft:
      'Der in den Einstellungen hinterlegte Schlüssel – allgemein oder für dieses Fach. Keine Rechtsvorschrift, sondern die Festlegung der Lehrkraft bzw. der Fachkonferenz.'
  },
  {
    id: 'mv',
    name: 'Mecklenburg-Vorpommern',
    grenzen: [96, 80, 60, 40, 20],
    verbindlich: true,
    herkunft: 'LeistBewVO § 4 Abs. 3. Für Lernerfolgskontrollen gilt er nach Abs. 4 nur „als Orientierung", unter Berücksichtigung von Umfang und Komplexität.'
  },
  {
    id: 'linear',
    name: 'Linear (100/87/75/62/50)',
    grenzen: [87, 75, 62, 50, 25],
    verbindlich: false,
    herkunft: 'Verbreitete Faustregel ohne Rechtsgrundlage. In keiner der geprüften Länderverordnungen vorgeschrieben.'
  },
  {
    id: 'ihk',
    name: 'IHK-Schlüssel (92/81/67/50/30)',
    grenzen: [92, 81, 67, 50, 30],
    verbindlich: false,
    herkunft: 'Aus der beruflichen Bildung übernommen. Für allgemeinbildende Schulen keine Rechtsgrundlage ermittelt.'
  }
]

export const schluesselById = (id: SchluesselId): Notenschluessel | undefined => SCHLUESSEL.find((s) => s.id === id)

/**
 * Der gewünschte Umfang der Gesamtpunktzahl.
 *
 * Warum eine SPANNE und keine feste Zahl: Eine feste Vorgabe („genau 20 Punkte") zwingt
 * dazu, Punkte auf Aufgaben zu verteilen, die den Aufwand nicht abbilden – am Ende bekommt
 * eine kurze Umformung drei Punkte, damit die Summe stimmt. Eine Spanne lässt die
 * Bepunktung dem Aufwand folgen und hält den Test trotzdem in dem Rahmen, den die Schule
 * oder die Fachkonferenz erwartet.
 *
 * Belegt ist nichts davon: Keine der geprüften Länderverordnungen schreibt eine
 * Punktzahl für kurze Leistungsnachweise vor. Die Spanne ist deshalb ein Wunsch der
 * Lehrkraft, kein Sollwert der App – sie wird an die KI weitergegeben und am Ende geprüft,
 * aber nie erzwungen.
 */
export interface Punktebereich {
  min: number
  max: number
}

export interface Bewertungseinstellung {
  /** Punkte je Aufgabe auf dem Blatt der Lernenden */
  punkteAufBlatt: boolean
  /** Welcher Schlüssel auf dem Lösungsblatt steht */
  schluessel: SchluesselId
  /** Eigene Grenzen, wenn schluessel === 'eigen' */
  eigeneGrenzen?: [number, number, number, number, number]
  /** Gewünschte Gesamtpunktzahl; fehlt sie, richtet sich die Bepunktung allein nach dem Aufwand */
  bereich?: Punktebereich
}

export const STANDARD_BEWERTUNG: Bewertungseinstellung = { punkteAufBlatt: true, schluessel: 'standard' }

/** Liegt die Punktzahl in der gewünschten Spanne? */
export const imBereich = (punkte: number, bereich?: Punktebereich): boolean => !bereich || (punkte >= bereich.min && punkte <= bereich.max)

export interface Notenzeile {
  note: number
  /** Ab dieser Prozentzahl */
  abProzent: number
  /** Ab dieser Punktzahl bei der Gesamtpunktzahl des Tests */
  abPunkten: number
}

/**
 * Rechnet den Schlüssel auf die tatsächliche Punktzahl um.
 *
 * MV schreibt vor: „Maßgeblich … sind ganze Prozentwerte. Eine Rundung findet nicht statt."
 * Deshalb wird die Punktgrenze AUFGERUNDET – die Note gilt erst, wenn der Prozentwert
 * wirklich erreicht ist. Abrunden würde die Note bei einem halben Punkt zu früh vergeben.
 */
/**
 * Welche Schwellen gelten?
 *
 * `standard` holt sie aus den Einstellungen – dort sind sie je Fach hinterlegbar. Deshalb
 * nimmt diese Funktion die Schwellen als Argument entgegen, statt sie selbst zu suchen: Das
 * Didaktik-Modul kennt die Einstellungen nicht und soll sie auch nicht kennen.
 */
export function grenzenFuer(einstellung: Bewertungseinstellung, ausEinstellungen?: number[]): number[] | undefined {
  if (einstellung.schluessel === 'eigen') return einstellung.eigeneGrenzen
  if (einstellung.schluessel === 'standard') return (ausEinstellungen ?? SCHLUESSEL[0].grenzen).slice(0, 5)
  return schluesselById(einstellung.schluessel)?.grenzen
}

export function notenspiegel(gesamtpunkte: number, einstellung: Bewertungseinstellung, ausEinstellungen?: number[]): Notenzeile[] {
  const grenzen = grenzenFuer(einstellung, ausEinstellungen)
  if (!grenzen || gesamtpunkte <= 0) return []
  return grenzen.map((p, i) => ({
    note: i + 1,
    abProzent: p,
    abPunkten: Math.ceil((p / 100) * gesamtpunkte * 100) / 100
  }))
}

/**
 * Summe der Punkte über alle Aufgaben.
 *
 * Teilaufgaben tragen im Datenmodell keine eigenen Punkte – die Punktzahl hängt an der
 * Aufgabe. Das ist bei einem Kurztest auch angemessen: Bei zwei bis vier Aufgaben wäre eine
 * Bepunktung je Teilaufgabe mehr Buchhaltung als Nutzen.
 */
export function gesamtpunkte(blocks: { type: string; points?: number }[]): number {
  return blocks.filter((b) => b.type === 'task').reduce((s, b) => s + (b.points ?? 0), 0)
}

export interface BewertungsWarnung {
  message: string
}

/**
 * Prüft die Bepunktung auf das, was beim Korrigieren wehtut.
 *
 * Nicht auf „richtig" oder „falsch" – wie viele Punkte eine Aufgabe wert ist, entscheidet
 * die Lehrkraft. Gemeldet wird nur, was das Blatt in sich unstimmig macht.
 */
export function pruefeBewertung(blocks: { type: string; points?: number }[], einstellung: Bewertungseinstellung): BewertungsWarnung[] {
  const out: BewertungsWarnung[] = []
  const aufgaben = blocks.filter((b) => b.type === 'task')
  const summe = gesamtpunkte(blocks)

  /*
   * Der Hinweis gilt nur, wenn das Blatt ueberhaupt Punkte tragen SOLL.
   *
   * Seit der Notenschluessel voreingestellt ist, haette die Warnung sonst jedes Blatt
   * getroffen, auf dem die Lehrkraft die Punkte bewusst abgeschaltet hat – dort erscheint
   * der Schluessel ohnehin nicht, und eine Warnung waere blosse Noergelei.
   */
  if (einstellung.punkteAufBlatt && einstellung.schluessel !== 'keiner' && summe === 0 && aufgaben.length > 0) {
    out.push({ message: 'Es ist ein Notenschlüssel eingestellt, aber keine Aufgabe trägt Punkte. Ohne Gesamtpunktzahl hat der Schlüssel keine Bezugsgröße.' })
  }
  if (einstellung.punkteAufBlatt && aufgaben.length > 0) {
    const ohne = aufgaben.filter((b) => (b.points ?? 0) === 0)
    if (ohne.length && ohne.length < aufgaben.length) {
      out.push({ message: `${ohne.length} von ${aufgaben.length} Aufgaben tragen keine Punkte. Entweder alle oder keine – sonst wirkt es wie ein Versehen.` })
    }
  }
  const b = einstellung.bereich
  if (b) {
    if (b.min > b.max) {
      out.push({ message: `Der Punktebereich ist verdreht: von ${b.min} bis ${b.max}.` })
    } else if (summe > 0 && !imBereich(summe, b)) {
      out.push({
        message: `Der Test hat ${summe} Punkte, gewünscht waren ${b.min} bis ${b.max}. Die Punkte lassen sich in der Aufgabenliste einzeln ändern – oder Sie passen die Spanne an.`
      })
    }
  }
  const s = grenzenFuer(einstellung)
  if (s) {
    for (let i = 1; i < s.length; i++) {
      if (s[i] >= s[i - 1]) {
        out.push({ message: `Der Notenschlüssel steigt nicht: Note ${i + 1} beginnt bei ${s[i]} %, Note ${i} schon bei ${s[i - 1]} %.` })
        break
      }
    }
  }
  return out
}

/**
 * Der Hinweis, der am Notenschlüssel auf dem Lösungsblatt steht.
 *
 * Er sagt, woher der Schlüssel kommt. Ein Schlüssel ohne Herkunft sieht aus wie eine
 * Vorschrift, und die verbreiteten sind keine.
 */
export function schluesselHinweis(einstellung: Bewertungseinstellung, ausEinstellungen?: number[]): string {
  if (einstellung.schluessel === 'keiner') return ''
  if (einstellung.schluessel === 'eigen') return 'Eigener Schlüssel der Schule bzw. der Fachkonferenz.'
  if (einstellung.schluessel === 'standard') {
    const g = (ausEinstellungen ?? SCHLUESSEL[0].grenzen).slice(0, 5)
    return `Eigener Schlüssel aus den Einstellungen (1 ab ${g[0]} %, 2 ab ${g[1]} %, 3 ab ${g[2]} %, 4 ab ${g[3]} %, 5 ab ${g[4]} %). Keine Rechtsvorschrift, sondern die Festlegung der Lehrkraft bzw. der Fachkonferenz.`
  }
  const s = schluesselById(einstellung.schluessel)
  if (!s) return ''
  return `${s.name}: ${s.herkunft}`
}
