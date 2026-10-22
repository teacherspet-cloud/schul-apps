/**
 * Höchstens drei KI-Anfragen gleichzeitig – für ALLE Wege, und jede lässt sich abbrechen.
 *
 * Anlass (25.09.2026): Material entsteht jetzt im Hintergrund, auch mehrere Aufträge
 * nebeneinander. Bis dahin gab es eine Begrenzung nur im Abo-Weg (cli.ts, `slot()`); über
 * API-Schlüssel liefen beliebig viele Anfragen zugleich. Drei parallele Arbeitsblätter mit
 * je zwei Niveaustufen und Bildprüfung hätten so ein Dutzend Anfragen auf einmal abgesetzt
 * – das endet beim Anbieter in „429 – zu viele Anfragen", und zwar für alle Aufträge.
 *
 * Was hier mitzählt: Texte (`ai:structured`), Bilder (`ai:image`) und die Websuche
 * (`ai:websuche`). Entschieden, Bilder MITzuzählen: Im Abo-Weg startet jedes Bild dasselbe
 * Programm wie eine Textanfrage und zehrt am selben Kontingent; über Claude ist ein Bild
 * sogar eine Textanfrage (Vektorgrafik). Die Bildsuche im Netz (Openverse, OpenMoji) ist
 * keine KI und zählt nicht.
 *
 * Wer warten muss, steht in einer Warteschlange. Die Oberfläche erfährt über `melde`, ob eine
 * Anfrage wartet oder läuft – so kann die Auftragsleiste „wartet auf freien Platz" zeigen, statt
 * einen stehenden Balken.
 *
 * Reihenfolge (08.10.2026, Befund in der Unterrichtsreihe): Ein Arbeitsblatt besteht aus vielen
 * Anfragen. Der Reihe nach bedient, wartete das zweite Blatt hinter ALLEN Anfragen des ersten – und
 * mehrere Blätter bremsten sich gegenseitig aus. Jetzt gilt:
 * - Anfragen ohne Auftrag (Planung, Knöpfe, die sofort eine Antwort brauchen) kommen zuerst dran;
 * - Anfragen MIT Auftrag (Kennung „<auftrag>~<anfrage>", siehe `gruppeVon`) im Wechsel je Auftrag
 *   (Round-Robin): Der Auftrag, der am längsten nicht bedient wurde, ist als Nächster dran; innerhalb
 *   eines Auftrags der Reihe nach.
 * Jede Wartende erfährt ihren Platz in der Schlange (`PlatzInfo.platz`, 1 = als Nächste dran) – die
 * Schrittkarte der Reihe zeigt „Wartet – Platz 2".
 *
 * Diese Datei kennt Electron nicht, damit sie sich ohne Programm prüfen lässt.
 */
import { AbbruchFehler } from '@shared/abbruch'
import { KiGrenzeFehler } from '@shared/kiGrenzen'

export type PlatzZustand = 'wartend' | 'laufend'

/**
 * Zusatz zur Meldung „wartend": Wie viele Plätze gerade von ABGEBROCHENEN Anfragen belegt
 * sind, die der Anbieter noch zu Ende rechnet (davon Bilder).
 *
 * Anlass (Nachtrag der Lehrkraft zu Paket 3): Die Bild-KI von OpenAI nimmt kein Abbruchsignal.
 * Für die Lehrkraft ist der Auftrag sofort abgebrochen, der Platz aber bleibt bis zum Ende
 * belegt. Wartet dadurch ein anderer Auftrag, soll die Leiste das ehrlich sagen („ein
 * abgebrochener Bildauftrag gibt seinen Platz gleich frei") – statt scheinbar grundlos zu warten.
 */
export interface PlatzInfo {
  abgebrochen: number
  abgebrocheneBilder: number
  /** Platz in der Warteschlange (1 = als Nächste dran) – nur bei „wartend" (08.10.2026) */
  platz?: number
}

interface Wartender {
  id?: string
  /** Auftrag, zu dem die Anfrage gehört (Round-Robin); fehlt = vorrangig */
  gruppe?: string
  /** Wessen Anfrage (Lehrkraft bzw. „L:" + Lehrkraft für ihre Lernenden) – Wechsel je Schlüssel (22.10.2026) */
  schluessel: string
  /** Ausgelöst von Lernenden: eigene Spur mit Obergrenze und Wartezeit */
  lernend: boolean
  los: () => void
  weg: (e: Error) => void
}

