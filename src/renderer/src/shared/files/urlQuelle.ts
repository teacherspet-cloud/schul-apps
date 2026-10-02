/**
 * Eine Internetadresse als Material – Webseite oder YouTube-Video.
 *
 * Wunsch der Lehrkraft (26.09.2026): „Bei den Apps, wo man eigenes Material als Datei
 * hineinziehen kann: Ermögliche es, auch eine URL einzufügen (Video oder generell eine
 * Webseite), die dann von der KI für das jeweilige Material weiterverarbeitet wird."
 *
 * Das Ergebnis ist dieselbe Form wie bei einer gelesenen Datei (`ExtractedContent`), damit
 * Arbeitsblatt, Klassenarbeit und Lernzielkontrolle nichts Neues lernen müssen: Der Text
 * geht wie bisher als Material an die KI, nur mit Adresse dabei.
 *
 * Webseiten lädt der Hauptprozess über denselben Weg wie die Materialsuche
 * (`sources:laden` – Fließtext-Extraktion, PDF-Erkennung); Videos über `sources:video`
 * (Titel, Beschreibung, Transkript aus den Untertiteln).
 */
import { extractContent, type ExtractedContent, type ProgressFn } from './extractContent'

/**
 * Videoadresse mit eigenem Ladeweg (Untertitel mit Zeitmarken): YouTube und – seit 02.10.2026 –
 * ARD- und ZDF-Mediathek. Andere Videoseiten werden als Webseite gelesen.
 */
export function istVideoAdresse(adresse: string): boolean {
  try {
    const host = new URL(normalisiereAdresse(adresse)).hostname.toLowerCase().replace(/^www\.|^m\./, '')
    return (
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host === 'youtube-nocookie.com' ||
      host === 'ardmediathek.de' ||
      host.endsWith('.ardmediathek.de') ||
      host === 'zdf.de' ||
      host.endsWith('.zdf.de') ||
      host === 'zdfheute.de' ||
      host === 'arte.tv' ||
      host.endsWith('.arte.tv')
    )
  } catch {
    return false
  }
}

/** Woher der Inhalt eines Videos kommt – so steht es auch im Material für die KI */
function inhaltsKopf(v: { inhaltQuelle?: string; transkriptSprache: string; automatisch: boolean }): string {
  if (v.inhaltQuelle === 'ki')
    return 'Inhaltsprotokoll der KI, die das Video gesehen hat (Gemini) – Gesprochenes sinngemäß, Gezeigtes in [Klammern]; KEIN wörtliches Transkript, also nicht nach Wortlaut fragen'
  return `Transkript aus den Untertiteln mit Zeitmarken [m:ss]${v.transkriptSprache ? ` (${v.transkriptSprache}${v.automatisch ? ', automatisch erzeugte Untertitel – kann Fehler enthalten' : ''})` : ''}`
}

/** Ergänzt das fehlende „https://" – Adressen werden oft ohne Schema eingegeben. */
export function normalisiereAdresse(adresse: string): string {
  const a = adresse.trim()
  return /^https?:\/\//i.test(a) ? a : `https://${a}`
}

export function siehtAusWieAdresse(text: string): boolean {
  const a = text.trim()
  if (!a || /\s/.test(a)) return false
  try {
    const u = new URL(normalisiereAdresse(a))
    return /\.[a-z]{2,}$/i.test(u.hostname)
  } catch {
    return false
  }
}

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`

export async function ladeUrlAlsInhalt(adresse: string, onProgress: ProgressFn = () => {}): Promise<ExtractedContent> {
  const url = normalisiereAdresse(adresse)
  const leer = { format: 'plain' as const, pageImages: [], pageCount: 0, pagesRead: [], url }

  if (istVideoAdresse(url)) {
    onProgress('Video wird geladen – Untertitel werden gelesen …')
    const v = await window.api.sources.video(url)
    // Eine ZDF-Seite ohne Video ist eben eine Webseite – dann wie eine solche lesen
    const leerGeblieben = !v.titel && !v.transkript && !v.beschreibung
    if (leerGeblieben && v.anbieter && v.anbieter !== 'youtube') return ladeAlsWebseite(url, leer, onProgress)
    if (leerGeblieben) throw new Error(v.fehler ?? 'Das Video ließ sich nicht laden.')
    const teile = [
      `Video: ${v.titel || url}`,
      v.kanal ? `Herkunft: ${v.kanal}` : '',
      v.dauerSekunden ? `Laufzeit: ${mmss(v.dauerSekunden)}` : '',
      `Adresse: ${url}`,
      v.verfuegbarBis ? `In der Mediathek verfügbar bis: ${new Date(v.verfuegbarBis).toLocaleDateString('de-DE')}` : '',
      v.beschreibung ? `Beschreibung:\n${v.beschreibung}` : '',
      v.transkript ? `${inhaltsKopf(v)}:\n${v.transkript}` : `Kein Transkript verfügbar${v.fehler ? ` – ${v.fehler}` : ''}.`
    ]
    return { ...leer, fileName: v.titel || url, kind: 'video', text: teile.filter(Boolean).join('\n\n') }
  }
  return ladeAlsWebseite(url, leer, onProgress)
}

async function ladeAlsWebseite(
  url: string,
  leer: { format: 'plain'; pageImages: never[]; pageCount: number; pagesRead: never[]; url: string },
  onProgress: ProgressFn
): Promise<ExtractedContent> {

  onProgress('Webseite wird geladen …')
  const q = await window.api.sources.laden(url)
  if (q.fehler && !q.text && !q.pdf) throw new Error(q.fehler)
  if (q.pdf) {
    // PDF im Netz: die Bytes kommen vom Hauptprozess, den Text gewinnt derselbe Leser wie bei Dateien
    const datei = new File([new Uint8Array(q.pdf).slice().buffer], `${q.titel || 'Dokument'}.pdf`, { type: 'application/pdf' })
    const inhalt = await extractContent(datei, onProgress, { maxPages: 40 })
    return { ...inhalt, fileName: q.titel || inhalt.fileName, url }
  }
  if (!q.text.trim()) throw new Error('Auf der Seite wurde kein lesbarer Text gefunden.')
  let titel = q.titel
  try {
    titel ||= new URL(url).hostname
  } catch {
    titel ||= url
  }
  return { ...leer, fileName: titel, kind: 'web', text: `Webseite: ${titel}\nAdresse: ${url}\n\n${q.text}` }
}
