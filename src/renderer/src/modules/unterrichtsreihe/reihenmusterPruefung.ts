/**
 * Gegencheck nach der KI-Planung (08.10.2026, Entscheidung der Lehrkraft „harte Regeln + Gegencheck mit Selbstreparatur"):
 * Eine reine, prüfbare Funktion sucht im Rohplan Verstöße gegen die Regeln aller Reihen und gegen die harten Regeln des
 * Fachmusters (shared/reihenmuster.ts). `planeReihe` (reihePlanungKi.ts) schickt bei Verstößen EINE Nachfrage an die KI
 * im selben Auftrag; was danach noch verstößt, behebt `behebeReihenmuster` fest, wo das geht. Was behoben wurde, steht im
 * Hinweis der Planung.
 *
 * Geprüft wird:
 *  - Einstieg: Der erste Schritt ist weder Lernkarten noch Wissensspeicher noch eine Begriffsdefinition;
 *  - Lernkarten erst nach einer Erarbeitung;
 *  - Leitfrage vorhanden, und der letzte Schritt nimmt sie ausdrücklich auf;
 *  - Politik, Ethik, Geschichte, Erdkunde: Wo geurteilt wird, steht der Hinweis auf den Beutelsbacher Konsens;
 *  - Naturwissenschaften, Technik: Versuche tragen „Lehrkraft prüft nach RiSU";
 *  - Sport: Arbeitsblätter nur für Theorie und Beobachtung;
 *  - Religion: kein Bekenntnis verlangen.
 */
import type { ReiheArt } from '@shared/reihe'
import { reihenmusterFuer, type Reihenmuster } from '@shared/reihenmuster'
import type { PlanRoh } from './reihePlanungKi'

export type VerstossCode =
  | 'einstieg'
  | 'lernkarten-frueh'
  | 'leitfrage-fehlt'
  | 'leitfrage-rueckbezug'
  | 'beutelsbacher'
  | 'risu'
  | 'sport-blatt'
  | 'bekenntnis'

export interface Verstoss {
  code: VerstossCode
  /** Für KI und Lehrkraft lesbar */
  text: string
  /** Titel des betroffenen Schritts */
  schritt?: string
  /** Lage im Lernpfad (Teile nacheinander, ab 0) */
  pos?: number
}

export interface MusterKontext {
  fachId: string
  art?: ReiheArt
  /** Von der Lehrkraft festgelegte Leitfrage (gilt vor der der KI) */
  leitfrage?: string
}

type RohSchritt = PlanRoh['teile'][number]['schritte'][number]

/** Schritte für die Erarbeitung (Lernkarten danach erlaubt) */
const ERARBEITUNG = new Set(['arbeitsblatt', 'aufgabe', 'praesenz', 'sprechen'])
const BEGRIFF_ZUERST = /(Begriffskl[äa]rung|Begriffe?\s+(kl[äa]ren|lernen|definieren|einf[üu]hren)|Fachbegriffe\s+(lernen|kl[äa]ren|einf[üu]hren)|Definitionen?\b|Glossar)/i
const URTEIL = /(beurteil|bewert|Stellung\s*nehm|Stellungnahme|Werturteil|\bUrteil|er[öo]rter|Positionslinie|Meinung)/i
const URTEIL_AUSNAHME = /Bewertungs(raster|kriterien|bogen|b[öo]gen)/gi
const BEUTELSBACH = /(Beutelsbach|kontrovers)/i
const VERSUCH = /(Experiment|Versuch|experimentier|Sch[üu]ler[üu]bung|Demonstration)/i
const RISU = /RiSU/i
const THEORIE = /(Theorie|beobacht|Regel|Trainingsl|Trainingsplan|Reflexion|reflektier|auswert|analys|Anatomie|Muskel|Ern[äa]hrung|Bewegungsphase|Taktik)/i
const BEKENNTNIS = /(glaubst du|woran glaubst|dein(en)?\s+(eigenen\s+)?Glauben|bekenne|Bekenntnis ablegen|betest du)/i
const OHNE_BEKENNTNIS = /ohne Bekenntnis/i

export const BEUTELSBACH_HINWEIS =
  'Beutelsbacher Konsens: Positionen kontrovers darstellen, keine Meinung vorgeben – das Urteil bilden die Lernenden selbst.'
export const RISU_HINWEIS = 'Lehrkraft prüft den Versuch nach RiSU (Gefährdungsbeurteilung).'
export const BEKENNTNIS_HINWEIS =
  'Ohne Bekenntnis: gefragt wird nach Deutungen („Christen glauben, dass …"), persönliche Äußerungen sind freiwillig und unbewertet.'