/** Trennzeichen zwischen Auftrag und Anfrage in der Kennung (renderer/shared/auftraege.ts) */
export const GRUPPEN_TRENNER = '~'

/**
 * Auftrag einer Anfrage aus ihrer Kennung: alles vor dem letzten „~" – samt Vorsatz aus dem Netz
 * („netz-<sitzung>-…"), damit gleiche Auftragsnummern verschiedener Geräte getrennt bleiben.
 * Ohne „~" gehört die Anfrage zu keinem Auftrag.
 */
export function gruppeVon(id: string | undefined): string | undefined {
  if (!id) return undefined
  const i = id.lastIndexOf(GRUPPEN_TRENNER)
  return i > 0 ? id.slice(0, i) : undefined
}

/** So lange merkt sich der Begrenzer einen Abbruch für eine Kennung, die noch nicht angekommen ist. */
const VORZEITIG_MS = 60_000

/**
 * Gerechte Verteilung auf dem Server (22.10.2026, KI-Sicherheitsprüfung H7). Bis dahin teilten sich ALLE Lehrkräfte
 * und Lernenden drei Plätze, die Schlange war unbegrenzt, und Anfragen ohne Auftrag (alle von Lernenden) gingen immer
 * vor – eine Klasse mit 30 Kindern konnte die Aufträge aller Lehrkräfte aushungern, und umgekehrt warteten Kinder
 * minutenlang ohne Rückmeldung. Jetzt:
 *  - Wechsel je Schlüssel (`wer`, auf dem Server die Lehrkraft): Wer am längsten nicht bedient wurde, ist dran.
 *    Anfragen der Lernenden einer Lehrkraft zählen als eigener Schlüssel („L:<lehrkraft>"), so bekommen die Kinder
 *    einer Klasse zusammen denselben Anteil wie eine Lehrkraft – innerhalb eines Schlüssels gilt die alte Reihenfolge.
 *  - Je Schlüssel höchstens `proSchluessel` Plätze zugleich.
 *  - Spur der Lernenden: höchstens `lernMax` Plätze zugleich (mindestens ein Platz bleibt für Lehrkräfte), höchstens
 *    `lernSchlange` Wartende, und höchstens `lernWartenMs` Wartezeit – danach „bitte gleich noch einmal"
 *    (KI_UEBERLAST). Aufträge der Lehrkräfte warten weiter ohne Frist (sie laufen im Hintergrund).
 * Am PC bleibt alles wie bisher: ein Schlüssel, keine Lernenden.
 */
export interface PlatzRegeln {
  /** Schlüssel der laufenden Anfrage (Server: Kennung der Lehrkraft); ohne = alle gleich */
  wer?: () => string | undefined
  /** Höchstens so viele Plätze je Schlüssel (Vorgabe: alle) */
  proSchluessel?: number
  /** Höchstens so viele Plätze für Lernende zugleich (Vorgabe: alle bis auf einen) */
  lernMax?: number
  /** Höchstens so viele wartende Anfragen von Lernenden (Vorgabe 40, Faustregel) */
  lernSchlange?: number
  /** Höchstens so lange wartet eine Anfrage von Lernenden (Vorgabe 60 s, Faustregel) */
  lernWartenMs?: number
}

export class KiPlaetze {
  private laufend = 0
  private laufendJe = new Map<string, number>()
  private laufendLernend = 0
  private schlange: Wartender[] = []
  private steuerung = new Map<string, AbortController>()
  private vorzeitig = new Map<string, number>()
  /** Art je belegtem Platz einer abgebrochenen, aber noch rechnenden Anfrage */
  private verwaist: string[] = []
  /** Wann (laufende Nummer) ein Auftrag zuletzt bedient wurde – für den Wechsel je Auftrag */
  private bedient = new Map<string, number>()
  /** Wann ein Schlüssel zuletzt bedient wurde – für den Wechsel je Lehrkraft (22.10.2026) */
  private bedientSchluessel = new Map<string, number>()
  private takt = 0
  private regeln: Required<Omit<PlatzRegeln, 'wer'>> & Pick<PlatzRegeln, 'wer'>

