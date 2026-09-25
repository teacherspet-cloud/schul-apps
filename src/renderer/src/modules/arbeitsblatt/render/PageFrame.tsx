import { DesignTemplate, FooterSlot, PRINT_MARGINS } from '@shared/design'
import type { WorksheetMeta } from '../model/types'
import type { CitationStyle } from '@shared/types'
import { CANARY_STYLE } from '../../../shared/aiCanary'
import { RichText } from '../../../shared/richtext/RichText'

export interface PageInfo {
  design: DesignTemplate
  meta: WorksheetMeta
  logo: string | null
  schoolName: string
  /** Schriftgröße/Zeilenabstand (aus Vorlage oder Lerngruppen-Profil) */
  fontPt: number
  lineHeight: number
  isKey: boolean
  /** Sprache der festen Beschriftungen (Name, Klasse, Datum) – bei Englischarbeiten englisch */
  language?: 'de' | 'en'
  /** z. B. „★★" bei getrennten Niveau-Blättern */
  levelMark?: string
  /** Regelwerk für die Quellenangaben auf der Nachweisseite */
  citationStyle?: CitationStyle
  /** Unsichtbarer Satz, der eine KI-Nutzung sichtbar macht (leer = aus) */
  canary?: string
}

export function sidebarText(info: PageInfo): string {
  const s = info.design.sidebar
  if (s.content === 'subject') return info.meta.subjectLabel
  if (s.content === 'topic') return info.meta.topic || info.meta.title
  if (s.content === 'custom') return s.customText
  return ''
}

export function footerSlotText(slot: FooterSlot, info: PageInfo, page: number, pages: number): string {
  switch (slot) {
    case 'schoolName':
      return info.schoolName
    case 'subject':
      return info.meta.subjectLabel
    case 'topic':
      return info.meta.topic || info.meta.title
    case 'date':
      return new Date().toLocaleDateString('de-DE')
    case 'pageNumber':
      return pages > 1 ? `Seite ${page} / ${pages}` : ''
    case 'custom':
      return info.design.footer.customText
    default:
      return ''
  }
}

export const MM_PX = 96 / 25.4

/** Innenabstände der Inhaltsfläche in mm (Seitenrand + Seitenleiste). */
export function contentInsets(design: DesignTemplate): { left: number; right: number; top: number; bottom: number } {
  // Druckränder: nie näher als PRINT_MARGINS.minMm an der Kante, links optional Lochrand
  const m = Math.max(PRINT_MARGINS.minMm, design.page.marginMm)
  const left = design.page.holePunchMargin !== false ? Math.max(m, PRINT_MARGINS.holePunchMm) : m
  const sb = sidebarBox(design)
  return {
    left: sb && design.sidebar.side === 'left' ? Math.max(left, sb.start + design.sidebar.widthMm + 4) : left,
    right: sb && design.sidebar.side === 'right' ? Math.max(m, sb.start + design.sidebar.widthMm + 4) : m,
    top: m,
    bottom: Math.max(PRINT_MARGINS.footerMm, m)
  }
}

/** Lage der Seitenleiste: im bedruckbaren Bereich, links hinter dem Lochrand. */
export function sidebarBox(design: DesignTemplate): { start: number } | null {
  if (!design.sidebar.show) return null
  const holes = design.page.holePunchMargin !== false && design.sidebar.side === 'left'
  return { start: holes ? PRINT_MARGINS.holePunchMm - 5 : PRINT_MARGINS.bleedSafeMm }
}

/** Feste Beschriftungen in der Sprache des Faches */
const LABELS = {
  de: { name: 'Name:', class: 'Klasse:', date: 'Datum:', grade: (g: number) => `Klasse ${g}` },
  en: { name: 'Name:', class: 'Class:', date: 'Date:', grade: (g: number) => `Class ${g}` }
}

export const pageLabels = (info: PageInfo): (typeof LABELS)['de'] => LABELS[info.language ?? 'de']

