/**
 * Notenpunkte 0–15 für die Sekundarstufe II.
 *
 * Wunsch der Lehrkraft (26.09.2026): „Für die Noten bei Sek II Material: Hier sollen die
 * Noten 0–15 Punkte sein" – mit Recherche zu den Vorgaben der Länder.
 *
 * GRUNDLAGE: KMK, „Vereinbarung zur Gestaltung der gymnasialen Oberstufe und der
 * Abiturprüfung" (i. d. F. 2021/2023), Ziff. 8.4.2 mit Anlage 1 – das Bewertungsraster der
 * schriftlichen Abiturprüfung (15 Punkte ab 95 %, 14 ab 90 %, … 1 ab 20 %, 0 darunter).
 * Verbindlich ist es für die ABITURPRÜFUNG; für Klausuren heißt es dort: „Spätestens in der
 * Qualifikationsphase werden die Schülerinnen und Schüler an diesen Bewertungsmaßstab
 * herangeführt." Ziff. 8.4.3: schwerwiegende und gehäufte Verstöße gegen sprachliche
 * Richtigkeit oder äußere Form ⇒ Abzug von bis zu zwei Punkten.
 *
 * WAS DIE LÄNDER FÜR KLAUSUREN VORSCHREIBEN (Stand der Recherche 26.09.2026):
 *  - verbindlich KMK-Werte: Brandenburg (VV-Leistungsbewertung Nr. 6 Abs. 4), Hessen (OAVO
 *    § 9 Abs. 12, Anlage 9a – auch schon in der Einführungsphase), Nordrhein-Westfalen für die
 *    Klausuren der Qualifikationsphase (QUA-LiS-Konstruktionshinweise), Thüringen („in der
 *    Regel", Broschüre Gymnasiale Oberstufe 4.3), Schleswig-Holstein (Erlass Leistungsnachweise
 *    Oberstufe 2021: sinngemäß wie Abiturarbeiten);
 *  - eigene Tabelle: Sachsen-Anhalt (Leistungsbewertungserlass Nr. 3.4.2 – Schwellen je 1 %
 *    höher als die KMK, z. B. 15 Punkte ab 96 %);
 *  - Schul- bzw. Fachkonferenz: Berlin (VO-GO § 15: Gesamtkonferenz legt die Zuordnung fest),
 *    Bayern, Baden-Württemberg, Niedersachsen, Rheinland-Pfalz, Saarland, Sachsen, Hamburg,
 *    Bremen, Mecklenburg-Vorpommern – dort ist das KMK-Raster der übliche Maßstab, aber keine
 *    Vorschrift für die einzelne Klausur.
 *
 * AB WANN PUNKTE: In der Qualifikationsphase überall. In der Einführungsphase werden in den
 * meisten Ländern noch Noten 1–6 gegeben (NI, BY, BW, TH, ST, MV, SN, BB, SL, HH); Punkte
 * schon in der Einführungsphase: Hessen (Anlage 9a), Berlin (VO-GO), Rheinland-Pfalz (MSS 11:
 * Noten und zugleich Punkte).
 *
 * PUNKTGRENZE: die kleinste Punktzahl, die den Prozentsatz ERREICHT (aufgerundet). Hessen
 * schreibt den „ganzzahligen, nicht gerundeten Prozentsatz" vor; ein Aufrunden zugunsten der
 * Lernenden wie beim Sek-I-Schlüssel (`gradeScale.ts`, ab ,5) gibt es hier nicht.
 */
import { gehoertZurSekII, gymnasialerBildungsgang } from '../modules/arbeitsblatt/didactics/bildungsgang'
import { STATES } from '../modules/arbeitsblatt/didactics/states'

/** KMK-Bewertungsraster (Anlage 1): Prozent, ab dem 15, 14, … 1 Punkt(e) gelten; 0 darunter. */
export const KMK_PUNKTE_SCHWELLEN = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 33, 27, 20, 0]

/** Sachsen-Anhalt, Leistungsbewertungserlass Nr. 3.4.2 (15 = 100–96 %, … 1 = 27–21 %, 0 = 20–0 %). */
export const ST_PUNKTE_SCHWELLEN = [96, 91, 86, 81, 76, 71, 66, 61, 56, 51, 46, 41, 35, 28, 21, 0]

