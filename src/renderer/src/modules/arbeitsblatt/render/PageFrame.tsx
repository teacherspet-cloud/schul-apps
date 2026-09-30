import { DesignTemplate, FooterSlot, PRINT_MARGINS } from '@shared/design'
import type { WorksheetMeta } from '../model/types'
import { kiVermerkText, vermerkSichtbar } from '@shared/kiKennzeichnung'
import type { CitationStyle } from '@shared/types'
import { CANARY_STYLE } from '../../../shared/aiCanary'
import { RichText } from '../../../shared/richtext/RichText'
import { fachPfad, ueberthemaVon, type UeberthemaStil } from '../../../shared/ueberthema'
import { KOPF_LABELS, SEITE, type KopfLabels, type KopfSprache } from '../../../shared/kopfSprache'

export interface PageInfo {
  /** Titel in der Kopfzeile direkt im Blatt ändern (27.09.2026) – fehlt = nur lesen */
  onTitle?: (title: string) => void
  design: DesignTemplate
  meta: WorksheetMeta
  logo: string | null
  schoolName: string
  /** Schriftgröße/Zeilenabstand (aus Vorlage oder Lerngruppen-Profil) */
  fontPt: number
  lineHeight: number
  isKey: boolean
  /** Sprache der festen Beschriftungen (Name, Klasse, Datum) – bei Englischarbeiten englisch */
  language?: KopfSprache
  /** z. B. „★★" bei getrennten Niveau-Blättern */
  levelMark?: string
  /** Regelwerk für die Quellenangaben auf der Nachweisseite */
  citationStyle?: CitationStyle
  /** Unsichtbarer Satz, der eine KI-Nutzung sichtbar macht (leer = aus) */
  canary?: string
}

/** Titel im Kopf; im Lösungsteil mit dem Begriff des Moduls („– Lösungen", „– Erwartungshorizont"). */
export const kopfTitel = (meta: WorksheetMeta, isKey: boolean): string => (meta.title || meta.topic) + (isKey ? ` – ${meta.loesungsBegriff || 'Lösungen'}` : '')

/**
 * Überthema im Kopf (Paket 11) – wie es die Designvorlage darstellen lässt.
 * - `fachZeile`: der Fachteil der Zeile unter dem Titel („Biologie › Ökologie" beim Pfad);
 * - `block`: das Überthema als eigener Block rechts im Kopf (Fach links / Überthema rechts
 *   bzw. betont mit dem Fach klein darüber) – bewusst beim Kopfband und nicht bei der
 *   Blattüberschrift.
 * Ohne Überthema bleibt alles wie vor Paket 11: kein Block, kein einsamer Pfeil.
 * Vorschau und Word-Export (export/docx.ts) lesen beide hier.
 */
export interface KopfUeberthema {
  stil: UeberthemaStil
  ueber: string
  fachZeile: string
  block: { fach: string; thema: string } | null
}

export function kopfUeberthema(info: PageInfo): KopfUeberthema {
  const stil = info.design.header.overTopicStyle ?? 'path'
  const fach = info.design.header.showSubject ? info.meta.subjectLabel : ''
  const ueber = ueberthemaVon(info.meta)
  if (!ueber || stil === 'path') return { stil, ueber, fachZeile: fachPfad(fach, ueber), block: null }
  if (stil === 'split') return { stil, ueber, fachZeile: fach, block: { fach: '', thema: ueber } }
  return { stil, ueber, fachZeile: '', block: { fach, thema: ueber } }
}

/** Text vor dem Titel im kompakten Kopf: Fach bzw. „Fach › Überthema" (Pfad) */
export function kompaktVorTitel(info: PageInfo): string {
  const u = kopfUeberthema(info)
  const fach = u.stil === 'path' ? u.fachZeile : info.design.header.showSubject ? info.meta.subjectLabel : ''
  return fach ? `${fach} · ` : ''
}