/** Steht nur das Datum an, passt es neben den Titel – das spart eine ganze Zeile. */
export function dateInTitleRow(info: PageInfo): boolean {
  const f = info.design.header.fields
  return !info.isKey && Boolean(f.date) && !f.name && !f.class
}

/** Kleines Datumsfeld für die Titelzeile */
function DateField({ info }: { info: PageInfo }): React.JSX.Element {
  return (
    <div className="ws-field ws-field-date ws-field-inline">
      <span>{pageLabels(info).date}</span>
      <span className="ws-field-line" />
    </div>
  )
}

function Fields({ info }: { info: PageInfo }): React.JSX.Element | null {
  const f = info.design.header.fields
  const labels = pageLabels(info)
  if (info.isKey || (!f.name && !f.date && !f.class)) return null
  // Nur das Datum: Es steht dann in der Titelzeile, nicht in einer eigenen Zeile
  if (dateInTitleRow(info)) return null
  const dateOnly = false
  return (
    <div className={`ws-fields ${dateOnly ? 'ws-fields-date-only' : ''}`}>
      {f.name && (
        <div className="ws-field ws-field-name">
          <span>{labels.name}</span>
          <span className="ws-field-line" />
        </div>
      )}
      {f.class && (
        <div className="ws-field ws-field-class">
          <span>{labels.class}</span>
          <span className="ws-field-line" />
        </div>
      )}
      {f.date && (
        <div className="ws-field ws-field-date">
          <span>{labels.date}</span>
          <span className="ws-field-line" />
        </div>
      )}
    </div>
  )
}

function Logo({ info, heightMm }: { info: PageInfo; heightMm: number }): React.JSX.Element | null {
  if (!info.design.header.showLogo || !info.logo) return null
  return <img className="ws-logo" src={info.logo} alt="Schullogo" style={{ height: `${heightMm}mm` }} />
}

function FullHeader({ info }: { info: PageInfo }): React.JSX.Element {
  const h = info.design.header
  const title = (info.meta.title || info.meta.topic) + (info.isKey ? ' – Lösungen' : '')
  const subjectLine = [h.showSubject ? info.meta.subjectLabel : '', info.meta.grade ? pageLabels(info).grade(info.meta.grade) : ''].filter(Boolean).join(' · ')
  const meta = (
    <div className="ws-head-text">
      {h.showSchoolName && info.schoolName && <div className="ws-school">{info.schoolName}</div>}
      {/* Auch der Kopf: ein Mathematikblatt kann „Rechnen mit $a^m \cdot a^n$" heissen */}
      {h.showTitle && (
        <div className="ws-title">
          <RichText value={title} inline editable={false} />
        </div>
      )}
      {(subjectLine || h.customText) && <div className="ws-subject">{[subjectLine, h.customText].filter(Boolean).join(' · ')}</div>}
    </div>
  )
  const badge =
    h.showSheetNumber || info.levelMark ? (
      <div className="ws-sheetno">
        {h.showSheetNumber && info.meta.sheetNumber && <span>AB {info.meta.sheetNumber}</span>}
        {info.levelMark && <span className="ws-level-mark">{info.levelMark}</span>}
      </div>
    ) : null

  if (h.layout === 'colorBand') {
    return (
      <header className="ws-header ws-header-band">
        <div className="ws-band">
          {info.logo && h.showLogo && (
            <div className="ws-band-logo">
              <Logo info={info} heightMm={h.logoHeightMm} />
            </div>
          )}
          {meta}
          {badge}
          {dateInTitleRow(info) && <DateField info={info} />}
        </div>
        <Fields info={info} />
      </header>
    )
  }
  if (h.layout === 'centered') {
    return (
      <header className="ws-header ws-header-centered">
        <Logo info={info} heightMm={h.logoHeightMm} />
        {meta}
        {badge}
        {dateInTitleRow(info) && <DateField info={info} />}
        <Fields info={info} />
      </header>
    )
  }
  return (
    <header className={`ws-header ws-header-row ${h.layout === 'logoRight' ? 'ws-header-reverse' : ''}`}>
      <div className="ws-head-row">
        <Logo info={info} heightMm={h.logoHeightMm} />
        {meta}
        {badge}
        {dateInTitleRow(info) && <DateField info={info} />}
      </div>
      <Fields info={info} />
    </header>
  )
}

