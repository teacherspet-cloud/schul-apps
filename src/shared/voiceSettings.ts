/**
 * Stimm-Einstellungen für ElevenLabs und die Aufteilung langer Dialoge.
 *
 * TEMPO ist die einzige Einstellung mit didaktischer Bedeutung: Das Sprechtempo eines
 * Hörtextes gehört zum Niveau. Die App hat die Zielwerte längst – `listeningRules(level)`
 * nennt je GER-Stufe eine Spanne in Wörtern je Minute (A1/A2 85–100, B1 100–120,
 * B2 120–140, C1 140–165, C2 165–190). Daraus wird hier der Regler berechnet, statt eine
 * zweite Tabelle zu erfinden.
 *
 * GEMESSEN am echten Konto (57 Wörter, mp3_44100_128, Dauer aus der Dateigröße bei
 * 16 000 Byte/s): Die Stimmen sprechen bei `speed: 1.0` rund 200–216 Wörter je Minute
 * (Bella 202, Roger 216, eigene Stimme 216). Das liegt ÜBER jedem dieser Zielwerte – auch
 * über C2. Ohne gesetztes Tempo war also bisher JEDER Hörtext zu schnell, unabhängig vom
 * Niveau. Die Dialog-Schnittstelle (eleven_v3) ist von sich aus ruhiger, gemessen rund
 * 160 Wörter je Minute, weil sie zwischen den Sprechern atmet.
 *
 * GRENZE der Schnittstelle: `speed` reicht nur von 0.7 bis 1.2. Unter etwa 140 Wörtern je
 * Minute kommt man damit nicht – die Zielwerte für A1 bis B1 sind so NICHT erreichbar.
 * Das wird nicht stillschweigend übergangen, sondern über `tempoFuerNiveau().zuSchnell`
 * gemeldet, damit die Oberfläche es sagen kann.
 */
import type { TtsSettings } from './types'

/** Voreinstellung von ElevenLabs (abgefragt über /v1/voices/settings/default). */
export const TTS_DEFAULTS: TtsSettings = { stability: 0.5, similarity: 0.75, style: 0, speed: 1, speakerBoost: true }

/**
 * Aussprache einzelner Wörter der Medienbank (12.10.2026, Wunsch der Lehrkraft: einsilbige Wörter waren oft nicht zu
 * erkennen). FAUSTREGELN, nicht gemessen: etwas langsamer (speed 0.9 – Einzelwörter sprechen die Stimmen bei 1.0 hastig
 * und verschluckt) und stabiler (stability 0.7 – weniger Ausdrucksschwankung, gleichmäßige Artikulation; ElevenLabs
 * beschreibt höhere Stabilität als „konsistenter, weniger emotional"). Sätze bleiben bei den Voreinstellungen.
 */
export const WORT_TTS_SETTINGS: TtsSettings = { ...TTS_DEFAULTS, stability: 0.7, speed: 0.9 }

/**
 * Unhörbarer Zusammenhang für Einzelwörter (12.10.2026): BELEGT ist, dass die ElevenLabs-Schnittstelle (auch
 * `…/with-timestamps`) `previous_text` und `next_text` annimmt und damit die Sprechmelodie an den Zusammenhang anpasst,
 * ohne ihn zu sprechen. FAUSTREGEL ist, dass ein Vorsprech-Rahmen („Listen and repeat the word.") das Wort deutlicher und
 * vollständig (mit fallender Satzmelodie) sprechen lässt. Sprachen ohne Eintrag: ohne Zusammenhang.
 */
export const WORT_KONTEXT: Record<string, { davor: string; danach: string }> = {
  en: { davor: 'Listen and repeat the word.', danach: 'Now you say it.' },
  fr: { davor: 'Écoute et répète le mot.', danach: 'À toi maintenant.' },
  es: { davor: 'Escucha y repite la palabra.', danach: 'Ahora tú.' },
  it: { davor: 'Ascolta e ripeti la parola.', danach: 'Ora tocca a te.' },
  de: { davor: 'Hör zu und sprich das Wort nach.', danach: 'Jetzt du.' },
  nl: { davor: 'Luister en herhaal het woord.', danach: 'Nu jij.' }
}

