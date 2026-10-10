/**
 * Kursordner in IServ für „Ablegen ▾" (10.10.2026, Wunsch der Lehrkraft) – reine Funktionen, ohne Netz.
 *
 * Kurse quer zu den Klassen (Sek I: Religion, Werte und Normen, Französisch, Spanisch; Sek II: „EN 13 eA Kon") haben in
 * IServ einen eigenen Gruppenordner („FR 7 Kon", „RE 7b/c Abc") – Material dafür gehört dorthin, nicht nach
 * „Gruppen/Klasse 7b/Französisch". Auf dem Server kommen die IServ-Gruppen oft nicht an, und in der Exe sind die
 * Lerngruppen meist von Hand angelegt; deshalb wird beim Ablegen die Liste der Gruppenordner gelesen und jeder Name mit
 * shared/iservKurse.ts erkannt. Ein Ordner passt, wenn Fach und Jahrgang gleich sind, die Klasse der Lerngruppe (falls
 * genannt) zu den Klassen des Ordners gehört, Kürzel und Niveau (eA/gA) nicht widersprechen. Klassenfächer (Mathematik
 * in „Klasse 7b") finden keinen Kursordner und bleiben in der Klassenstruktur.
 */
import { fachAusName } from './faecher'
import { istGruppenWurzel, pfadTeile } from './iserv'
import { gruppeErkennen, MIN_SICHERHEIT, ordnerFuerKurs, type GruppeErkannt, type KursNiveau } from './iservKurse'

export interface KursAblageAnfrage {
  /** Name der Lerngruppe („7b", „Französisch 7 (Kon)", „FR 7 Kon", „13 eA") */
  lerngruppe: string
  /** Fach des Materials bzw. der Lerngruppe („Französisch") */
  fach: string
  /** Kürzel der Lehrkraft (Meine Klassen › IServ-Erkennung), unbekannt = null */
  kuerzel?: string | null
  /** Aus IServ erkannte Gruppe der Lerngruppe (Name der IServ-Gruppe) */
  iservGruppe?: string
}

/** Was die Lerngruppe für die Ablage ist: ein Kurs (Fach, Jahrgang, ggf. Klassen, Niveau, Kürzel) */
export interface GesuchterKurs {
  fachId: string
  fach: string
  jahrgang: number
  klassen: string[]
  niveau?: KursNiveau
  kuerzel?: string
  nummer?: number
}

const klein = (s: string | undefined | null): string => (s ?? '').trim().toLocaleLowerCase('de')
const schluessel = (s: string): string => klein(s).replace(/\s+/g, ' ')

/** Konfession bei Religion: „ev"/„kath", sonst '' (dann passt jede) */
function konfession(fach: string | undefined): string {
  const f = klein(fach)
  if (/^(ev|evang|evangelisch)/.test(f)) return 'ev'
  if (/^(kath|katholisch)/.test(f)) return 'kath'
  return ''
}

/**
 * Die Lerngruppe als Kurs lesen: zuerst ihr Name allein („Französisch 7 (Kon)", „FR 7 Kon"), sonst Fach + Name
 * („7b" + Französisch → Französisch 7b, „13 eA" + Englisch). null = weder Jahrgang noch Fach erkennbar.
 */
export function lerngruppeAlsKurs(lerngruppe: string, fach: string): GesuchterKurs | null {
  const fachDerGruppe = fachAusName(fach ?? '')
  const ausName = gruppeErkennen(lerngruppe ?? '')
  let p: GruppeErkannt | null = ausName?.art === 'kurs' && ausName.sicherheit >= MIN_SICHERHEIT ? ausName : null
  // Name nennt ein anderes Fach als die Lerngruppe → das Fach der Lerngruppe zählt, Jahrgang/Klassen aus dem Namen
  if (p && fachDerGruppe && p.fachId !== fachDerGruppe.id) p = null
  if (!p && fach?.trim()) {
    const zusammen = gruppeErkennen(`${fach.trim()} ${String(lerngruppe ?? '').trim()}`)
    if (zusammen?.art === 'kurs' && zusammen.sicherheit >= MIN_SICHERHEIT - 0.2) p = zusammen
  }
  if (!p || !p.fachId) return null
  return {
    fachId: fachDerGruppe?.id ?? p.fachId,
    fach: fach?.trim() || p.fach || '',
    jahrgang: p.jahrgang,
    klassen: p.klassen ?? [],
    ...(p.niveau ? { niveau: p.niveau } : {}),
    ...(p.kuerzel ? { kuerzel: p.kuerzel } : {}),
    ...(p.nummer !== undefined ? { nummer: p.nummer } : {})
  }
}

