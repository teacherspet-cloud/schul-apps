/**
 * Klassen und Kurse aus IServ-Gruppennamen erkennen (10.10.2026, Wunsch der Lehrkraft) – reine Funktionen, ohne Netz.
 *
 * An der Schule (Niedersachsen, Gymnasium G9) laufen in der Sek I Werte und Normen, Religion (ev./kath.), Französisch und
 * Spanisch in KURSEN quer zu den Klassen; in der Sek II heißen die Kursgruppen etwa „EN 13 eA Kon" = Fach (EN) + Jahrgang
 * (13) + Anforderungsniveau (eA erhöht, gA grundlegend) + Kürzel der Lehrkraft (Kon). Aus den IServ-Gruppen jeder Person
 * (kommen bei der Anmeldung mit, server/anmeldung.ts) liest dieses Modul:
 *  - die Klasse („7b", „Klasse 7b", „klasse.7b");
 *  - die Kurse: Fach (aus shared/faecher.ts, dazu übliche Stundenplan-Kürzel), Jahrgang 5–13 (auch „Q1"/„Q2"),
 *    Klassenliste („7b/c", „7b+7c"), Niveau (eA/gA, „LK"/„GK"), Kursnummer und Kürzel der Lehrkraft (2–4 Buchstaben am Ende).
 * Vorsilben („kurs-", „fach-", „k-"), Schuljahre („2026/27"), Groß-/Kleinschreibung und Trennzeichen sind egal. Namen mit
 * unbekannten Wörtern („Fachschaft Englisch", „Sport AG 7", „Elternvertreter 7b") bleiben außen vor – lieber nichts als
 * eine falsche Gruppe.
 *
 * Dazu die Regeln, die Server und Oberfläche teilen: Kürzel der Lehrkraft, „unterrichtet sie diesen Kurs?",
 * Anzeigename der Lerngruppe, gleiche Kurse, Ordner im IServ-WebDAV und die Nachfolge im neuen Schuljahr.
 */
import { FAECHER, fachAusName, fachVon } from './faecher'

export type KursNiveau = 'eA' | 'gA'

export interface GruppeErkannt {
  art: 'klasse' | 'kurs'
  /** Fach-Kennung aus shared/faecher.ts (nur Kurse) */
  fachId?: string
  /** Fachname, wie er an der Lerngruppe steht (Katalogname oder Landesname, z. B. „Evangelische Religion") */
  fach?: string
  jahrgang: number
  /** Beteiligte Klassen („7b", „7c") */
  klassen?: string[]
  niveau?: KursNiveau
  /** Kürzel der Lehrkraft, wie in IServ geschrieben („Kon") */
  kuerzel?: string
  /** Kursnummer bei Parallelkursen („FR 7 2 Kon") */
  nummer?: number
  /** Name der IServ-Gruppe, wie geliefert */
  roh: string
  /** 0–1: wie sicher die Erkennung ist (ab `MIN_SICHERHEIT` wird sie verwendet) */
  sicherheit: number
}

/** Unter dieser Sicherheit wird eine erkannte Gruppe nicht verwendet */
export const MIN_SICHERHEIT = 0.6
/** Anteil gemeinsamer Lernender, ab dem eine vorhandene Lerngruppe als „dieselbe" gilt */
export const GLEICHE_MITGLIEDER = 0.8

// ---------------------------------------------------------------- Fächer und Kürzel

interface Alias {
  fachId: string
  /** Gespeicherter Fachname (muss über fachAusName wieder zum Fach führen) */
  fach?: string
  /** Abzug von der Sicherheit (mehrdeutige oder sehr kurze Kürzel) */
  abzug?: number
}

