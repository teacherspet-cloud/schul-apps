/**
 * Krisenhinweise – reine Teile ohne Server (22.10.2026, KI-Sicherheitsprüfung; Verwaltung und Route: server/krise.ts).
 * Auch für Prompt-Bausteine in src/shared nutzbar.
 */
/** Text für das Kind – fest, nicht von der KI formuliert */
export const HILFETEXT =
  'Es klingt, als ginge es dir gerade nicht gut. Du bist damit nicht allein. Sprich mit einer Person, der du vertraust – ' +
  'zum Beispiel deiner Lehrkraft, der Vertrauenslehrkraft oder der Schulsozialarbeit. Kostenlos und anonym hilft auch die ' +
  'Nummer gegen Kummer: 116 111 (Mo–Sa 14–20 Uhr) oder online unter nummergegenkummer.de. In einem Notfall: 112.'

/** Regel für die Anweisungen aller KI-Wege, in denen Lernende frei schreiben oder sprechen */
export const KRISEN_REGEL =
  'Wenn der Text des Kindes auf Selbstverletzung, Suizidgedanken, Gewalt gegen das Kind oder akute Not hindeutet, setze ' +
  '"krise" auf true und schreibe in deine Rückmeldung nichts dazu – die Plattform zeigt dann einen festen Hilfetext. ' +
  'Sonst setze "krise" auf false.'

/** Schema-Feld für die Antwort-Schemata (JSON-Schema, strict) */
export const KRISEN_FELD = { krise: { type: 'boolean' } } as const

/** Krisenwörter – Faustregel, bewusst weit (eher ein Hinweis zu viel) */
const MUSTER: RegExp[] = [
  // Deutsch
  /\b(umbringen|suizid|selbstmord|ritzen|ritze mich|nicht mehr leben|will sterben|möchte sterben|mich töten|mir was antun|mir etwas antun|mir weh(?: zu)? tun|will nicht mehr da sein|wäre (?:am liebsten )?(?:einfach )?(?:für immer )?weg|sehe keinen sinn mehr|hat alles keinen sinn mehr)\b/i,
  // Englisch (verdeckte Formen aus dem Lauf mit echter KI, 22.10.2026)
  /\b(kill myself|suicide|suicidal|self[- ]harm|cut myself|cutting myself|want to die|end my life|hurt myself|(?:do not|don'?t|dont) want to be here|no reason to live|if i was gone|if i were gone)\b/i,
  // Französisch
  /\b(me suicider|suicide|me tuer|envie de mourir|me faire du mal|me scarifier)\b/i,
  // Spanisch
  /\b(suicidarme|suicidio|matarme|quiero morir|hacerme daño|cortarme)\b/i
]

export function kriseVerdacht(text: unknown): boolean {
  const t = String(text ?? '')
  if (!t.trim()) return false
  return MUSTER.some((m) => m.test(t))
}