const text = (x: RohSchritt): string => `${x.titel ?? ''} ${x.beschreibung ?? ''}`
const platzhalter = (x: RohSchritt): boolean => !String(x.material ?? '').trim()

/** Schritte in der Reihenfolge des Lernpfads (Teile nacheinander) */
function flach(d: PlanRoh): { t: number; i: number; x: RohSchritt }[] {
  return (d?.teile ?? []).flatMap((teil, t) => (teil.schritte ?? []).map((x, i) => ({ t, i, x })))
}

const woerter = (s: string): string[] =>
  s
    .toLocaleLowerCase('de')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 5)

/** Nimmt der Schritt die Leitfrage auf? „Leitfrage" genannt, die Frage selbst oder die Hälfte ihrer Inhaltswörter */
export function nimmtLeitfrageAuf(x: Pick<RohSchritt, 'titel' | 'beschreibung'> & Partial<Pick<RohSchritt, 'begruendung'>>, leitfrage: string): boolean {
  const t = `${x.titel ?? ''} ${x.beschreibung ?? ''} ${x.begruendung ?? ''}`
  if (/Leitfrage/i.test(t)) return true
  const lf = leitfrage.trim()
  if (!lf) return false
  const klein = t.toLocaleLowerCase('de')
  if (klein.includes(lf.toLocaleLowerCase('de').replace(/[?.!]+$/, ''))) return true
  const w = [...new Set(woerter(lf))]
  if (!w.length) return false
  const drin = w.filter((x) => klein.includes(x)).length
  return drin / w.length >= 0.5
}

/** Index der ersten Erarbeitung (der erste Schritt zählt nur als Arbeitsblatt – sonst ist er der Einstieg) */
function ersteErarbeitung(liste: { x: RohSchritt }[], ohne?: number): number {
  return liste.findIndex((e, k) => k !== ohne && ERARBEITUNG.has(e.x.art) && (k > 0 || e.x.art === 'arbeitsblatt'))
}

const einstiegFalsch = (x: RohSchritt): boolean => x.art === 'lernkarten' || x.art === 'hefter' || BEGRIFF_ZUERST.test(text(x))

/** Verstöße des Rohplans gegen die Regeln aller Reihen und die harten Regeln des Fachmusters */
export function pruefeReihenmuster(d: PlanRoh, k: MusterKontext): Verstoss[] {
  const m = reihenmusterFuer(k.fachId)
  const liste = flach(d)
  const aus: Verstoss[] = []
  if (!liste.length) return aus
  // Einstieg
  const erster = liste[0].x
  if (einstiegFalsch(erster))
    aus.push({
      code: 'einstieg',
      schritt: erster.titel,
      pos: 0,
      text: `Der erste Schritt „${erster.titel}" ist ${erster.art === 'lernkarten' ? 'ein Lernkarten-Schritt' : erster.art === 'hefter' ? 'ein Wissensspeicher' : 'eine Begriffsklärung/Definition'} – der Einstieg muss ein problemorientierter Impuls sein, Begriffe werden erst nach der Erarbeitung gesichert.`
    })
  // Lernkarten erst nach einer Erarbeitung
  const erarb = ersteErarbeitung(liste)
  liste.forEach((e, k2) => {
    if (k2 === 0 || e.x.art !== 'lernkarten') return
    if (erarb === -1 || erarb > k2)
      aus.push({ code: 'lernkarten-frueh', schritt: e.x.titel, pos: k2, text: `Lernkarten „${e.x.titel}" stehen vor jeder Erarbeitung – sie sichern erst Erarbeitetes.` })
  })
  // Leitfrage
  const lf = String(d.leitfrage ?? '').trim() || String(k.leitfrage ?? '').trim()
  if (!lf) aus.push({ code: 'leitfrage-fehlt', text: 'Die Reihe hat keine Leitfrage ("leitfrage" ist leer).' })
  const letzter = liste[liste.length - 1].x
  if (!nimmtLeitfrageAuf(letzter, lf))
    aus.push({
      code: 'leitfrage-rueckbezug',
      schritt: letzter.titel,
      pos: liste.length - 1,
      text: `Der letzte Schritt „${letzter.titel}" nimmt die Leitfrage nicht ausdrücklich auf – er muss sie beantworten lassen (in "beschreibung" „Leitfrage" nennen).`
    })
  if (m) aus.push(...pruefeFach(m, liste))
  return aus
}