/** Übliche Stundenplan- und IServ-Schreibweisen über den Katalog hinaus */
const ZUSATZ: Record<string, Alias> = {
  de: { fachId: 'deutsch' },
  deu: { fachId: 'deutsch' },
  en: { fachId: 'englisch' },
  eng: { fachId: 'englisch' },
  engl: { fachId: 'englisch' },
  fr: { fachId: 'franzoesisch' },
  frz: { fachId: 'franzoesisch' },
  fra: { fachId: 'franzoesisch' },
  franz: { fachId: 'franzoesisch' },
  franzoesisch: { fachId: 'franzoesisch' },
  sn: { fachId: 'spanisch' },
  spa: { fachId: 'spanisch' },
  span: { fachId: 'spanisch' },
  es: { fachId: 'spanisch', abzug: 0.1 },
  la: { fachId: 'latein' },
  lat: { fachId: 'latein' },
  ma: { fachId: 'mathematik' },
  mat: { fachId: 'mathematik' },
  mathe: { fachId: 'mathematik' },
  bi: { fachId: 'biologie' },
  che: { fachId: 'chemie' },
  phy: { fachId: 'physik' },
  inf: { fachId: 'informatik' },
  info: { fachId: 'informatik' },
  ge: { fachId: 'geschichte' },
  ges: { fachId: 'geschichte' },
  gesch: { fachId: 'geschichte' },
  geo: { fachId: 'erdkunde', fach: 'Erdkunde' },
  erd: { fachId: 'erdkunde', fach: 'Erdkunde' },
  erdk: { fachId: 'erdkunde', fach: 'Erdkunde' },
  pw: { fachId: 'politik', fach: 'Politik-Wirtschaft' },
  powi: { fachId: 'politik', fach: 'Politik-Wirtschaft' },
  po: { fachId: 'politik', fach: 'Politik' },
  re: { fachId: 'religion', fach: 'Religion' },
  rel: { fachId: 'religion', fach: 'Religion' },
  reli: { fachId: 'religion', fach: 'Religion' },
  religion: { fachId: 'religion', fach: 'Religion' },
  rev: { fachId: 'religion', fach: 'Evangelische Religion' },
  er: { fachId: 'religion', fach: 'Evangelische Religion' },
  evr: { fachId: 'religion', fach: 'Evangelische Religion' },
  ev: { fachId: 'religion', fach: 'Evangelische Religion' },
  evrel: { fachId: 'religion', fach: 'Evangelische Religion' },
  rk: { fachId: 'religion', fach: 'Katholische Religion' },
  kr: { fachId: 'religion', fach: 'Katholische Religion' },
  krr: { fachId: 'religion', fach: 'Katholische Religion' },
  kath: { fachId: 'religion', fach: 'Katholische Religion' },
  kathrel: { fachId: 'religion', fach: 'Katholische Religion' },
  wn: { fachId: 'werte-und-normen' },
  wun: { fachId: 'werte-und-normen' },
  phil: { fachId: 'philosophie' },
  philo: { fachId: 'philosophie' },
  ku: { fachId: 'kunst' },
  mu: { fachId: 'musik' },
  spo: { fachId: 'sport' },
  ds: { fachId: 'darstellendes-spiel', fach: 'Darstellendes Spiel' },
  ru: { fachId: 'russisch' },
  it: { fachId: 'italienisch' },
  ita: { fachId: 'italienisch' },
  nl: { fachId: 'niederlaendisch' },
  ndl: { fachId: 'niederlaendisch' },
  gr: { fachId: 'griechisch' },
  chi: { fachId: 'chinesisch' }
}

/** Mehrwortige Namen („Werte und Normen", „ev. Religion") – vor dem Zerlegen in Wörter ersetzt */
const MEHRWORT: Record<string, Alias> = {
  'werte und normen': { fachId: 'werte-und-normen' },
  'werte & normen': { fachId: 'werte-und-normen' },
  'werte+normen': { fachId: 'werte-und-normen' },
  'w&n': { fachId: 'werte-und-normen' },
  'w+n': { fachId: 'werte-und-normen' },
  'ev. religion': { fachId: 'religion', fach: 'Evangelische Religion' },
  'ev religion': { fachId: 'religion', fach: 'Evangelische Religion' },
  'evang. religion': { fachId: 'religion', fach: 'Evangelische Religion' },
  'evangelische religion': { fachId: 'religion', fach: 'Evangelische Religion' },
  'kath. religion': { fachId: 'religion', fach: 'Katholische Religion' },
  'kath religion': { fachId: 'religion', fach: 'Katholische Religion' },
  'katholische religion': { fachId: 'religion', fach: 'Katholische Religion' },
  'darstellendes spiel': { fachId: 'darstellendes-spiel', fach: 'Darstellendes Spiel' },
  'politik wirtschaft': { fachId: 'politik', fach: 'Politik-Wirtschaft' }
}

const klein = (s: string): string => s.normalize('NFC').toLocaleLowerCase('de')
/** „ä" → „ae" usw. (IServ-Kennungen schreiben Umlaute aus) */
const ohneUmlaute = (s: string): string => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')

