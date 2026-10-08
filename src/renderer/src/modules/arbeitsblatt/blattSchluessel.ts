/**
 * Lösungsschlüssel einer Aufgabe für die automatische Prüfung beim Einreichen (08.10.2026, shared/blattPruefung.ts).
 *
 * Aus den Antwortformen mit festen Lösungen – Ankreuzen, Richtig/Falsch, Lückentext, Zuordnen, Ordnen –, je
 * Teilaufgabe (Index wie a, b, c …; -1 = Aufgabe ohne Teilaufgaben). Schreib-, Tabellen- und Zeichenaufgaben fehlen
 * hier: Sie bewertet die KI. Der Schlüssel geht wie die Erwartung nur an den Server.
 */
import { plainText } from '../../shared/richtext/parse'
import type { AufgabenSchluessel, SchluesselTeil } from '@shared/blattPruefung'
import { lueckenLoesungen } from '@shared/blattPruefung'
import type { Answer, TaskBlock } from './model/types'

function teilVon(a: Answer, teil: number): SchluesselTeil | null {
  switch (a.kind) {
    case 'multipleChoice': {
      const optionen = (a.options ?? []).map((o) => plainText(o).trim())
      const richtig = (a.correct ?? []).filter((i) => i >= 0 && i < optionen.length)
      return optionen.length > 1 && richtig.length ? { teil, art: 'mc', optionen, richtig } : null
    }
    case 'trueFalse':
      return a.statements?.length ? { teil, art: 'rf', aussagen: a.statements.map((s) => plainText(s.text).trim()), werte: a.statements.map((s) => s.isTrue) } : null
    case 'gapText': {
      const loesungen = lueckenLoesungen(a.gapText ?? '')
      return loesungen.length ? { teil, art: 'luecke', loesungen } : null
    }
    case 'matching':
      // Nur vollständige Zuordnungen – eine fehlende Lösung ließe sich nicht prüfen
      return a.left?.length && a.pairs?.length >= a.left.length && a.pairs.slice(0, a.left.length).every((p) => p >= 0 && p < a.right.length)
        ? { teil, art: 'zuordnen', paare: a.pairs.slice(0, a.left.length) }
        : null
    case 'ordering': {
      if (!a.items?.length) return null
      const anzeige = a.displayOrder?.length === a.items.length ? a.displayOrder : a.items.map((_, i) => i)
      return { teil, art: 'ordnen', nummern: anzeige.map((k) => k + 1) }
    }
    default:
      return null
  }
}

export function aufgabenSchluessel(b: TaskBlock): AufgabenSchluessel | undefined {
  const teile = (b.parts.length ? b.parts.map((p, i) => teilVon(p.answer, i)) : [teilVon(b.answer, -1)]).filter((t): t is SchluesselTeil => Boolean(t))
  return teile.length ? { teile } : undefined
}
