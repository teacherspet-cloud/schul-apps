// Designvorlagen für Arbeitsblätter (von Main-Prozess und Oberfläche genutzt).

export type HeaderLayout = 'logoLeft' | 'logoRight' | 'centered' | 'colorBand'

/**
 * Druckränder (Recherche 09/2026): Drucker lassen je Kante ca. 4–5 mm unbedruckt; die Lochung nach ISO 838
 * reicht bis ca. 16,5 mm ins Blatt; DIN 5008 sieht links 25 mm für Lochung/Heftung vor.
 */
export const PRINT_MARGINS = {
  /** Kein Inhalt näher an der Papierkante */
  minMm: 12,
  /** Linker Rand, wenn die Blätter gelocht und abgeheftet werden */
  holePunchMm: 25,
  /** Fußzeile/Seitenzahl mindestens so weit von der Unterkante */
  footerMm: 12,
  /** Farbflächen (Seitenleiste) beginnen erst hier – der Drucker bedruckt die äußersten Millimeter nicht */
  bleedSafeMm: 6
}
export type FooterSlot = 'none' | 'schoolName' | 'subject' | 'topic' | 'date' | 'pageNumber' | 'custom'

export interface DesignTemplate {
  id: string
  name: string
  isDefault: boolean
  page: {
    marginMm: number
    fontFamily: string
    baseFontPt: number
    /** Schriftgröße und Zeilenabstand automatisch nach Jahrgang (Lerngruppen-Profil) */
    autoFontSize: boolean
    accentColor: string
    /** Links 25 mm Lochrand zum Abheften */
    holePunchMargin: boolean
    /** Längere Texte im Blocksatz (fehlt = ja); bei Einfacher/Leichter Sprache immer linksbündig */
    justifyText?: boolean
    /** Zeilenabstand, wenn die Schriftgröße nicht automatisch gesetzt wird (barrierearm: 1,5) */
    lineHeight?: number
  }
  header: {
    layout: HeaderLayout
    showLogo: boolean
    logoHeightMm: number
    showSchoolName: boolean
    showSubject: boolean
    showTitle: boolean
    showSheetNumber: boolean
    fields: { name: boolean; date: boolean; class: boolean }
    customText: string
    followingPages: 'full' | 'compact' | 'none'
    /**
     * Überthema im Kopf (Paket 11): Pfad „Fach › Überthema", Fach links / Überthema rechts
     * oder Überthema betont mit dem Fach klein darüber. Fehlt = Pfad.
     */
    overTopicStyle?: 'path' | 'split' | 'emphasis'
  }
  footer: {
    show: boolean
    left: FooterSlot
    center: FooterSlot
    right: FooterSlot
    customText: string
    showLogoSmall: boolean
  }
  sidebar: {
    show: boolean
    side: 'left' | 'right'
    widthMm: number
    color: string
    /** Paket 11: `overTopic` = nur das Überthema, `subjectOverTopic` = „Fach › Überthema" */
    content: 'subject' | 'topic' | 'overTopic' | 'subjectOverTopic' | 'custom' | 'none'
    customText: string
  }
  tasks: {
    numberStyle: 'circle' | 'square' | 'plain'
    showSocialFormIcons: boolean
    boldOperators: boolean
  }
}

