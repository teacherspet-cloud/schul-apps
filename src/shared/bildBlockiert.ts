/**
 * Abgelehnte Bilder erkennen (12.10.2026, Befund am Server): Alle 18 „Die KI ist ausgelastet"-Fälle vom 10./11.10.
 * waren in Wahrheit Ablehnungen durch das Sicherheitssystem des Bildwerkzeugs („Die Bildgenerierung wurde vom
 * Sicherheitssystem blockiert."). Die Meldung enthielt „Kontingent" und wurde als Begrenzung gedeutet – der Auftrag
 * wartete dann im Halbstundentakt auf dasselbe abgelehnte Motiv, obwohl das Abo frei war.
 *
 * Eine Ablehnung ist KEINE Begrenzung: Warten hilft nicht, ein anderes Motiv (oder die Bildsuche) schon.
 */

/** Fester Anfang der Fehlermeldung, an dem alle Schichten die Ablehnung erkennen */
export const BILD_BLOCKIERT = 'Bild abgelehnt (Sicherheitssystem)'

/** Klingt die Antwort des Bildwerkzeugs nach einer inhaltlichen Ablehnung? */
export function klingtNachAblehnung(text: string): boolean {
  return /blockiert|sicherheits|abgelehnt|nicht zulässig|richtlinie|safety|content.?polic|moderation|blocked|refus|declined|not allowed|violat|cannot (?:create|generate)|can't (?:create|generate)|unable to (?:create|generate)/i.test(
    text
  )
}

/** Ist dieser Fehler eine Ablehnung (statt einer Begrenzung oder eines technischen Fehlers)? */
export const istBildBlockiert = (meldung: string): boolean => meldung.includes(BILD_BLOCKIERT)