/** Sprechanweisung für OpenAI-Stimmen bei Einzelwörtern (12.10.2026, Vorgabe der Lehrkraft) */
export const WORT_ANWEISUNG_OPENAI =
  'Sprich das einzelne Wort langsam, deutlich und vollständig, mit klarer Betonung, wie ein Lehrer beim Vorsprechen. Sprich nur das Wort, nichts sonst.'

/**
 * Satzpunkt am Wortende (12.10.2026, FAUSTREGEL): Mit Punkt spricht die Stimme das Wort als abgeschlossene Äußerung mit
 * fallender Melodie zu Ende, statt es wie einen abgebrochenen Satzanfang auszusprechen. Nur für den Auftrag an die
 * Sprach-KI – der gespeicherte Sprechtext bleibt unverändert (sonst gälten alle Aufnahmen als veraltet).
 */
export const mitSatzpunkt = (text: string): string => {
  const t = String(text ?? '').trim()
  return !t || /[.!?…。？！]["'”’)]*$/.test(t) ? t : `${t}.`
}

/** Grenzen der Regler. `speed` ist von ElevenLabs vorgegeben, der Rest ist 0…1. */
export const SPEED_RANGE = { min: 0.7, max: 1.2, step: 0.01 }

/** Gemessene Sprechrate bei speed 1.0 – einzelne Stimme über eleven_multilingual_v2. */
export const NATURAL_WPM_SOLO = 205
/** Gemessene Sprechrate bei speed 1.0 – Dialog über eleven_v3 (mit Sprecherwechseln). */
export const NATURAL_WPM_DIALOG = 160

const clamp = (wert: number, min: number, max: number): number => Math.min(max, Math.max(min, wert))

/** Auf zwei Nachkommastellen, damit der Regler keine Zahlenschwänze zeigt. */
const rund = (wert: number): number => Math.round(wert * 100) / 100

/** Einstellungen in die gültigen Bereiche zwingen – eine geladene Datei kann alles enthalten. */
export function clampTtsSettings(s: Partial<TtsSettings> | undefined): TtsSettings {
  return {
    stability: clamp(s?.stability ?? TTS_DEFAULTS.stability, 0, 1),
    similarity: clamp(s?.similarity ?? TTS_DEFAULTS.similarity, 0, 1),
    style: clamp(s?.style ?? TTS_DEFAULTS.style, 0, 1),
    speed: rund(clamp(s?.speed ?? TTS_DEFAULTS.speed, SPEED_RANGE.min, SPEED_RANGE.max)),
    speakerBoost: s?.speakerBoost ?? TTS_DEFAULTS.speakerBoost
  }
}

/** Wörter je Minute, die bei diesem Reglerwert herauskommen. */
export const wpmBeiTempo = (speed: number, natur: number): number => Math.round(speed * natur)

export interface Tempo {
  /** Reglerwert für ElevenLabs */
  speed: number
  /** Mitte der Zielspanne des Niveaus */
  zielWpm: number
  /** Was damit tatsächlich herauskommt */
  erreichtWpm: number
  /** true = auch beim langsamsten Wert noch schneller als das Niveau vorsieht */
  zuSchnell: boolean
}

/**
 * Tempo aus der Wörter-je-Minute-Spanne des Niveaus.
 *
 * Gezielt wird auf die Mitte der Spanne: Der untere Rand gehört zu den langsamsten
 * Sprechern, der obere zu den schnellsten; die Mitte ist der Wert, den ein Hörtext dieses
 * Niveaus im Mittel haben soll.
 */
export function tempoFuerNiveau(wpm: [number, number], dialog = false): Tempo {
  const natur = dialog ? NATURAL_WPM_DIALOG : NATURAL_WPM_SOLO
  const zielWpm = Math.round((wpm[0] + wpm[1]) / 2)
  const speed = rund(clamp(zielWpm / natur, SPEED_RANGE.min, SPEED_RANGE.max))
  const erreichtWpm = wpmBeiTempo(speed, natur)
  // Ein bisschen Luft: 5 Wörter je Minute hört niemand heraus
  return { speed, zielWpm, erreichtWpm, zuSchnell: erreichtWpm > wpm[1] + 5 }
}

/**
 * Einstellungen für einen Hörtext: Tempo aus dem Niveau, der Rest wie von ElevenLabs
 * vorgesehen. Eine eigene Wahl der Lehrkraft hat immer Vorrang.
 */
export function settingsFuerNiveau(wpm: [number, number], dialog: boolean, eigene?: Partial<TtsSettings>): TtsSettings {
  if (eigene) return clampTtsSettings(eigene)
  return clampTtsSettings({ ...TTS_DEFAULTS, speed: tempoFuerNiveau(wpm, dialog).speed })
}

/**
 * Audio-Tags wie `[laughs]` oder `[excited]` aus einem Text entfernen.
 *
 * Nur eleven_v3 versteht sie. Das ältere eleven_multilingual_v2 würde sie VORLESEN – aus
 * „[laughs] Really?" würde hörbar „laughs Really?". Deshalb geht auf dem alten Weg nie ein
 * Tag mit hinaus. Im Transkript bleiben sie auf Wunsch stehen; dort sind sie ein Hinweis
 * für die Lehrkraft, wie die Stelle klingt.
 */
export function ohneTags(text: string): string {
  return text
    .replace(/\[[^\]\n]{1,40}\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Höchstlänge eines Dialog-Auftrags laut ElevenLabs („at or below 2,000 characters"). */
export const DIALOG_MAX_ZEICHEN = 2000

export interface Sprecherzeile {
  voiceId: string
  text: string
}

/**
 * Langen Dialog in Blöcke aufteilen.
 *
 * Die Dialog-Schnittstelle nimmt rund 2000 Zeichen je Auftrag. Anders als beim einzelnen
 * Sprecher lassen sich die Blöcke NICHT über `previous_request_ids` verbinden – eleven_v3
 * lehnt diese Felder ausdrücklich ab („previous_request_ids and next_request_ids are not
 * supported by the 'eleven_v3' model"). Jede Blockgrenze ist also eine hörbare Naht.
 * Deshalb werden die Blöcke so groß wie erlaubt gemacht: möglichst wenige Nähte.
 *
 * Eine einzelne Zeile, die allein schon zu lang ist, bekommt einen eigenen Block – sie zu
 * zerschneiden würde mitten im Satz trennen.
 */
export function dialogBloecke(zeilen: Sprecherzeile[], max = DIALOG_MAX_ZEICHEN): Sprecherzeile[][] {
  const bloecke: Sprecherzeile[][] = []
  let aktuell: Sprecherzeile[] = []
  let laenge = 0
  for (const z of zeilen) {
    const n = z.text.length
    if (aktuell.length && laenge + n > max) {
      bloecke.push(aktuell)
      aktuell = []
      laenge = 0
    }
    aktuell.push(z)
    laenge += n
  }
  if (aktuell.length) bloecke.push(aktuell)
  return bloecke
}

/**
 * Text eines einzelnen Sprechers in Stücke schneiden, die die Schnittstelle annimmt.
 *
 * Getrennt wird an Satzenden, nie mitten im Satz. Die Stücke werden anschließend über
 * `previous_text`/`next_text` und `previous_request_ids` verbunden – das unterstützt
 * eleven_multilingual_v2, und damit bleibt die Sprechmelodie über die Naht hinweg erhalten.
 */
export function textStuecke(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  const saetze = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text]
  const out: string[] = []
  let aktuell = ''
  for (const satz of saetze) {
    if (aktuell && aktuell.length + satz.length > max) {
      out.push(aktuell.trim())
      aktuell = ''
    }
    aktuell += satz
  }
  if (aktuell.trim()) out.push(aktuell.trim())
  return out
}
