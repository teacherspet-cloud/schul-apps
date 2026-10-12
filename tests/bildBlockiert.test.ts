import { describe, expect, it } from 'vitest'
import { BILD_BLOCKIERT, istBildBlockiert, klingtNachAblehnung } from '../src/shared/bildBlockiert'
import { istBegrenzung, wartezeit } from '../src/renderer/src/shared/medien/medienWarten'
import { fehlerText } from '../src/main/services/ai/cli'

/*
 * Befund am Server (12.10.2026): Alle „ausgelastet"-Meldungen beim Bilderzeugen waren Ablehnungen des Sicherheitssystems.
 * Sie dürfen nicht als Begrenzung gelten (sonst wartet der Auftrag halbstündlich auf dasselbe abgelehnte Motiv).
 */
describe('abgelehnte Bilder', () => {
  it('erkennt die Antworten des Bildwerkzeugs vom Server', () => {
    for (const t of [
      'Die Bildgenerierung wurde vom Sicherheitssystem blockiert.',
      'Die Bildgenerierung wurde blockiert; es wurde kein Bild erstellt.',
      'Das Bild konnte nicht erstellt werden: Das Bildgenerierungswerkzeug hat die Anfrage blockiert.',
      "I can't generate that image because it violates the content policy."
    ])
      expect(klingtNachAblehnung(t)).toBe(true)
    expect(klingtNachAblehnung('fertig')).toBe(false)
  })
  it('ist keine Begrenzung und löst kein Warten aus', () => {
    const m = `${BILD_BLOCKIERT}: „Die Bildgenerierung wurde vom Sicherheitssystem blockiert."`
    expect(istBildBlockiert(m)).toBe(true)
    expect(istBegrenzung(m)).toBe(false)
    expect(wartezeit(new Error(m), 0)).toBeNull()
  })
  it('Zahlen wie 14290 in Token-Zählern sind keine 429', () => {
    expect(istBegrenzung('Codex meldet einen Fehler: input_tokens 14290')).toBe(false)
    expect(istBegrenzung('HTTP 429 Too Many Requests')).toBe(true)
  })
  it('Codex-Fehlertext nimmt aus dem JSON-Strom nur Fehlerereignisse', () => {
    const stdout = ['{"type":"turn.completed","usage":{"input_tokens":14290}}', '{"type":"error","message":"boom"}'].join('\n')
    const t = fehlerText({ stdout, stderr: '' })
    expect(t).toContain('boom')
    expect(t).not.toContain('14290')
  })
})