function CompactHeader({ info }: { info: PageInfo }): React.JSX.Element {
  const title = (info.meta.title || info.meta.topic) + (info.isKey ? ' – Lösungen' : '')
  return (
    <header className="ws-header ws-header-compact">
      {info.design.header.showLogo && info.logo && <img className="ws-logo" src={info.logo} alt="" style={{ height: '7mm' }} />}
      <span className="ws-compact-text">
        {info.design.header.showSubject && info.meta.subjectLabel ? `${info.meta.subjectLabel} · ` : ''}
        <RichText value={title} inline editable={false} />
      </span>
      {info.levelMark && <span className="ws-level-mark">{info.levelMark}</span>}
    </header>
  )
}

/** Eine A4-Seite mit Kopf, Fuß und Seitenleiste nach Designvorlage. */
export function PageFrame({
  info,
  page,
  pages,
  children
}: {
  info: PageInfo
  /** 1-basiert */
  page: number
  pages: number
  children?: React.ReactNode
}): React.JSX.Element {
  const d = info.design
  const insets = contentInsets(d)
  const first = page === 1
  const footerTexts = [d.footer.left, d.footer.center, d.footer.right].map((slot) => footerSlotText(slot, info, page, pages))
  const style = {
    fontFamily: d.page.fontFamily,
    fontSize: `${info.fontPt}pt`,
    lineHeight: info.lineHeight,
    ['--ws-accent' as string]: d.page.accentColor
  } as React.CSSProperties

  return (
    <div className="ws-page" style={style}>
      {/*
        Unsichtbarer KI-Test: für Lernende auf Papier und am Bildschirm nicht zu sehen,
        beim Kopieren des PDF-Textes aber enthalten. Steht nur auf dem Schülerblatt.
      */}
      {info.canary && !info.isKey && (
        <p style={CANARY_STYLE} aria-hidden>
          {info.canary}
        </p>
      )}
      {d.sidebar.show && (
        <div
          className={`ws-sidebar ws-sidebar-${d.sidebar.side}`}
          style={{
            width: `${d.sidebar.widthMm}mm`,
            background: d.sidebar.color,
            [d.sidebar.side]: `${sidebarBox(d)!.start}mm`,
            top: `${PRINT_MARGINS.bleedSafeMm}mm`,
            bottom: `${PRINT_MARGINS.bleedSafeMm}mm`,
            borderRadius: '1.5mm'
          }}
        >
          <span className="ws-sidebar-text">{sidebarText(info)}</span>
        </div>
      )}
      <div className="ws-content" style={{ left: `${insets.left}mm`, right: `${insets.right}mm`, top: `${insets.top}mm`, bottom: `${insets.bottom}mm` }}>
        {first ? (
          <FullHeader info={info} />
        ) : d.header.followingPages === 'full' ? (
          <FullHeader info={info} />
        ) : d.header.followingPages === 'compact' ? (
          <CompactHeader info={info} />
        ) : null}
        <div className="ws-body">{children}</div>
        {d.footer.show && (
          <footer className="ws-footer">
            <span className="ws-footer-left">
              {d.footer.showLogoSmall && info.logo && <img className="ws-logo" src={info.logo} alt="" style={{ height: '5mm' }} />}
              {footerTexts[0]}
            </span>
            <span className="ws-footer-center">{footerTexts[1]}</span>
            <span className="ws-footer-right">{footerTexts[2]}</span>
          </footer>
        )}
      </div>
    </div>
  )
}