/** Alle einwortigen Namen: Katalog (Kennung, Name, Landesnamen, Kürzel) + übliche Kürzel */
const EINWORT: Map<string, Alias> = (() => {
  const m = new Map<string, Alias>()
  const setze = (k: string, a: Alias): void => {
    const s = klein(k).trim()
    if (!s || /\s/.test(s) || m.has(s)) return
    m.set(s, a)
    const u = ohneUmlaute(s)
    if (!m.has(u)) m.set(u, a)
  }
  for (const [k, a] of Object.entries(ZUSATZ)) setze(k, a)
  for (const f of FAECHER) {
    if (f.id === 'anderes') continue
    setze(f.id, { fachId: f.id })
    setze(f.label, { fachId: f.id })
    for (const teil of f.label.split(' / ')) setze(teil, { fachId: f.id, fach: fachAusName(teil)?.id === f.id ? teil : undefined })
    for (const a of f.auch ?? []) setze(a, { fachId: f.id, fach: a })
    // Kürzel aus einem Buchstaben sind mehrdeutiger
    if (f.kuerzel && f.kuerzel !== '–') setze(f.kuerzel, { fachId: f.id, abzug: f.kuerzel.length === 1 ? 0.15 : 0 })
  }
  return m
})()

const MEHRWORT_LISTE = Object.keys(MEHRWORT).sort((a, b) => b.length - a.length)

/** Wörter, die zum Aufbau gehören und sonst nichts bedeuten */
const FUELL = new Set(['kurs', 'kurse', 'lerngruppe', 'gruppe', 'grp', 'fach', 'unterricht'])
/** Wörter, die vor dem Jahrgang stehen dürfen */
const VOR_JAHRGANG = new Set(['klasse', 'kl', 'jahrgang', 'jg', 'jgst', 'stufe'])
/** Nie ein Kürzel der Lehrkraft */
const KEIN_KUERZEL = new Set(['ag', 'lk', 'gk', 'ea', 'ga', 'kl', 'jg', 'sj', 'neu', 'alt', 'alle', 'team', 'info', 'eltern', 'kurs', 'klasse'])

// ---------------------------------------------------------------- Erkennen

interface Wort {
  /** klein, ohne Umlaute zum Vergleichen */
  k: string
  /** wie geschrieben */
  o: string
  /** Platzhalter eines mehrwortigen Fachnamens */
  alias?: Alias
}