function pruefeFach(m: Reihenmuster, liste: { x: RohSchritt }[]): Verstoss[] {
  const aus: Verstoss[] = []
  const p = new Set(m.pruefungen ?? [])
  liste.forEach(({ x }, pos) => {
    if (!platzhalter(x)) return
    const t = text(x)
    if (p.has('beutelsbacher') && URTEIL.test(t.replace(URTEIL_AUSNAHME, '')) && !BEUTELSBACH.test(`${x.beschreibung} ${x.begruendung ?? ''}`))
      aus.push({ code: 'beutelsbacher', schritt: x.titel, pos, text: `„${x.titel}" verlangt ein Urteil ohne Hinweis auf den Beutelsbacher Konsens (kontrovers darstellen, keine Meinung vorgeben).` })
    if (p.has('risu') && VERSUCH.test(t) && !RISU.test(x.beschreibung ?? ''))
      aus.push({ code: 'risu', schritt: x.titel, pos, text: `„${x.titel}" plant einen Versuch ohne den Hinweis „Lehrkraft prüft nach RiSU".` })
    if (p.has('sportBlatt') && x.art === 'arbeitsblatt' && !THEORIE.test(t))
      aus.push({ code: 'sport-blatt', schritt: x.titel, pos, text: `„${x.titel}" ist ein Arbeitsblatt für Bewegungspraxis – Arbeitsblätter im Sport nur für Theorie und Beobachtung.` })
    if (p.has('bekenntnis') && BEKENNTNIS.test(t) && !OHNE_BEKENNTNIS.test(t))
      aus.push({ code: 'bekenntnis', schritt: x.titel, pos, text: `„${x.titel}" fragt nach dem eigenen Glauben – im Religionsunterricht kein Bekenntnis verlangen.` })
  })
  return aus
}

const anhaengen = (x: RohSchritt, satz: string): void => {
  const b = String(x.beschreibung ?? '').trim()
  x.beschreibung = b ? `${b}${/[.!?]$/.test(b) ? '' : '.'} ${satz}` : satz
}

/** Schritt an Position `von` hinter die erste Erarbeitung verschieben (Teil und Stunde wie dort) – false, wenn es keine gibt */
function hinterErarbeitung(d: PlanRoh, von: { t: number; i: number }): boolean {
  const liste = flach(d)
  const k = liste.findIndex((e) => e.t === von.t && e.i === von.i)
  const ziel = ersteErarbeitung(liste, k)
  if (ziel === -1 || ziel < k) return false
  const [x] = d.teile[von.t].schritte.splice(von.i, 1)
  // Lage des Ziels nach dem Entfernen neu bestimmen
  const z = liste[ziel]
  const zi = z.t === von.t && z.i > von.i ? z.i - 1 : z.i
  x.stunde = z.x.stunde
  d.teile[z.t].schritte.splice(zi + 1, 0, x)
  return true
}

/**
 * Feste Reparatur der Verstöße, die ohne KI gehen (Eingabe bleibt unverändert). `behoben`: was die App geändert hat;
 * `offen`: was nur die Lehrkraft beheben kann.
 */
