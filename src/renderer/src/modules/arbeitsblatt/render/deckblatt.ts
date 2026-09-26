/**
 * Deckblatt, Paket 11: Anordnung der Seitenvorschauen und Wahl der Seiten.
 *
 * Wunsch der Lehrkraft (26.09.2026): Die Vorschauen entstehen weiter aus den echten Seiten,
 * stehen aber nicht mehr fest per CSS gefächert. Es gibt Start-Layouts (Fächer, Stapel,
 * Treppe, Raster, Pinnwand); danach lässt sich jede Seite im Editor frei ziehen, drehen,
 * vergrößern und nach vorn oder hinten legen. Druck, PDF und Word geben genau diese Lage
 * wieder.
 *
 * Deshalb rechnet alles hier in MILLIMETERN AUF DER A4-SEITE (210 × 297 mm), nicht in
 * Bildpunkten der Vorschau: Dieselben Zahlen setzen die Vorschau (CoverPage.tsx), der Druck
 * (printHtml.tsx) und die schwebenden Bilder im Word-Export (export/docx.ts). Eine Karte ist
 * durch ihre MITTE, ihre Breite, ihre Drehung und ihre Ebene beschrieben – die Höhe folgt aus
 * dem Seitenformat (hoch oder quer) und dem Rahmen.
 *
 * Dieses Modul kennt weder React noch den Speicher; die Unit-Tests prüfen es direkt
 * (tests/deckblatt.test.ts).
 */

export type DeckblattLayout = 'faecher' | 'stapel' | 'treppe' | 'raster' | 'pinnwand'
export type DeckblattKopf = 'band' | 'seite' | 'zentriert' | 'titelbild'
export type DeckblattMaskottchen = 'fuchs' | 'tier' | 'fach' | 'bild' | 'keins'
export type DeckblattTier = 'eule' | 'igel' | 'baer' | 'katze' | 'pinguin'
export type DeckblattRahmen = 'schlicht' | 'polaroid'

/** Lage einer Seitenvorschau auf dem Deckblatt – alles in mm auf der A4-Seite */
export interface DeckblattKarte {
  /** Schlüssel der Seite (siehe `SeitenKandidat.schluessel`) */
  seite: string
  /** Mitte der Karte */
  x: number
  y: number
  /** Außenbreite der Karte samt Rahmen */
  breite: number
  /** Drehung im Uhrzeigersinn, Grad */
  drehung: number
  /** Ebene: größer liegt oben */
  ebene: number
}

export const DECKBLATT_LAYOUTS: { value: DeckblattLayout; label: string }[] = [
  { value: 'faecher', label: 'Fächer' },
  { value: 'stapel', label: 'Stapel' },
  { value: 'treppe', label: 'Treppe' },
  { value: 'raster', label: 'Raster' },
  { value: 'pinnwand', label: 'Pinnwand' }
]

export const DECKBLATT_KOEPFE: { value: DeckblattKopf; label: string }[] = [
  { value: 'band', label: 'Farbband oben' },
  { value: 'seite', label: 'Seitliches Band' },
  { value: 'zentriert', label: 'Zentriert' },
  { value: 'titelbild', label: 'Großes Titelbild' }
]

export const DECKBLATT_MASKOTTCHEN: { value: DeckblattMaskottchen; label: string }[] = [
  { value: 'fuchs', label: 'Fuchs' },
  { value: 'tier', label: 'Anderes Tier' },
  { value: 'fach', label: 'Fachsymbol' },
  { value: 'bild', label: 'Eigenes Bild' },
  { value: 'keins', label: 'Keins' }
]

export const DECKBLATT_TIERE: { value: DeckblattTier; label: string; prompt: string }[] = [
  { value: 'eule', label: 'Eule', prompt: 'eine freundliche Eule' },
  { value: 'igel', label: 'Igel', prompt: 'ein freundlicher Igel' },
  { value: 'baer', label: 'Bär', prompt: 'ein freundlicher Bär' },
  { value: 'katze', label: 'Katze', prompt: 'eine freundliche Katze' },
  { value: 'pinguin', label: 'Pinguin', prompt: 'ein freundlicher Pinguin' }
]

/** Höchstens so viele Seiten auf einem Deckblatt – darüber wird jede Vorschau unleserlich klein */
export const DECKBLATT_HOECHSTENS = 8

export const SEITE_B = 210
export const SEITE_H = 297