/** Den Namen in Wörter zerlegen (Trennzeichen außer „/", „+" und „&" in Klassenlisten) */
function woerter(name: string): Wort[] | null {
  let s = name.normalize('NFC').trim()
  // Schuljahr („2026/27", „SJ 26/27", „(2026-2027)") fällt weg
  s = s.replace(/\(?\s*(?:sj\s*)?(?:20\d\d\s*[/-]\s*(?:20)?\d\d|sj\s*\d\d\s*[/-]\s*\d\d)\s*\)?/gi, ' ')
  s = s.replace(/\(?\s*(?:sj\s*)?20\d\d\s*\)?/gi, ' ')
  // Mehrwortige Fachnamen durch Platzhalter ersetzen
  const platz: Alias[] = []
  let k = klein(s)
  for (const m of MEHRWORT_LISTE) {
    let i = k.indexOf(m)
    while (i >= 0) {
      const vor = i === 0 ? '' : k[i - 1]
      const nach = k[i + m.length] ?? ''
      if (!/[\p{L}\p{N}]/u.test(vor) && !/[\p{L}\p{N}]/u.test(nach)) {
        const marke = ` §${platz.length}§ `
        platz.push(MEHRWORT[m])
        s = s.slice(0, i) + marke + s.slice(i + m.length)
        k = k.slice(0, i) + marke + k.slice(i + m.length)
        i = k.indexOf(m, i + marke.length)
      } else i = k.indexOf(m, i + 1)
    }
  }
  const teile = s
    .split(/[\s._:;,()[\]{}|\\#*"'´`~=-]+/u)
    .map((t) => t.trim())
    .filter(Boolean)
  const aus: Wort[] = []
  for (const t of teile) {
    const p = /^§(\d+)§$/.exec(t)
    if (p) {
      aus.push({ k: `§${p[1]}`, o: t, alias: platz[Number(p[1])] })
      continue
    }
    const tk = ohneUmlaute(klein(t))
    // „fr7", „reli7b", „en13ea": Fachkürzel + Jahrgang ohne Trenner
    const zus = /^([a-z]{1,8})(\d{1,2}[a-z/+&]*)$/.exec(tk)
    if (zus && EINWORT.has(zus[1]) && !/^q$/.test(zus[1])) {
      aus.push({ k: zus[1], o: t.slice(0, zus[1].length) })
      aus.push({ k: zus[2], o: t.slice(zus[1].length) })
      continue
    }
    aus.push({ k: tk, o: t })
  }
  return aus.length ? aus : null
}

/** Jahrgang mit Klassen: „7", „7b", „7b/c", „7b/7c", „7b+c", „7bc", „13ea"; Q1/Q2 → 12/13 */
function jahrgangWort(k: string): { jahrgang: number; buchstaben: string[]; niveau?: KursNiveau; zusammen?: boolean } | null {
  const q = /^q([12])$/.exec(k)
  if (q) return { jahrgang: q[1] === '1' ? 12 : 13, buchstaben: [] }
  const m = /^(\d{1,2})([a-z]{0,3})((?:[/+&]\d{0,2}[a-z])*)$/.exec(k)
  if (!m) return null
  const jahrgang = Number(m[1])
  if (!Number.isInteger(jahrgang) || jahrgang < 5 || jahrgang > 13) return null
  if (m[2] === 'ea' || m[2] === 'ga') return { jahrgang, buchstaben: [], niveau: m[2] === 'ea' ? 'eA' : 'gA' }
  const buchstaben = [...m[2]]
  for (const teil of m[3].split(/[/+&]/).filter(Boolean)) {
    const t = /^(\d{0,2})([a-z])$/.exec(teil)
    if (!t || (t[1] && Number(t[1]) !== jahrgang)) return null
    buchstaben.push(t[2])
  }
  return { jahrgang, buchstaben, zusammen: m[2].length > 1 }
}

const niveauWort = (k: string): KursNiveau | null =>
  k === 'ea' || k === 'lk' || k === 'ean' || k === 'erhoeht' ? 'eA' : k === 'ga' || k === 'gk' || k === 'gan' || k === 'grundlegend' ? 'gA' : null

/** Nur Klassenbuchstaben: „b", „b/c", „b+c" */
const buchstabenWort = (k: string): string[] | null => (/^[a-z](?:[/+&][a-z])*$/.test(k) ? k.split(/[/+&]/) : null)

/**
 * Einen IServ-Gruppennamen erkennen. `id` (Kennung wie „kurs-fr-7-kon") ist der Rückfall, wenn der Name nichts ergibt.
 * null = keine Klasse und kein Kurs (oder zu unsicher).
 */
export function gruppeErkennen(name: string, id?: string): GruppeErkannt | null {
  const a = erkennenAus(String(name ?? ''))
  if (a || !id || id === name) return a
  const b = erkennenAus(String(id))
  return b ? { ...b, roh: String(name || id) } : null
}

function erkennenAus(roh: string): GruppeErkannt | null {
  if (!roh.trim() || roh.length > 120) return null
  const w = woerter(roh)
  if (!w) return null
  // Vorsilben: „kurs-", „fach-", „k-", „grp-" (nur vorne)
  while (w.length > 1 && ['k', 'kurs', 'fach', 'grp', 'gruppe', 'lg'].includes(w[0].k)) w.shift()
  let sicherheit = 1
  let fach: Alias | null = null
  let fachWort = ''
  let jahrgang = 0
  let buchstaben: string[] = []
  let niveau: KursNiveau | undefined
  let nummer: number | undefined
  let kuerzel: string | undefined
  let klassenWort = false
  const rest: Wort[] = []
  for (let i = 0; i < w.length; i++) {
    const x = w[i]
    if (FUELL.has(x.k)) continue
    if (VOR_JAHRGANG.has(x.k) && !jahrgang) {
      if (x.k === 'klasse' || x.k === 'kl') klassenWort = true
      continue
    }
    if (x.alias && !fach) {
      fach = x.alias
      fachWort = x.k
      continue
    }
    if (!jahrgang) {
      const j = jahrgangWort(x.k)
      if (j) {
        jahrgang = j.jahrgang
        buchstaben = j.buchstaben
        if (j.niveau) niveau = j.niveau
        if (j.zusammen) sicherheit -= 0.1
        continue
      }
    }
    // Fach vor dem Jahrgang – oder direkt danach („7 FR Kon", „Q1 EN eA")
    if (!fach && EINWORT.has(x.k) && (!jahrgang || rest.length === 0)) {
      // „SP": in der Sek I meist Spanisch, in der Sek II meist Sport – erst nach dem Jahrgang entscheidbar
      fach = EINWORT.get(x.k)!
      fachWort = x.k
      continue
    }
    if (jahrgang) {
      // „7 b" bzw. „7 b/c" – Klassenbuchstaben direkt nach dem Jahrgang; „7b 7c" (aus „7b-7c") – weitere Klassen
      const b = buchstabenWort(x.k)
      if (b && !rest.length && nummer === undefined && !niveau) {
        buchstaben = [...buchstaben, ...b]
        continue
      }
      const j = jahrgangWort(x.k)
      if (j && j.jahrgang === jahrgang && j.buchstaben.length && buchstaben.length && !rest.length) {
        buchstaben = [...buchstaben, ...j.buchstaben]
        continue
      }
      const n = niveauWort(x.k)
      if (n && !niveau) {
        niveau = n
        continue
      }
      if (/^[1-9]$/.test(x.k) && nummer === undefined && !kuerzel) {
        nummer = Number(x.k)
        continue
      }
    }
    rest.push(x)
  }
  // Was übrig bleibt, darf höchstens das Kürzel der Lehrkraft sein (am Ende, nach dem Jahrgang)
  if (rest.length > 1) return null
  if (rest.length === 1) {
    const x = rest[0]
    const istLetztes = w[w.length - 1] === x || w.slice(w.indexOf(x) + 1).every((y) => FUELL.has(y.k))
    if (!jahrgang || !istLetztes || !/^[a-z]{2,4}\d?$/.test(x.k) || KEIN_KUERZEL.has(x.k)) return null
    kuerzel = x.o
  }
  if (!jahrgang) return null
  const klassen = buchstaben.map((b) => `${jahrgang}${b}`)
  if (!fach) {
    // Klasse: Jahrgang mit genau einem Buchstaben, sonst nichts
    if (klassen.length !== 1 || kuerzel || niveau || nummer !== undefined) return null
    return { art: 'klasse', jahrgang, klassen, roh: roh.trim(), sicherheit: Math.max(0, Math.min(1, sicherheit)) }
  }
  if (klassenWort) sicherheit -= 0.2
  // „SP" (siehe oben)
  if (fachWort === 'sp') fach = jahrgang <= 10 ? { fachId: 'spanisch', abzug: 0.3 } : { fachId: 'sport', abzug: 0.2 }
  sicherheit -= fach.abzug ?? 0
  const f = fachVon(fach.fachId)
  if (!f) return null
  return {
    art: 'kurs',
    fachId: f.id,
    fach: fach.fach ?? fachWert(f.id),
    jahrgang,
    ...(klassen.length ? { klassen } : {}),
    ...(niveau ? { niveau } : {}),
    ...(kuerzel ? { kuerzel } : {}),
    ...(nummer !== undefined ? { nummer } : {}),
    roh: roh.trim(),
    sicherheit: Math.max(0, Math.min(1, Math.round(sicherheit * 100) / 100))
  }
}

/** Fachname zum Speichern: kurzer Katalogname („Erdkunde" statt „Erdkunde / Geographie"), wenn er wieder zum Fach führt */
export function fachWert(fachId: string): string {
  const f = fachVon(fachId)
  if (!f) return ''
  const kurz = f.label.split(' / ')[0]
  return fachAusName(kurz)?.id === f.id ? kurz : f.label
}

/** Mehrere Gruppen erkennen (verwendbar, ohne Doppelte) – mit der IServ-Kennung */
export function gruppenErkennen(gruppen: { id: string; name: string }[]): (GruppeErkannt & { iservId: string })[] {
  const aus: (GruppeErkannt & { iservId: string })[] = []
  const gesehen = new Set<string>()
  for (const g of gruppen) {
    if (!g?.id || gesehen.has(g.id) || g.id.startsWith('vorschau:')) continue
    gesehen.add(g.id)
    // Klassen der Verwaltung („klasse:7b") sind schon Klassen
    if (g.id.startsWith('klasse:')) {
      const p = erkennenAus(g.name)
      if (p?.art === 'klasse') aus.push({ ...p, iservId: g.id })
      continue
    }
    const p = gruppeErkennen(g.name, g.id)
    if (p && p.sicherheit >= MIN_SICHERHEIT) aus.push({ ...p, iservId: g.id })
  }
  return aus
}

/** Klasse einer Person aus ihren Gruppen („7b") – die Klasse der Verwaltung zuerst; '' ohne */
export function klasseAusGruppen(gruppen: { id: string; name: string }[]): string {
  const e = gruppenErkennen(gruppen).filter((g) => g.art === 'klasse')
  return (e.find((g) => g.iservId.startsWith('klasse:')) ?? e[0])?.klassen?.[0] ?? ''
}

// ---------------------------------------------------------------- Anzeige

/** Kurzer Fachname für Namen: „Ev. Religion", „Kath. Religion", sonst der gespeicherte Name */
function fachKurz(p: Pick<GruppeErkannt, 'fach' | 'fachId'>): string {
  const f = p.fach || (p.fachId ? fachWert(p.fachId) : '')
  if (f === 'Evangelische Religion') return 'Ev. Religion'
  if (f === 'Katholische Religion') return 'Kath. Religion'
  return f
}

/** Klassen kurz: [7b, 7c] → „7b/c" */
export function klassenKurz(klassen: string[]): string {
  if (!klassen.length) return ''
  const j = /^\d+/.exec(klassen[0])?.[0] ?? ''
  return j && klassen.every((k) => k.startsWith(j)) ? `${klassen[0]}${klassen.slice(1).map((k) => `/${k.slice(j.length)}`).join('')}` : klassen.join('/')
}

/**
 * Name der Lerngruppe: Kurs einer einzelnen Klasse („EN 7b Kon") → die Klasse („7b", das Fach steht an der Lerngruppe –
 * so wird er ein Fach der Klasse in „Meine Klassen"); sonst „Französisch 7 (Kon)", „Englisch 13 eA (Kon)",
 * „Ev. Religion 7b/c".
 */
export function kursName(p: GruppeErkannt): string {
  if (p.art === 'klasse' || p.klassen?.length === 1) return p.klassen?.[0] ?? String(p.jahrgang)
  const teile = [fachKurz(p), p.klassen?.length ? klassenKurz(p.klassen) : String(p.jahrgang)]
  if (p.niveau) teile.push(p.niveau)
  if (p.nummer !== undefined) teile.push(`Kurs ${p.nummer}`)
  return `${teile.join(' ')}${p.kuerzel ? ` (${p.kuerzel})` : ''}`
}

/** Beschreibung für den Hinweis „aus IServ erkannt": „Fach Französisch · Jahrgang 7 · Kürzel Kon" */
export function erkanntText(p: GruppeErkannt): string {
  if (p.art === 'klasse') return `Klasse ${p.klassen?.[0] ?? p.jahrgang}`
  return [
    `Fach ${fachKurz(p)}`,
    `Jahrgang ${p.jahrgang}`,
    p.klassen?.length ? `Klassen ${p.klassen.join(', ')}` : '',
    p.niveau ? (p.niveau === 'eA' ? 'erhöhtes Niveau (eA)' : 'grundlegendes Niveau (gA)') : '',
    p.nummer !== undefined ? `Kurs ${p.nummer}` : '',
    p.kuerzel ? `Kürzel ${p.kuerzel}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

// ---------------------------------------------------------------- Lehrkraft

const kuerzelKlein = (k: string | undefined | null): string => (k ?? '').trim().toLowerCase()

/** Liegen die Buchstaben des Kürzels der Reihe nach im Nachnamen, mit gleichem Anfang? („kon" in „kornahrens") */
export function kuerzelPasstZuName(kuerzel: string, nachname: string): boolean {
  const k = ohneUmlaute(kuerzelKlein(kuerzel))
  const n = ohneUmlaute(klein(nachname)).replace(/[^a-z]/g, '')
  if (k.length < 2 || !n || k[0] !== n[0]) return false
  let i = 0
  for (const c of n) if (c === k[i]) i++
  return i >= k.length
}

/**
 * Kürzel der Lehrkraft: eingestellt (Meine Klassen › IServ-Erkennung) – sonst aus ihren Kursgruppen: das Kürzel, das in
 * mindestens zwei Kursen und in der Mehrheit ihrer Kurse mit Kürzel steht; sonst das einzige, das zum Nachnamen des
 * Benutzernamens („t.kornahrens") passt. null = unbekannt (dann wird das Kürzel nicht verlangt).
 */
export function eigenesKuerzel(kurse: Pick<GruppeErkannt, 'art' | 'kuerzel'>[], benutzer = '', eingestellt?: string | null): string | null {
  if (eingestellt && eingestellt.trim()) return eingestellt.trim()
  const mit = kurse.filter((p) => p.art === 'kurs' && p.kuerzel)
  const zahl = new Map<string, { k: string; n: number }>()
  for (const p of mit) {
    const s = kuerzelKlein(p.kuerzel)
    const z = zahl.get(s) ?? { k: p.kuerzel!, n: 0 }
    z.n++
    zahl.set(s, z)
  }
  const reihe = [...zahl.values()].sort((a, b) => b.n - a.n)
  if (reihe[0] && reihe[0].n >= 2 && reihe[0].n * 2 > mit.length && (!reihe[1] || reihe[1].n < reihe[0].n)) return reihe[0].k
  const nachname = benutzer.includes('.') ? benutzer.split('.').slice(1).join('') : ''
  const passend = nachname ? reihe.filter((z) => kuerzelPasstZuName(z.k, nachname)) : []
  return passend.length === 1 ? passend[0].k : null
}

/** Unterrichtet die Lehrkraft (Mitglied der Gruppe) diesen Kurs? Mit bekanntem Kürzel muss es passen – sonst genügt die Mitgliedschaft */
export function unterrichtet(p: GruppeErkannt, kuerzel: string | null | undefined): boolean {
  if (p.art !== 'kurs' || p.sicherheit < MIN_SICHERHEIT) return false
  return !p.kuerzel || !kuerzel || kuerzelKlein(p.kuerzel) === kuerzelKlein(kuerzel)
}

/** Derselbe Kurs? (Fach, Jahrgang, Klassen, Niveau, Nummer, Kürzel) */
export function gleicherKurs(a: GruppeErkannt, b: GruppeErkannt): boolean {
  if (a.art !== b.art || a.fachId !== b.fachId || a.jahrgang !== b.jahrgang) return false
  if ((a.niveau ?? '') !== (b.niveau ?? '') || (a.nummer ?? -1) !== (b.nummer ?? -1)) return false
  if (kuerzelKlein(a.kuerzel) !== kuerzelKlein(b.kuerzel)) return false
  return [...(a.klassen ?? [])].sort().join() === [...(b.klassen ?? [])].sort().join()
}

/** Anteil gemeinsamer Mitglieder (bezogen auf die größere Gruppe) */
export function mitgliederAnteil(a: Iterable<string>, b: Iterable<string>): number {
  const x = new Set(a)
  const y = new Set(b)
  if (!x.size || !y.size) return 0
  let n = 0
  for (const v of x) if (y.has(v)) n++
  return n / Math.max(x.size, y.size)
}

const schluessel = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ')

export interface VorhandeneGruppe {
  id: string
  name: string
  fach: string
  iserv_gruppe: string
  /** Benutzernamen der heutigen Mitglieder */
  mitglieder: string[]
}

export interface KursVerknuepfung {
  iservId: string
  lerngruppeId: string
  verborgen?: boolean
}

export interface KursPlan {
  kuerzel: string | null
  /** Neue Lerngruppen für Kurse der Lehrkraft */
  anlegen: { iservId: string; name: string; fach: string; erkannt: GruppeErkannt }[]
  /** Vorhandene Lerngruppe ist dieser Kurs (gleiche IServ-Gruppe, gleicher Name oder ≥ 80 % gleiche Lernende) */
  verknuepfen: { iservId: string; lerngruppeId: string; erkannt: GruppeErkannt; grund: 'iserv' | 'name' | 'mitglieder' }[]
}

/**
 * Welche Kurse bekommt die Lehrkraft als Lerngruppe? `lehrkraft.gruppen`: ihre IServ-Gruppen; `mitglieder(iservId)`: die
 * Benutzernamen der Lernenden, die (laut ihrer letzten Anmeldung) in dieser IServ-Gruppe sind; `vorhanden`: ihre
 * Lerngruppen; `bekannt`: schon verarbeitete IServ-Gruppen (angelegt, verknüpft oder ausgeblendet – nie neu anlegen).
 * Vorhandene Lerngruppen werden nur verknüpft, nie verändert.
 */
export function kursgruppenPlanen(e: {
  lehrkraft: { benutzer: string; gruppen: { id: string; name: string }[]; kuerzel?: string | null }
  mitglieder: (iservId: string) => string[]
  vorhanden: VorhandeneGruppe[]
  bekannt: KursVerknuepfung[]
}): KursPlan {
  const erkannt = gruppenErkennen(e.lehrkraft.gruppen)
  const kuerzel = eigenesKuerzel(erkannt, e.lehrkraft.benutzer, e.lehrkraft.kuerzel)
  const plan: KursPlan = { kuerzel, anlegen: [], verknuepfen: [] }
  const bekannt = new Set(e.bekannt.map((b) => b.iservId))
  const vergeben = new Set(e.bekannt.filter((b) => !b.verborgen).map((b) => b.lerngruppeId))
  for (const p of erkannt) {
    if (!unterrichtet(p, kuerzel) || bekannt.has(p.iservId)) continue
    const name = kursName(p)
    const fach = p.fach ?? ''
    const fachPasst = (g: VorhandeneGruppe): boolean => !g.fach.trim() || fachAusName(g.fach)?.id === p.fachId
    const frei = e.vorhanden.filter((g) => !vergeben.has(g.id))
    const mitIserv = frei.find((g) => g.iserv_gruppe === p.iservId && fachPasst(g))
    const mitName = frei.find((g) => fachPasst(g) && (schluessel(g.name) === schluessel(name) || schluessel(g.name) === schluessel(p.roh)) && g.fach.trim())
    let mitMitgliedern: VorhandeneGruppe | undefined
    if (!mitIserv && !mitName) {
      const iserv = e.mitglieder(p.iservId)
      if (iserv.length)
        mitMitgliedern = frei
          .filter((g) => fachPasst(g) && g.fach.trim())
          .map((g) => ({ g, a: mitgliederAnteil(g.mitglieder, iserv) }))
          .filter((x) => x.a >= GLEICHE_MITGLIEDER)
          .sort((a, b) => b.a - a.a)[0]?.g
    }
    const treffer = mitIserv ?? mitName ?? mitMitgliedern
    if (treffer) {
      plan.verknuepfen.push({ iservId: p.iservId, lerngruppeId: treffer.id, erkannt: p, grund: mitIserv ? 'iserv' : mitName ? 'name' : 'mitglieder' })
      vergeben.add(treffer.id)
      continue
    }
    plan.anlegen.push({ iservId: p.iservId, name, fach, erkannt: p })
  }
  return plan
}

// ---------------------------------------------------------------- IServ-Ordner („Ablegen ▾")

/**
 * Gruppenordner eines Kurses unter „Gruppen" (WebDAV): gleicher Name (Groß/klein egal), sonst der eine Ordner, der als
 * derselbe Kurs erkannt wird. null = keiner (oder mehrdeutig).
 */
export function ordnerFuerKurs(ordner: string[], kurs: { roh: string; erkannt?: GruppeErkannt | null }): string | null {
  const gleich = ordner.find((o) => schluessel(o) === schluessel(kurs.roh))
  if (gleich) return gleich
  const p = kurs.erkannt ?? gruppeErkennen(kurs.roh)
  if (!p) return null
  const passend = ordner.filter((o) => {
    const q = gruppeErkennen(o)
    return Boolean(q && gleicherKurs(p, q))
  })
  return passend.length === 1 ? passend[0] : null
}

// ---------------------------------------------------------------- Neues Schuljahr

/**
 * Regeln für die Nachfolge eines Kurses (shared/schuljahrWechsel.ts `nachfolgerFinden`): Nachfolger sind Kurse im selben
 * Fach im nächsten Jahrgang; bevorzugt mit gleichem Kürzel und Niveau. null = kein Kurs.
 */
export function kursNachfolgeRegeln(
  altRoh: string
): { ziel: number; alt: number; jahrgang: (name: string) => number | null; zusatz: (name: string) => string } | null {
  const p = gruppeErkennen(altRoh)
  if (!p || p.art !== 'kurs') return null
  const passend = (name: string): GruppeErkannt | null => {
    const q = gruppeErkennen(name)
    return q && q.art === 'kurs' && q.fachId === p.fachId && q.sicherheit >= MIN_SICHERHEIT ? q : null
  }
  return {
    alt: p.jahrgang,
    ziel: p.jahrgang + 1,
    jahrgang: (name) => passend(name)?.jahrgang ?? null,
    zusatz: (name) => {
      const q = passend(name)
      return q ? `${kuerzelKlein(q.kuerzel)}|${q.niveau ?? ''}` : ''
    }
  }
}

/** Jahrgang im Namen um eins weiter („Französisch 7 (Kon)" → „Französisch 8 (Kon)", „Ev. Religion 7b/c" → „… 8b/c") */
export function nameHochstufen(name: string, alt: number, neu: number): string {
  const r = new RegExp(`(?<!\\d)${alt}(?!\\d)`)
  return r.test(name) ? name.replace(r, String(neu)) : name
}

/** Jahrgang eines erkannten Kurses als Zahl (für Lerngruppen, deren Name nicht mit dem Jahrgang beginnt) */
export const kursJahrgang = (roh: string): number | null => {
  const p = gruppeErkennen(roh)
  return p?.art === 'kurs' ? p.jahrgang : null
}