export interface PunkteRegel {
  /** 16 Prozentschwellen für 15 … 0 Punkte */
  schwellen: number[]
  /** In diesem Land für Klausuren vorgeschrieben (nicht nur üblich) */
  verbindlich: boolean
  /** Ein Satz für die Lehrkraft: Grundlage und Geltung im Land */
  hinweis: string
}

const landName = (stateId: string): string => STATES.find((s) => s.id === stateId)?.name ?? stateId

/** Die Regel für Klausuren der Oberstufe in einem Land. */
export function punkteRegelFuer(stateId: string): PunkteRegel {
  switch (stateId) {
    case 'BB':
      return { schwellen: KMK_PUNKTE_SCHWELLEN, verbindlich: true, hinweis: 'Brandenburg: KMK-Raster, verbindlich nach VV-Leistungsbewertung Nr. 6 Abs. 4.' }
    case 'HE':
      return {
        schwellen: KMK_PUNKTE_SCHWELLEN,
        verbindlich: true,
        hinweis: 'Hessen: Tabelle nach OAVO § 9 Abs. 12 und Anlage 9a, verbindlich in Einführungs- und Qualifikationsphase; maßgeblich ist der ganzzahlige, nicht gerundete Prozentsatz.'
      }
    case 'ST':
      return {
        schwellen: ST_PUNKTE_SCHWELLEN,
        verbindlich: true,
        hinweis: 'Sachsen-Anhalt: eigene Tabelle des Leistungsbewertungserlasses (Nr. 3.4.2), verbindlich in der Qualifikationsphase – die Schwellen liegen je 1 % über dem KMK-Raster.'
      }
    case 'NW':
      return {
        schwellen: KMK_PUNKTE_SCHWELLEN,
        verbindlich: true,
        hinweis: 'Nordrhein-Westfalen: KMK-Raster nach den QUA-LiS-Konstruktionshinweisen für Klausuren der Qualifikationsphase; die APO-GOSt selbst schreibt keine Tabelle vor.'
      }
    case 'TH':
      return { schwellen: KMK_PUNKTE_SCHWELLEN, verbindlich: true, hinweis: 'Thüringen: Klausuren werden in der Regel nach dem KMK-Raster bewertet (Broschüre „Gymnasiale Oberstufe", 4.3).' }
    case 'SH':
      return {
        schwellen: KMK_PUNKTE_SCHWELLEN,
        verbindlich: true,
        hinweis: 'Schleswig-Holstein: Bewertung in sinngemäßer Anwendung der Vorschriften für die Abiturarbeiten, also nach dem KMK-Raster (Erlass Leistungsnachweise Oberstufe 2021).'
      }
    case 'BE':
      return {
        schwellen: KMK_PUNKTE_SCHWELLEN,
        verbindlich: false,
        hinweis: 'Berlin: Die Gesamtkonferenz legt die Zuordnung von Prozentsatz zu Punkten fest (VO-GO § 15); voreingestellt ist das KMK-Raster der Abiturprüfung.'
      }
    default:
      return {
        schwellen: KMK_PUNKTE_SCHWELLEN,
        verbindlich: false,
        hinweis: `${landName(stateId)}: keine verbindliche Prozenttabelle für Klausuren – das KMK-Raster der Abiturprüfung ist der übliche Maßstab (KMK-Vereinbarung 8.4.2); die Fachkonferenz kann abweichen.`
      }
  }
}

/** Länder, in denen schon die Einführungsphase mit Punkten bewertet wird. */
const PUNKTE_AB_EINFUEHRUNGSPHASE = ['HE', 'BE', 'RP']

/**
 * Gilt für diese Lerngruppe das Punktesystem 0–15?
 *
 * Qualifikationsphase: immer. Einführungsphase (Klasse 11, im G8 Klasse 10): nur in den
 * Ländern, die dort schon Punkte geben. Sekundarstufe I: nie.
 */