/** Passt der Ordner (erkannter Kurs) zur Lerngruppe? */
function passt(q: GruppeErkannt, k: GesuchterKurs, kuerzel: string): boolean {
  if (q.art !== 'kurs' || q.sicherheit < MIN_SICHERHEIT || q.fachId !== k.fachId || q.jahrgang !== k.jahrgang) return false
  const a = konfession(q.fach)
  const b = konfession(k.fach)
  if (a && b && a !== b) return false
  // Klassen: Ordner für bestimmte Klassen nur, wenn die Klasse der Lerngruppe dazugehört
  if (q.klassen?.length && k.klassen.length && !k.klassen.some((x) => q.klassen!.some((y) => klein(y) === klein(x)))) return false
  if (q.niveau && k.niveau && q.niveau !== k.niveau) return false
  if (q.nummer !== undefined && k.nummer !== undefined && q.nummer !== k.nummer) return false
  if (q.kuerzel && kuerzel && klein(q.kuerzel) !== kuerzel) return false
  return true
}

/**
 * Passende Kursordner unter „Gruppen" (Namen, wie IServ sie liefert). Mehrere = Auswahl; leer = keiner (Klassenfach,
 * unbekanntes Fach – dann gilt die Klassenstruktur).
 */
export function kursOrdnerKandidaten(ordner: string[], a: KursAblageAnfrage): string[] {
  const liste = [...new Set(ordner.map((o) => String(o ?? '').trim()).filter(Boolean))]
  // Aus IServ erkannter Kurs: sein Ordner (gleicher Name oder derselbe Kurs)
  if (a.iservGruppe?.trim()) {
    const o = ordnerFuerKurs(liste, { roh: a.iservGruppe })
    if (o) return [o]
  }
  // Lerngruppe heißt wie ein Kursordner („FR 7 Kon")
  const fachId = fachAusName(a.fach ?? '')?.id
  const gleich = liste.find((o) => {
    const q = schluessel(o) === schluessel(a.lerngruppe ?? '') ? gruppeErkennen(o) : null
    return q?.art === 'kurs' && (!fachId || q.fachId === fachId)
  })
  if (gleich) return [gleich]
  const k = lerngruppeAlsKurs(a.lerngruppe, a.fach)
  if (!k) return []
  const kuerzel = klein(k.kuerzel ?? a.kuerzel)
  const treffer = liste.map((o) => ({ o, q: gruppeErkennen(o) })).filter((x): x is { o: string; q: GruppeErkannt } => Boolean(x.q && passt(x.q, k, kuerzel)))
  let engste = treffer
  // Gleiches Kürzel bzw. Niveau geht vor Ordnern ohne Angabe
  if (kuerzel && engste.some((x) => klein(x.q.kuerzel) === kuerzel)) engste = engste.filter((x) => klein(x.q.kuerzel) === kuerzel)
  if (k.niveau && engste.some((x) => x.q.niveau === k.niveau)) engste = engste.filter((x) => x.q.niveau === k.niveau)
  return engste.map((x) => x.o).sort((x, y) => x.localeCompare(y, 'de', { numeric: true }))
}

/**
 * Pfad im Kursordner nach der Ablagestruktur der Verwaltung: Was im Muster nach dem Klassenordner steht, bleibt
 * (z. B. „{Schuljahr}"); ein Ordner nur fürs Fach fällt weg – der Kursordner gehört schon zu einem Fach.
 * null = das Muster legt nicht unter „Gruppen" ab (dann keine Kursordner).
 */
export function kursPfadNachMuster(muster: string, ordner: string, ersetzen: (teil: string) => string = (t) => t): string[] | null {
  const teile = pfadTeile(String(muster ?? '').replace(/\\/g, '/'))
  if (!teile.length || !istGruppenWurzel(teile[0])) return null
  const i = teile.findIndex((t) => /\{Klasse\}/i.test(t))
  if (i < 1) return null
  const rest = teile
    .slice(i + 1)
    .filter((t) => !/^\{Fach\}$/i.test(t.trim()))
    .map(ersetzen)
    .filter((t) => t.trim())
  return [teile[0], ordner, ...rest]
}

/** Schlüssel für die gemerkte Wahl je Lerngruppe und Fach */
export const kursWahlSchluessel = (lerngruppe: string, fach: string): string => `${schluessel(lerngruppe)}|${schluessel(fach)}`