  constructor(
    readonly max: number,
    private melde?: (id: string, zustand: PlatzZustand, info?: PlatzInfo) => void,
    regeln: PlatzRegeln = {}
  ) {
    this.regeln = {
      wer: regeln.wer,
      proSchluessel: Math.max(1, regeln.proSchluessel ?? max),
      lernMax: Math.max(1, regeln.lernMax ?? Math.max(1, max - 1)),
      lernSchlange: Math.max(0, regeln.lernSchlange ?? 40),
      lernWartenMs: Math.max(0, regeln.lernWartenMs ?? 60_000)
    }
  }

  private info(): PlatzInfo {
    return { abgebrochen: this.verwaist.length, abgebrocheneBilder: this.verwaist.filter((a) => a === 'bild').length }
  }

  /** Reihenfolge innerhalb eines Schlüssels: erst die ohne Auftrag, dann im Wechsel je Auftrag (wie bis 22.10.2026) */
  private reiheJe(liste: Wartender[], zuletzt: Map<string, number>, takt: { t: number }): Wartender[] {
    const ergebnis = liste.filter((w) => !w.gruppe)
    const gruppen = new Map<string, Wartender[]>()
    for (const w of liste) if (w.gruppe) gruppen.set(w.gruppe, [...(gruppen.get(w.gruppe) ?? []), w])
    while (gruppen.size) {
      let wahl = ''
      let beste = Infinity
      for (const g of gruppen.keys()) {
        const z = zuletzt.get(g) ?? -1
        if (z < beste) {
          beste = z
          wahl = g
        }
      }
      const l = gruppen.get(wahl)!
      ergebnis.push(l.shift()!)
      zuletzt.set(wahl, ++takt.t)
      if (!l.length) gruppen.delete(wahl)
    }
    return ergebnis
  }

  /**
   * Die Wartenden in der Reihenfolge, in der sie drankommen: im Wechsel je Schlüssel (wer am längsten nicht bedient
   * wurde, zuerst), innerhalb eines Schlüssels erst die ohne Auftrag, dann im Wechsel je Auftrag.
   */
  private reihenfolge(): Wartender[] {
    const takt = { t: this.takt }
    const zuletztGruppe = new Map(this.bedient)
    const je = new Map<string, Wartender[]>()
    for (const w of this.schlange) je.set(w.schluessel, [...(je.get(w.schluessel) ?? []), w])
    if (je.size <= 1) return this.reiheJe(this.schlange, zuletztGruppe, takt)
    const reihen = new Map([...je].map(([s, l]) => [s, this.reiheJe(l, zuletztGruppe, takt)]))
    const zuletzt = new Map(this.bedientSchluessel)
    const ergebnis: Wartender[] = []
    let t = this.takt
    while (reihen.size) {
      let wahl = ''
      let beste = Infinity
      for (const s of reihen.keys()) {
        const z = zuletzt.get(s) ?? -1
        if (z < beste) {
          beste = z
          wahl = s
        }
      }
      const l = reihen.get(wahl)!
      ergebnis.push(l.shift()!)
      zuletzt.set(wahl, ++t)
      if (!l.length) reihen.delete(wahl)
    }
    return ergebnis
  }

  /** Kennungen der Wartenden in der Reihenfolge, in der sie drankommen (für Tests und Anzeige) */
  warteliste(): (string | undefined)[] {
    return this.reihenfolge().map((w) => w.id)
  }

  /** Darf eine Anfrage dieses Schlüssels bzw. dieser Spur jetzt laufen? */
  private frei(schluessel: string, lernend: boolean): boolean {
    if (this.laufend >= this.max) return false
    if ((this.laufendJe.get(schluessel) ?? 0) >= this.regeln.proSchluessel) return false
    return !lernend || this.laufendLernend < this.regeln.lernMax
  }