export function notenpunkteGelten(grade: number, schoolTypeId: string, stateId: string): boolean {
  if (!gehoertZurSekII(grade, schoolTypeId, stateId)) return false
  const einfuehrungsphase = gymnasialerBildungsgang(grade, schoolTypeId, stateId) === 'G8' ? 10 : 11
  if (grade > einfuehrungsphase) return true
  return PUNKTE_AB_EINFUEHRUNGSPHASE.includes(stateId)
}

/** Die Regel für ein Blatt – oder null, wenn dort Noten 1–6 gelten. */
export function notenpunkteFuer(meta: { grade: number; schoolTypeId: string; stateId: string }): PunkteRegel | null {
  return notenpunkteGelten(meta.grade, meta.schoolTypeId, meta.stateId) ? punkteRegelFuer(meta.stateId) : null
}

/** Note mit Tendenz zu einem Punktwert: 15 = 1+, 14 = 1, 13 = 1−, … 1 = 5−, 0 = 6. */
export function punkteNote(punkte: number): string {
  const p = Math.max(0, Math.min(15, Math.round(punkte)))
  if (p === 0) return '6'
  const note = 6 - Math.ceil(p / 3)
  const tendenz = p % 3 === 0 ? '+' : p % 3 === 2 ? '' : '−'
  return `${note}${tendenz}`
}

export interface PunkteGrenze {
  punkte: number
  note: string
  percent: number
  /** Kleinste Punktzahl der Arbeit, die den Prozentsatz erreicht */
  fromPoints: number
}

/** Bringt Schwellen in Form: 16 Werte, absteigend, letzte 0. */
export function normalisierePunkteSchwellen(schwellen?: number[]): number[] {
  if (!schwellen || schwellen.length !== 16 || schwellen.some((s) => !Number.isFinite(s))) return [...KMK_PUNKTE_SCHWELLEN]
  const s = schwellen.map((x) => Math.min(100, Math.max(0, Math.round(x))))
  for (let i = 1; i < s.length; i++) if (s[i] > s[i - 1]) s[i] = s[i - 1]
  s[15] = 0
  return s
}

/** Der Punkteschlüssel für eine Arbeit über `points` Punkte (Bewertungseinheiten). */
export function punkteGrenzen(points: number, schwellen?: number[]): PunkteGrenze[] {
  const max = Math.max(0, points)
  return normalisierePunkteSchwellen(schwellen).map((percent, i) => {
    const punkte = 15 - i
    // Aufgerundet: Die Grenze ist die kleinste Punktzahl, die den Prozentsatz erreicht (Fließkommarest geglättet)
    const roh = (percent / 100) * max
    return { punkte, note: punkteNote(punkte), percent, fromPoints: Math.ceil(Math.round(roh * 1e9) / 1e9) }
  })
}

/** Notenpunkte zu einer erreichten Punktzahl. */
export function punkteFuerErreicht(achieved: number, points: number, schwellen?: number[]): PunkteGrenze {
  const grenzen = punkteGrenzen(points, schwellen)
  return grenzen.find((g) => achieved >= g.fromPoints) ?? grenzen[grenzen.length - 1]
}

/** Einzeilige Fassung für den Kopf einer Arbeit: „15 P ab 57 · 14 ab 54 · … · 1 ab 12". */
export function punkteZeile(points: number, schwellen?: number[]): string {
  return punkteGrenzen(points, schwellen)
    .filter((g) => g.punkte > 0)
    .map((g, i) => `${g.punkte}${i === 0 ? ' P' : ''} ab ${g.fromPoints}`)
    .join(' · ')
}

/** Zeilen für das Lösungsblatt: Punkte, Note, Spanne, Prozent. */
export function punkteZeilen(points: number, schwellen?: number[]): { punkte: string; note: string; range: string; percent: string }[] {
  const grenzen = punkteGrenzen(points, schwellen)
  return grenzen.map((g, i) => {
    const upper = i === 0 ? Math.max(0, points) : grenzen[i - 1].fromPoints - 1
    return {
      punkte: String(g.punkte),
      note: g.note,
      range: upper > g.fromPoints ? `${g.fromPoints} – ${upper}` : upper === g.fromPoints ? `${g.fromPoints}` : '–',
      percent: g.punkte === 0 ? `unter ${grenzen[i - 1]?.percent ?? 20} %` : `ab ${g.percent} %`
    }
  })
}