export interface Flaeche {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Freie Fläche für die Vorschauen je Kopf-Layout (mm).
 *
 * Faustwerte, am Deckblatt mit drei Zeilen Kurztext und einer Reihe Merkmale ausgemessen
 * (26.09.2026): Darüber stehen Kopf, Kurztext und Merkmale. Die Layouts setzen die Karten in
 * diese Fläche; frei gezogen darf eine Karte überallhin, solange sie auf dem Blatt bleibt.
 */
export function vorschauFlaeche(kopf: DeckblattKopf = 'band'): Flaeche {
  switch (kopf) {
    case 'seite':
      return { x0: 74, y0: 96, x1: 200, y1: 287 }
    case 'zentriert':
      return { x0: 12, y0: 142, x1: 198, y1: 287 }
    case 'titelbild':
      return { x0: 12, y0: 160, x1: 198, y1: 287 }
    default:
      return { x0: 12, y0: 118, x1: 198, y1: 287 }
  }
}

/** Rahmen, der ohne eigene Wahl gilt: Polaroid gehört zur Pinnwand */
export const geltenderRahmen = (layout: DeckblattLayout | undefined, rahmen: DeckblattRahmen | undefined): DeckblattRahmen =>
  rahmen ?? (layout === 'pinnwand' ? 'polaroid' : 'schlicht')

/**
 * Ränder des Polaroid-Rahmens als Anteil der Kartenbreite: seitlich und oben schmal, unten
 * breiter – wie beim Sofortbild. Schlicht: kein Rand.
 */
export function rahmenRaender(rahmen: DeckblattRahmen): { seite: number; oben: number; unten: number } {
  return rahmen === 'polaroid' ? { seite: 0.055, oben: 0.055, unten: 0.2 } : { seite: 0, oben: 0, unten: 0 }
}

/** Querformat? (Das Tafelbild steht quer, alle anderen Seiten hoch.) */
export const istQuer = (seite: string): boolean => seite.startsWith('tafel:')

/** Außenmaße einer Karte (mm) aus Breite, Format und Rahmen */
export function kartenMasse(
  breite: number,
  quer: boolean,
  rahmen: DeckblattRahmen
): { breite: number; hoehe: number; innenBreite: number; innenHoehe: number } {
  const r = rahmenRaender(rahmen)
  const innenBreite = breite * (1 - 2 * r.seite)
  const innenHoehe = innenBreite * (quer ? SEITE_B / SEITE_H : SEITE_H / SEITE_B)
  return { breite, hoehe: innenHoehe + breite * (r.oben + r.unten), innenBreite, innenHoehe }
}

/** Umriss einer gedrehten Karte (achsenparallel) */
export function umriss(k: DeckblattKarte, rahmen: DeckblattRahmen): Flaeche {
  const { breite, hoehe } = kartenMasse(k.breite, istQuer(k.seite), rahmen)
  const w = (k.drehung * Math.PI) / 180
  const bx = (Math.abs(Math.cos(w)) * breite + Math.abs(Math.sin(w)) * hoehe) / 2
  const by = (Math.abs(Math.sin(w)) * breite + Math.abs(Math.cos(w)) * hoehe) / 2
  return { x0: k.x - bx, y0: k.y - by, x1: k.x + bx, y1: k.y + by }
}

/** Pseudozufall, der für dieselbe Seite immer gleich ausfällt – die Pinnwand soll nicht bei jedem Neuzeichnen springen */
function wuerfel(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Karten so verkleinern und verschieben, dass ihr gemeinsamer Umriss in die Fläche passt.
 *
 * Die Layouts rechnen mit Faustformeln für Überlappung und Drehung; statt jede Formel für
 * jede Seitenzahl nachzuweisen, wird das Ergebnis hier gemessen und notfalls eingepasst. So
 * liegt keine Vorschau jemals halb über dem Kopf oder außerhalb des Blattes.
 */
export function einpassen(karten: DeckblattKarte[], flaeche: Flaeche, rahmen: DeckblattRahmen): DeckblattKarte[] {
  if (!karten.length) return karten
  let aktuell = karten
  for (let runde = 0; runde < 4; runde++) {
    const u = aktuell.map((k) => umriss(k, rahmen))
    const g = {
      x0: Math.min(...u.map((a) => a.x0)),
      y0: Math.min(...u.map((a) => a.y0)),
      x1: Math.max(...u.map((a) => a.x1)),
      y1: Math.max(...u.map((a) => a.y1))
    }
    const faktor = Math.min(1, (flaeche.x1 - flaeche.x0) / (g.x1 - g.x0), (flaeche.y1 - flaeche.y0) / (g.y1 - g.y0))
    const gx = (g.x0 + g.x1) / 2
    const gy = (g.y0 + g.y1) / 2
    const fx = (flaeche.x0 + flaeche.x1) / 2
    const fy = (flaeche.y0 + flaeche.y1) / 2
    // Um die Mitte des Umrisses verkleinern und in die Mitte der Fläche setzen
    aktuell = aktuell.map((k) => ({ ...k, x: fx + (k.x - gx) * faktor, y: fy + (k.y - gy) * faktor, breite: k.breite * faktor }))
    if (faktor > 0.999) break
  }
  return aktuell.map((k) => ({ ...k, x: runde2(k.x), y: runde2(k.y), breite: runde2(k.breite), drehung: runde2(k.drehung) }))
}

const runde2 = (v: number): number => Math.round(v * 100) / 100

/**
 * Start-Layout für die gewählten Seiten.
 *
 * Alle Layouts liefern gültige Lagen innerhalb der Fläche (`einpassen`), die erste Seite
 * liegt immer gut sichtbar – beim Stapel oben, sonst vorn in der Reihe.
 */
export function layoutKarten(layout: DeckblattLayout, seiten: string[], flaeche: Flaeche, rahmen: DeckblattRahmen): DeckblattKarte[] {
  const n = seiten.length
  if (!n) return []
  const fb = flaeche.x1 - flaeche.x0
  const fh = flaeche.y1 - flaeche.y0
  const mx = (flaeche.x0 + flaeche.x1) / 2
  const my = (flaeche.y0 + flaeche.y1) / 2
  // Verhältnis Höhe/Breite einer Hochformat-Karte mit diesem Rahmen
  const hoch = kartenMasse(100, false, rahmen).hoehe / 100
  const karte = (i: number, x: number, y: number, breite: number, drehung: number, ebene = i): DeckblattKarte => ({
    seite: seiten[i],
    x,
    y,
    breite,
    drehung,
    ebene
  })
  let karten: DeckblattKarte[]
  switch (layout) {
    case 'stapel': {
      // Ein lockerer Stapel: die erste Seite oben, die übrigen schräg dahinter hervorschauend
      const breite = Math.min(fh / hoch / (1 + 0.06 * n), fb * 0.55)
      karten = seiten.map((_, i) => {
        const r = n - 1 - i
        return karte(i, mx + (r - (n - 1) / 2) * 7, my + (r - (n - 1) / 2) * 3.5, breite, (r % 2 ? -1 : 1) * Math.min(9, 2 + r * 1.6), n - i)
      })
      break
    }
    case 'treppe': {
      // Diagonal von links oben nach rechts unten, jede Seite ein Stück weiter vorn
      const breite = Math.min(fb / (1 + 0.42 * (n - 1)), fh / hoch / (1 + 0.24 * (n - 1)))
      const hoehe = breite * hoch
      const dx = n > 1 ? (fb - breite) / (n - 1) : 0
      const dy = n > 1 ? (fh - hoehe) / (n - 1) : 0
      karten = seiten.map((_, i) => karte(i, flaeche.x0 + breite / 2 + i * dx, flaeche.y0 + hoehe / 2 + i * dy, breite, 0))
      break
    }
    case 'raster':
    case 'pinnwand': {
      // Spaltenzahl so, dass die Karten möglichst groß werden
      const luft = layout === 'pinnwand' ? 7 : 5
      let best = { spalten: 1, breite: 0 }
      for (let spalten = 1; spalten <= n; spalten++) {
        const zeilen = Math.ceil(n / spalten)
        const breite = Math.min((fb - luft * (spalten - 1)) / spalten, (fh - luft * (zeilen - 1)) / zeilen / hoch)
        if (breite > best.breite) best = { spalten, breite }
      }
      const { spalten } = best
      const zeilen = Math.ceil(n / spalten)
      const breite = best.breite * (layout === 'pinnwand' ? 0.86 : 1)
      const hoehe = breite * hoch
      const zb = fb / spalten
      const zh = fh / zeilen
      karten = seiten.map((_, i) => {
        const zeile = Math.floor(i / spalten)
        // Die letzte, unvollständige Reihe mittig
        const inReihe = zeile === zeilen - 1 ? n - zeile * spalten : spalten
        const spalte = i % spalten
        const x = mx + (spalte - (inReihe - 1) / 2) * zb
        const y = flaeche.y0 + zh * zeile + zh / 2
        if (layout === 'raster') return karte(i, x, y, breite, 0)
        // Pinnwand: kleine Drehungen und Versätze, für jede Stelle immer dieselben
        const z = wuerfel(i + 1)
        return karte(i, x + (wuerfel(i + 11) - 0.5) * (zb - breite) * 0.6, y + (wuerfel(i + 21) - 0.5) * (zh - hoehe) * 0.6, breite, (z - 0.5) * 10)
      })
      break
    }
    default: {
      // Fächer: eine Reihe, leicht überlappend, außen tiefer und stärker gedreht. In einer hohen,
      // schmalen Fläche (seitliches Band) überlappen die Karten stärker und werden dafür größer.
      const ueberlapp = fb < fh ? 0.42 : 0.62
      const breite = Math.min((fb / (1 + ueberlapp * (n - 1))) * 0.95, (fh / hoch) * 0.82)
      const schritt = n > 1 ? Math.min(breite * 0.78, (fb - breite) / (n - 1)) : 0
      const winkel = Math.min(16, 4 + n * 2)
      karten = seiten.map((_, i) => {
        const t = n > 1 ? i / (n - 1) - 0.5 : 0
        return karte(i, mx + (i - (n - 1) / 2) * schritt, my + Math.abs(t) * 2 * (breite * 0.12), breite, t * winkel * 2)
      })
    }
  }
  return einpassen(karten, flaeche, rahmen)
}

/** Karte auf dem Blatt halten (beim freien Ziehen und Vergrößern) */
export function aufsBlatt(k: DeckblattKarte, rahmen: DeckblattRahmen): DeckblattKarte {
  const breite = Math.min(Math.max(k.breite, 18), 190)
  let karte = { ...k, breite }
  const u = umriss(karte, rahmen)
  const dx = u.x0 < 0 ? -u.x0 : u.x1 > SEITE_B ? SEITE_B - u.x1 : 0
  const dy = u.y0 < 0 ? -u.y0 : u.y1 > SEITE_H ? SEITE_H - u.y1 : 0
  karte = { ...karte, x: karte.x + dx, y: karte.y + dy }
  return karte
}

/**
 * Die Lage, die gilt: die von Hand angepasste, soweit sie zu den gewählten Seiten passt –
 * sonst das Start-Layout. Eine neu hinzugefügte Seite bekommt ihren Platz aus dem Layout.
 */
export function geltendeAnordnung(
  seiten: string[],
  layout: DeckblattLayout,
  flaeche: Flaeche,
  rahmen: DeckblattRahmen,
  eigene: DeckblattKarte[] | undefined
): DeckblattKarte[] {
  const start = layoutKarten(layout, seiten, flaeche, rahmen)
  if (!eigene?.length) return start
  const hoechste = Math.max(0, ...eigene.map((k) => k.ebene))
  return start.map((k, i) => eigene.find((e) => e.seite === k.seite) ?? { ...k, ebene: hoechste + 1 + i })
}

// ---------- Welche Seiten? ----------

export type SeitenArt = 'blatt' | 'hilfsblatt' | 'hilfekarten' | 'lehrkraft' | 'nachweise' | 'loesung' | 'tafel'

export interface SeitenKandidat {
  /** `s:<Blatt>:print:<Seite>`, `s:<Blatt>:key:<Seite>` oder `tafel:<Nr>` */
  schluessel: string
  art: SeitenArt
  sheetId?: string
  key?: boolean
  /** Seitennummer innerhalb des Blattes bzw. des Tafelbilds (0-basiert) */
  index: number
  /** Beschriftung in der Seitenwahl */
  titel: string
}

export const seitenSchluessel = (sheetId: string, key: boolean, index: number): string => `s:${sheetId}:${key ? 'key' : 'print'}:${index}`

/** Schlüssel zerlegen; null bei unbekannter Form */
export function zerlegeSchluessel(s: string): { tafel: number } | { sheetId: string; key: boolean; index: number } | null {
  const t = s.match(/^tafel:(\d+)$/)
  if (t) return { tafel: Number(t[1]) }
  const m = s.match(/^s:(.+):(print|key):(\d+)$/)
  return m ? { sheetId: m[1], key: m[2] === 'key', index: Number(m[3]) } : null
}

/**
 * Seiten automatisch wählen: vier bis sechs AUSSAGEKRÄFTIGE Seiten.
 *
 * Wunsch der Lehrkraft (26.09.2026): „automatisch 4–6 aussagekräftige Seiten (auch Lösungs-,
 * Tafelbild-, Hilfekarten-Seiten)". Die Rangfolge ist eine Faustregel, keine Messung:
 * 1. die erste Seite des ersten Blattes – sie zeigt Titel, Einstieg und Gestaltung;
 * 2. je eine Seite der Zusätze, die das Material von einem bloßen Aufgabenblatt abheben:
 *    Tafelbild, Hilfekarten, Lösungen (erste Lösungsseite), Hilfsblatt;
 * 3. die erste Seite jedes weiteren Blattes (Niveaustufen, Gruppenfassungen);
 * 4. die übrigen Seiten des ersten Blattes, gleichmäßig verteilt (wie `vorschauSeiten`):
 *    Bei einem langen Blatt sähe man sonst viermal den Anfang und nie eine Aufgabe.
 * Nie von selbst: Bildnachweise und die Lehrkraftseite mit dem Notenschlüssel – sie sagen
 * über das Material nichts. Von Hand lassen sie sich trotzdem hinzufügen.
 *
 * Wie viele: sechs, wenn es so viele aussagekräftige gibt; sonst alle (mindestens eine).
 * Die Reihenfolge der Auswahl folgt dem Material (Blatt, Zusätze, Lösungen, Tafelbild).
 */
export function waehleSeiten(kandidaten: SeitenKandidat[], hoechstens = 6): string[] {
  const nutzbar = kandidaten.filter((k) => k.art !== 'nachweise' && k.art !== 'lehrkraft')
  if (!nutzbar.length) return []
  const gewaehlt: SeitenKandidat[] = []
  const nimm = (k: SeitenKandidat | undefined): void => {
    if (k && !gewaehlt.includes(k) && gewaehlt.length < hoechstens) gewaehlt.push(k)
  }
  const blaetter = [...new Set(nutzbar.filter((k) => k.art === 'blatt').map((k) => k.sheetId))]
  const erstes = nutzbar.filter((k) => k.art === 'blatt' && k.sheetId === blaetter[0])
  nimm(erstes[0])
  nimm(nutzbar.find((k) => k.art === 'tafel'))
  nimm(nutzbar.find((k) => k.art === 'hilfekarten'))
  nimm(nutzbar.find((k) => k.art === 'loesung'))
  nimm(nutzbar.find((k) => k.art === 'hilfsblatt'))
  for (const id of blaetter.slice(1)) nimm(nutzbar.find((k) => k.art === 'blatt' && k.sheetId === id))
  // Übrige Seiten des ersten Blattes gleichmäßig verteilt, die letzte zuerst
  const rest = erstes.slice(1)
  const frei = hoechstens - gewaehlt.length
  if (frei > 0 && rest.length) {
    const auswahl = rest.length <= frei ? rest : Array.from({ length: frei }, (_, k) => rest[Math.round(((k + 1) * (rest.length - 1)) / frei)])
    for (const k of auswahl) nimm(k)
  }
  // Immer noch Platz (kurzes Material): weitere Lösungsseiten
  for (const k of nutzbar) if (gewaehlt.length < Math.min(hoechstens, 4)) nimm(k)
  const ordnung = new Map(kandidaten.map((k, i) => [k.schluessel, i]))
  return gewaehlt.map((k) => k.schluessel).sort((a, b) => (ordnung.get(a) ?? 0) - (ordnung.get(b) ?? 0))
}

/**
 * Die Seiten, die gelten: die gewählten, soweit es sie noch gibt – sonst die automatische Wahl.
 * Eine gewählte Seite, die es nach einer Änderung am Blatt nicht mehr gibt (Blatt kürzer
 * geworden), fällt still heraus.
 */
export function geltendeSeiten(kandidaten: SeitenKandidat[], gewaehlt: string[] | undefined): string[] {
  const vorhanden = new Set(kandidaten.map((k) => k.schluessel))
  const eigene = (gewaehlt ?? []).filter((s) => vorhanden.has(s)).slice(0, DECKBLATT_HOECHSTENS)
  return eigene.length ? eigene : waehleSeiten(kandidaten)
}