  /** Platz belegen und Schlüssel/Auftrag als bedient vermerken */
  private belege(schluessel: string, lernend: boolean, gruppe: string | undefined): void {
    this.laufend++
    this.laufendJe.set(schluessel, (this.laufendJe.get(schluessel) ?? 0) + 1)
    if (lernend) this.laufendLernend++
    this.vermerke(gruppe)
    this.bedientSchluessel.set(schluessel, ++this.takt)
    if (this.bedientSchluessel.size > 500)
      for (const s of [...this.bedientSchluessel.keys()]) if (!this.laufendJe.get(s) && !this.schlange.some((x) => x.schluessel === s)) this.bedientSchluessel.delete(s)
  }

  private gibFrei(schluessel: string, lernend: boolean): void {
    this.laufend--
    const n = (this.laufendJe.get(schluessel) ?? 1) - 1
    if (n > 0) this.laufendJe.set(schluessel, n)
    else this.laufendJe.delete(schluessel)
    if (lernend) this.laufendLernend--
  }

  /** Alle Wartenden starten, für die jetzt ein Platz frei ist (in der Reihenfolge oben) */
  private nachruecken(): boolean {
    let gestartet = false
    while (this.laufend < this.max) {
      const w = this.reihenfolge().find((x) => this.frei(x.schluessel, x.lernend))
      if (!w) break
      this.schlange.splice(this.schlange.indexOf(w), 1)
      this.belege(w.schluessel, w.lernend, w.gruppe)
      w.los()
      gestartet = true
    }
    return gestartet
  }

  /** Ein Auftrag kommt gerade dran (aus der Schlange oder sofort) – für den Wechsel je Auftrag */
  private vermerke(gruppe: string | undefined): void {
    if (!gruppe) return
    this.bedient.set(gruppe, ++this.takt)
    // Nicht endlos wachsen: Aufträge ohne Wartende vergessen, wenn es zu viele werden
    if (this.bedient.size > 500) for (const g of [...this.bedient.keys()]) if (!this.schlange.some((x) => x.gruppe === g)) this.bedient.delete(g)
  }

  /**
   * Allen Wartenden den neuen Stand sagen – ihren Platz in der Schlange und etwa, dass ein Platz jetzt
   * einer abgebrochenen Anfrage gehört.
   */
  private meldeWartende(): void {
    if (!this.melde) return
    const info = this.info()
    this.reihenfolge().forEach((w, i) => {
      if (w.id) this.melde?.(w.id, 'wartend', { ...info, platz: i + 1 })
    })
  }

  /** Laufende und wartende Anfragen (für Tests und Anzeige). */
  stand(): { laufend: number; wartend: number } {
    return { laufend: this.laufend, wartend: this.schlange.length }
  }