export const DESIGN_FONTS = [
  { value: 'Calibri, Carlito, "Segoe UI", Arial, sans-serif', label: 'Calibri (Standard)', word: 'Calibri' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial', word: 'Arial' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana (gut lesbar)', word: 'Verdana' },
  { value: '"Segoe UI", Tahoma, sans-serif', label: 'Segoe UI', word: 'Segoe UI' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia (Serifen)', word: 'Georgia' },
  { value: '"Comic Sans MS", "Comic Neue", cursive', label: 'Comic Sans (Grundschule)', word: 'Comic Sans MS' },
  { value: '"Trebuchet MS", "Segoe UI", sans-serif', label: 'Trebuchet MS', word: 'Trebuchet MS' },
  { value: 'Cambria, Georgia, serif', label: 'Cambria (Serifen)', word: 'Cambria' }
]

export function wordFontName(cssFamily: string): string {
  return DESIGN_FONTS.find((f) => f.value === cssFamily)?.word ?? 'Calibri'
}

const base: Omit<DesignTemplate, 'id' | 'name' | 'isDefault'> = {
  page: { marginMm: 15, fontFamily: DESIGN_FONTS[0].value, baseFontPt: 11.5, autoFontSize: true, accentColor: '#2b6cb0', holePunchMargin: true },
  header: {
    layout: 'logoLeft',
    showLogo: true,
    logoHeightMm: 14,
    showSchoolName: true,
    showSubject: true,
    showTitle: true,
    showSheetNumber: false,
    // Schüler tragen nur das Datum ein (Name und Klasse sind auf Arbeitsblättern nicht nötig)
    fields: { name: false, date: true, class: false },
    customText: '',
    followingPages: 'compact',
    overTopicStyle: 'path'
  },
  footer: { show: true, left: 'schoolName', center: 'pageNumber', right: 'subject', customText: '', showLogoSmall: false },
  sidebar: { show: false, side: 'left', widthMm: 9, color: '#2b6cb0', content: 'subject', customText: '' },
  tasks: { numberStyle: 'circle', showSocialFormIcons: true, boldOperators: true }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/**
 * Standardvorlage für neue Materialien und neue Installationen (Wunsch der Lehrkraft, 30.09.2026):
 * „Farbband". Eine bewusst gewählte eigene Voreinstellung bleibt davon unberührt (storage/designs.ts).
 */
export const STANDARD_DESIGN_ID = 'preset-farbband'

/** Die mitgelieferte Standardvorlage – Rückfall, wenn keine Liste der Vorlagen vorliegt */
export function standardDesign(): DesignTemplate {
  const alle = presetDesigns()
  return alle.find((d) => d.id === STANDARD_DESIGN_ID) ?? alle[0]
}

/** Mitgelieferte Vorlagen (werden beim ersten Start angelegt). */
export function presetDesigns(): DesignTemplate[] {
  return [
    { ...clone(base), id: 'preset-klassisch', name: 'Klassisch', isDefault: false },
    {
      ...clone(base),
      id: 'preset-farbband',
      name: 'Farbband',
      // Standardvorlage seit 30.09.2026 (Wunsch der Lehrkraft; vorher „Klassisch")
      isDefault: true,
      page: { ...base.page, accentColor: '#0b7285' },
      header: { ...clone(base.header), layout: 'colorBand' },
      tasks: { ...base.tasks, numberStyle: 'square' }
    },
    {
      ...clone(base),
      id: 'preset-seitenleiste',
      name: 'Seitenleiste',
      isDefault: false,
      page: { ...base.page, accentColor: '#5f3dc4' },
      // Rechts: links liegt der Lochrand
      sidebar: { show: true, side: 'right', widthMm: 10, color: '#5f3dc4', content: 'subject', customText: '' },
      header: { ...clone(base.header), layout: 'logoRight' }
    },
    {
      ...clone(base),
      id: 'preset-schlicht',
      name: 'Schlicht',
      isDefault: false,
      page: { ...base.page, accentColor: '#343a40', fontFamily: DESIGN_FONTS[1].value, baseFontPt: 11 },
      header: { ...clone(base.header), layout: 'centered', showLogo: false, followingPages: 'none' },
      footer: { ...base.footer, left: 'none', right: 'none' },
      tasks: { ...base.tasks, numberStyle: 'plain', showSocialFormIcons: false }
    },
    // ---- Vorlagen nach Recherche zur Arbeitsblattgestaltung (ISB Bayern, BDA Dyslexia Style Guide, Mercator-Leitfaden) ----
    {
      // Große, klare Schrift, eine Aufgabe je Kasten, Symbole für Sozialformen, Blattnummer
      ...clone(base),
      id: 'preset-grundschule',
      name: 'Grundschule freundlich',
      isDefault: false,
      page: { ...base.page, accentColor: '#e8590c', fontFamily: DESIGN_FONTS[2].value, baseFontPt: 14 },
      header: { ...clone(base.header), layout: 'centered', showSheetNumber: true, followingPages: 'compact' },
      footer: { ...base.footer, left: 'none', center: 'pageNumber', right: 'none' },
      tasks: { numberStyle: 'circle', showSocialFormIcons: true, boldOperators: true }
    },
    {
      // Serifenlos, linksbündig, einspaltig, kontrastreich, Farbe nur als Zusatz – LRS- und DaZ-freundlich
      ...clone(base),
      id: 'preset-barrierearm',
      name: 'Barrierearm (LRS/DaZ)',
      isDefault: false,
      // Nach dem BDA Dyslexia Style Guide: serifenlos, 14 pt, Zeilenabstand 1,5, linksbündig, breiter Rand
      page: {
        ...base.page,
        accentColor: '#1c4f8a',
        fontFamily: DESIGN_FONTS[2].value,
        baseFontPt: 14,
        autoFontSize: false,
        justifyText: false,
        lineHeight: 1.5,
        marginMm: 22
      },
      header: { ...clone(base.header), layout: 'logoLeft', showSchoolName: false, followingPages: 'none' },
      footer: { ...base.footer, left: 'topic', center: 'none', right: 'pageNumber' },
      tasks: { numberStyle: 'square', showSocialFormIcons: true, boldOperators: true }
    },
    {
      // Station/Kompetenz in der Seitenleiste, Blattnummer und Niveau sichtbar – Orientierung im selbstständigen Lernen
      ...clone(base),
      id: 'preset-lernbuero',
      name: 'Lernbüro / Stationen',
      isDefault: false,
      page: { ...base.page, accentColor: '#0b7285', fontFamily: DESIGN_FONTS[3].value, baseFontPt: 12 },
      header: { ...clone(base.header), layout: 'colorBand', showSheetNumber: true, followingPages: 'compact' },
      footer: { ...base.footer, left: 'subject', center: 'pageNumber', right: 'topic' },
      sidebar: { show: true, side: 'right', widthMm: 9, color: '#0b7285', content: 'topic', customText: '' },
      tasks: { numberStyle: 'square', showSocialFormIcons: true, boldOperators: true }
    },
    {
      // Serifenschrift für Materialien, dezente Akzentlinie, keine Symbole – sachlich für die Oberstufe
      ...clone(base),
      id: 'preset-oberstufe',
      name: 'Oberstufe akademisch',
      isDefault: false,
      page: { ...base.page, accentColor: '#2c3e50', fontFamily: DESIGN_FONTS[7].value, baseFontPt: 11, autoFontSize: false },
      header: { ...clone(base.header), layout: 'logoRight', showSchoolName: true, followingPages: 'compact' },
      footer: { ...base.footer, left: 'subject', center: 'none', right: 'pageNumber' },
      tasks: { numberStyle: 'plain', showSocialFormIcons: false, boldOperators: true }
    },
    {
      // Netzwerk Leichte Sprache und DIN SPEC 33429: 16 pt, Zeilenabstand 1,5, sehr kurze Zeilen, keine Trennung
      ...clone(base),
      id: 'preset-leichte-sprache',
      name: 'Leichte Sprache / DaZ',
      isDefault: false,
      page: {
        ...base.page,
        accentColor: '#2b6cb0',
        fontFamily: DESIGN_FONTS[2].value,
        baseFontPt: 16,
        autoFontSize: false,
        justifyText: false,
        lineHeight: 1.5,
        marginMm: 25
      },
      header: { ...clone(base.header), layout: 'logoLeft', showSchoolName: false, showSubject: false, followingPages: 'none' },
      footer: { ...base.footer, left: 'none', center: 'pageNumber', right: 'none' },
      tasks: { numberStyle: 'circle', showSocialFormIcons: true, boldOperators: true }
    },
    {
      // Viel Platz zum Schreiben: großzügige Ränder und Zeilen, ruhige Gestaltung
      ...clone(base),
      id: 'preset-schreibraum',
      name: 'Viel Schreibraum',
      isDefault: false,
      page: { ...base.page, accentColor: '#2f6f4f', baseFontPt: 12.5, autoFontSize: false, lineHeight: 1.45, marginMm: 20 },
      header: { ...clone(base.header), layout: 'colorBand', showSheetNumber: true, followingPages: 'compact' },
      footer: { ...base.footer, left: 'subject', center: 'pageNumber', right: 'date' },
      tasks: { numberStyle: 'circle', showSocialFormIcons: true, boldOperators: true }
    }
  ]
}

/** Ergänzt fehlende Felder (z. B. aus älteren Dateien) mit Standardwerten. */
export function normalizeDesign(d: Partial<DesignTemplate> & { id: string; name: string }): DesignTemplate {
  const b = clone(base)
  return {
    id: d.id,
    name: d.name,
    isDefault: Boolean(d.isDefault),
    page: { ...b.page, ...d.page, marginMm: Math.max(PRINT_MARGINS.minMm, d.page?.marginMm ?? b.page.marginMm) },
    header: { ...b.header, ...d.header, fields: { ...b.header.fields, ...d.header?.fields } },
    footer: { ...b.footer, ...d.footer },
    sidebar: { ...b.sidebar, ...d.sidebar },
    tasks: { ...b.tasks, ...d.tasks }
  }
}