export function sidebarText(info: PageInfo): string {
  const s = info.design.sidebar
  if (s.content === 'subject') return info.meta.subjectLabel
  if (s.content === 'topic') return info.meta.topic || info.meta.title
  // Paket 11: das Überthema allein oder als Pfad hinter dem Fach (ohne Überthema nur das Fach)
  if (s.content === 'overTopic') return ueberthemaVon(info.meta)
  if (s.content === 'subjectOverTopic') return fachPfad(info.meta.subjectLabel, ueberthemaVon(info.meta))
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
      return pages > 1 ? `${SEITE[info.language ?? 'de']} ${page} / ${pages}` : ''
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
/**
 * Beschriftungen und „Seite" in der Sprache des Kopfes – seit 30.09.2026 für alle Schulfremdsprachen
 * an einer Stelle (shared/kopfSprache.ts); SEITE bleibt hier für bestehende Importe erhalten.
 */
export { SEITE }

export const pageLabels = (info: PageInfo): KopfLabels => KOPF_LABELS[info.language ?? 'de']

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

/** Überthema als eigener Block im Kopf (Fach links / Überthema rechts bzw. betont) */
function UeberthemaBlock({ u }: { u: KopfUeberthema }): React.JSX.Element | null {
  if (!u.block) return null
  return (
    <div className={`ws-ueberthema ws-ueberthema-${u.stil}`} data-ueberthema={u.ueber}>
      {u.block.fach && <span className="ws-ueberthema-fach">{u.block.fach}</span>}
      <span className="ws-ueberthema-thema">{u.block.thema}</span>
    </div>
  )
}

function FullHeader({ info }: { info: PageInfo }): React.JSX.Element {
  const h = info.design.header
  const title = kopfTitel(info.meta, info.isKey)
  const u = kopfUeberthema(info)
  const subjectLine = [u.fachZeile, info.meta.grade ? pageLabels(info).grade(info.meta.grade) : ''].filter(Boolean).join(' · ')
  const meta = (
    <div className="ws-head-text">
      {h.showSchoolName && info.schoolName && <div className="ws-school">{info.schoolName}</div>}
      {/* Auch der Kopf: ein Mathematikblatt kann „Rechnen mit $a^m \cdot a^n$" heissen */}
      {h.showTitle && (
        <div className="ws-title">
          <RichText value={title} inline editable={Boolean(info.onTitle) && !info.isKey} onChange={info.onTitle} />
        </div>
      )}
      {(subjectLine || h.customText) && (
        <div className="ws-subject" data-ueberthema={u.stil === 'path' && u.ueber ? u.ueber : undefined}>
          {[subjectLine, h.customText].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  )
  const block = <UeberthemaBlock u={u} />
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
          {block}
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
        {block}
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
        {block}
        {badge}
        {dateInTitleRow(info) && <DateField info={info} />}
      </div>
      <Fields info={info} />
    </header>
  )
}

function CompactHeader({ info }: { info: PageInfo }): React.JSX.Element {
  const title = kopfTitel(info.meta, info.isKey)
  const u = kopfUeberthema(info)
  return (
    <header className="ws-header ws-header-compact">
      {info.design.header.showLogo && info.logo && <img className="ws-logo" src={info.logo} alt="" style={{ height: '7mm' }} />}
      <span className="ws-compact-text" data-ueberthema={u.stil === 'path' && u.ueber ? u.ueber : undefined}>
        {kompaktVorTitel(info)}
        <RichText value={title} inline editable={Boolean(info.onTitle) && !info.isKey} onChange={info.onTitle} />
      </span>
      {/* Auf Folgeseiten genügt das Überthema selbst – rechts, ohne das Fach ein zweites Mal */}
      {u.block && (
        <span className="ws-compact-ueberthema" data-ueberthema={u.ueber}>
          {u.ueber}
        </span>
      )}
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
      {/* KI-Vermerk (Großprogramm 0.4): unter dem Fuß, außerhalb des Satzspiegels – ändert keinen Seitenumbruch */}
      {vermerkSichtbar(info.meta.ki, info.meta.kiVermerk, info.isKey) && (
        <div className="ws-ki-vermerk" style={{ left: `${insets.left}mm`, right: `${insets.right}mm`, bottom: `${PRINT_MARGINS.bleedSafeMm - 2}mm` }}>
          {kiVermerkText(info.meta.ki!, info.language === 'en' ? 'en' : 'de')}
        </div>
      )}
    </div>
  )
}