  /**
   * Führt `arbeit` aus, sobald ein Platz frei ist.
   *
   * Mit `id` lässt sich die Anfrage abbrechen (`abbrechen(id)`): wartend wird sie aus der
   * Schlange genommen, laufend bekommt `arbeit` das Signal. In beiden Fällen endet der Aufruf
   * mit `AbbruchFehler` – gleich, was der Anbieter dabei für einen Fehler wirft.
   *
   * `art` (z. B. „bild") erscheint in der Meldung an Wartende, falls eine abgebrochene Anfrage
   * dieser Art ihren Platz noch hält.
   *
   * `lernend` (22.10.2026): Anfrage von Lernenden – eigene Spur, begrenzte Schlange und Wartezeit; bei Überlast endet
   * sie mit `KiGrenzeFehler('ueberlast')` (Meldung KI_UEBERLAST).
   */
  async platz<T>(id: string | undefined, arbeit: (signal: AbortSignal) => Promise<T>, art = 'text', lernend = false): Promise<T> {
    const steuerung = new AbortController()
    const wer = this.regeln.wer?.() ?? ''
    const schluessel = lernend ? `L:${wer}` : wer
    if (id) {
      if (this.vorzeitig.has(id)) {
        this.vorzeitig.delete(id)
        throw new AbbruchFehler()
      }
      this.steuerung.set(id, steuerung)
    }
    try {
      if (!this.frei(schluessel, lernend)) {
        if (lernend && this.schlange.filter((w) => w.lernend).length >= this.regeln.lernSchlange) throw new KiGrenzeFehler('ueberlast')
        // Beim Freiwerden belegt der Freigebende den Platz gleich für diese Anfrage (`belege` in `nachruecken`)
        await new Promise<void>((los, weg) => {
          let frist: ReturnType<typeof setTimeout> | undefined
          const eintrag: Wartender = {
            id,
            gruppe: gruppeVon(id),
            schluessel,
            lernend,
            los: () => {
              if (frist) clearTimeout(frist)
              los()
            },
            weg
          }
          const raus = (e: Error): void => {
            const i = this.schlange.indexOf(eintrag)
            if (i < 0) return
            this.schlange.splice(i, 1)
            if (frist) clearTimeout(frist)
            weg(e)
            this.meldeWartende()
          }
          this.schlange.push(eintrag)
          if (lernend && this.regeln.lernWartenMs > 0) {
            frist = setTimeout(() => raus(new KiGrenzeFehler('ueberlast')), this.regeln.lernWartenMs)
            ;(frist as { unref?: () => void }).unref?.()
          }
          this.meldeWartende()
          steuerung.signal.addEventListener('abort', () => raus(new AbbruchFehler()))
        })
      } else {
        this.belege(schluessel, lernend, gruppeVon(id))
      }
      if (id) this.melde?.(id, 'laufend')
      let lauf: Promise<T>
      try {
        lauf = arbeit(steuerung.signal)
      } catch (e) {
        lauf = Promise.reject(e)
      }
      /*
       * Abgebrochen, aber der Anbieter rechnet weiter: Der Platz gehört jetzt einer Anfrage,
       * auf deren Ergebnis niemand mehr wartet. Wartende erfahren es (siehe `PlatzInfo`).
       */
      let verwaist = false
      const beiAbbruch = (): void => {
        verwaist = true
        this.verwaist.push(art)
        this.meldeWartende()
      }
      if (steuerung.signal.aborted) beiAbbruch()
      else steuerung.signal.addEventListener('abort', beiAbbruch, { once: true })
      // Der Platz wird erst frei, wenn die Arbeit wirklich endet – nicht schon beim Abbruch
      void lauf
        .catch(() => undefined)
        .then(() => {
          steuerung.signal.removeEventListener('abort', beiAbbruch)
          if (verwaist) this.verwaist.splice(this.verwaist.indexOf(art), 1)
          this.gibFrei(schluessel, lernend)
          const naechster = this.nachruecken()
          if (verwaist || naechster) this.meldeWartende()
        })
      return await mitAbbruch(lauf, steuerung.signal)
    } finally {
      if (id && this.steuerung.get(id) === steuerung) this.steuerung.delete(id)
    }
  }

  /**
   * Bricht eine Anfrage ab. Liefert `false`, wenn sie (noch) nicht bekannt ist – dann wird
   * der Wunsch eine Weile gemerkt: Kommt die Anfrage doch noch an, endet sie sofort.
   */
  abbrechen(id: string): boolean {
    const s = this.steuerung.get(id)
    if (s) {
      s.abort()
      return true
    }
    const jetzt = Date.now()
    for (const [alt, zeit] of this.vorzeitig) if (jetzt - zeit > VORZEITIG_MS) this.vorzeitig.delete(alt)
    this.vorzeitig.set(id, jetzt)
    return false
  }
}

/**
 * Wartet auf `arbeit`, endet aber beim Abbruch sofort mit `AbbruchFehler`.
 *
 * Nicht jeder Weg reagiert auf das Signal (die Bild-KI von OpenAI etwa nimmt keines). Die
 * Anfrage läuft dann im Hintergrund zu Ende, ihr Ergebnis wird verworfen – der Platz bleibt
 * so lange belegt, denn so lange arbeitet der Anbieter tatsächlich.
 */
function mitAbbruch<T>(arbeit: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new AbbruchFehler())
  return new Promise<T>((ok, fehler) => {
    const beiAbbruch = (): void => fehler(new AbbruchFehler())
    signal.addEventListener('abort', beiAbbruch, { once: true })
    arbeit.then(
      (wert) => {
        signal.removeEventListener('abort', beiAbbruch)
        if (signal.aborted) fehler(new AbbruchFehler())
        else ok(wert)
      },
      (e) => {
        signal.removeEventListener('abort', beiAbbruch)
        fehler(signal.aborted ? new AbbruchFehler() : e)
      }
    )
  })
}