export function behebeReihenmuster(roh: PlanRoh, k: MusterKontext): { plan: PlanRoh; behoben: string[]; offen: string[] } {
  const d = JSON.parse(JSON.stringify(roh)) as PlanRoh
  const behoben: string[] = []
  const offen = new Set<string>()
  if (!String(d.leitfrage ?? '').trim() && k.leitfrage?.trim()) {
    d.leitfrage = k.leitfrage.trim()
    behoben.push('Leitfrage der Lehrkraft eingesetzt')
  }
  // Einstieg und Lernkarten: verschieben, bis nichts mehr verstößt (höchstens so oft, wie es Schritte gibt)
  for (let n = flach(d).length; n > 0; n--) {
    const v = pruefeReihenmuster(d, k).find((x) => x.code === 'einstieg' || x.code === 'lernkarten-frueh')
    if (!v) break
    const liste = flach(d)
    const pos = liste[v.pos ?? 0]
    if (!pos || !hinterErarbeitung(d, pos)) {
      offen.add(v.text)
      break
    }
    behoben.push(`„${pos.x.titel}" hinter die erste Erarbeitung verschoben`)
  }
  for (const v of pruefeReihenmuster(d, k)) {
    if (v.code === 'einstieg' || v.code === 'lernkarten-frueh') continue
    const lf = String(d.leitfrage ?? '').trim()
    const liste = flach(d)
    const x = v.pos !== undefined ? liste[v.pos]?.x : undefined
    switch (v.code) {
      case 'leitfrage-fehlt':
        offen.add('Die Reihe hat keine Leitfrage – bitte im Kopf der Reihe eintragen.')
        break
      case 'leitfrage-rueckbezug': {
        if (!lf) break
        const letzter = liste[liste.length - 1]
        if (platzhalter(letzter.x)) {
          anhaengen(letzter.x, `Rückbezug auf die Leitfrage „${lf}": abschließend begründet beantworten.`)
          behoben.push(`Rückbezug auf die Leitfrage im letzten Schritt „${letzter.x.titel}" ergänzt`)
        } else {
          d.teile[letzter.t].schritte.push({
            titel: 'Zurück zur Leitfrage',
            art: 'aufgabe',
            rolle: 'pflicht',
            stunde: letzter.x.stunde,
            minuten: 10,
            beschreibung: `Rückbezug auf die Leitfrage „${lf}": Die Lernenden beantworten sie mit dem Wissen aus der Reihe begründet (Anforderungsbereich III).`,
            lernziele: [],
            material: '',
            begruendung: 'Die Reihe endet mit der Antwort auf ihre Leitfrage.'
          })
          behoben.push('Schritt „Zurück zur Leitfrage" am Ende ergänzt')
        }
        break
      }
      case 'beutelsbacher':
        if (x) {
          anhaengen(x, BEUTELSBACH_HINWEIS)
          behoben.push(`Hinweis auf den Beutelsbacher Konsens bei „${x.titel}" ergänzt`)
        }
        break
      case 'risu':
        if (x) {
          anhaengen(x, RISU_HINWEIS)
          behoben.push(`RiSU-Hinweis bei „${x.titel}" ergänzt`)
        }
        break
      case 'bekenntnis':
        if (x) {
          anhaengen(x, BEKENNTNIS_HINWEIS)
          behoben.push(`Hinweis „ohne Bekenntnis" bei „${x.titel}" ergänzt`)
        }
        break
      case 'sport-blatt':
        if (x) {
          if (k.art === 'digital') {
            x.art = 'aufgabe'
            x.beschreibung = `Theorie-/Beobachtungsauftrag: ${x.beschreibung ?? ''}`.trim()
          } else {
            x.art = 'praesenz'
            anhaengen(x, 'Bewegungspraxis im Unterricht (Aufbau, Sicherheit, Differenzierung) – Arbeitsblätter nur für Theorie und Beobachtung.')
          }
          behoben.push(`„${x.titel}" als ${k.art === 'digital' ? 'Theorie-Auftrag' : '„Im Unterricht"'} statt Arbeitsblatt`)
        }
        break
    }
  }
  return { plan: d, behoben, offen: [...offen] }
}

/** Nachfrage an die KI: derselbe Plan, die Verstöße behoben */
export function musterNachfrage(d: PlanRoh, verstoesse: Verstoss[], fachId: string): string {
  const m = reihenmusterFuer(fachId)
  return [
    'Dein Plan für die Unterrichtsreihe verletzt Regeln des fachtypischen Reihenmusters.',
    `BEFUND:\n${verstoesse.map((v) => `- ${v.text}`).join('\n')}`,
    m ? `HARTE REGELN (${m.name}):\n${m.nieRegeln.map((r) => `- ${r}`).join('\n')}` : '',
    'AUFTRAG: Gib den VOLLSTÄNDIGEN Plan im selben Format zurück und behebe genau diese Punkte. Teile, Stunden, Minuten, eingesetzte Materialien und alles andere bleiben, soweit möglich, gleich. Die Leitfrage steht in "leitfrage"; der letzte Schritt lässt sie ausdrücklich beantworten.',
    `BISHERIGER PLAN:\n${JSON.stringify(d)}`
  ]
    .filter(Boolean)
    .join('\n')
}

/** Satz für den Hinweis der Planung: was der Gegencheck gefunden und behoben hat */
export function gegencheckText(g: { nachgefragt: boolean; behoben: string[]; offen: string[] }): string {
  const teile: string[] = []
  if (g.nachgefragt) teile.push('die KI hat Verstöße gegen das Reihenmuster auf Nachfrage korrigiert')
  if (g.behoben.length) teile.push(`von der App behoben: ${g.behoben.join('; ')}`)
  if (g.offen.length) teile.push(`bitte prüfen: ${g.offen.join(' ')}`)
  return teile.length ? `Gegencheck Reihenmuster: ${teile.join(' – ')}.` : ''
}
