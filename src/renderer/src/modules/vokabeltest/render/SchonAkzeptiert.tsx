/**
 * Lösungsblatt (10.10.2026): „schon einmal als richtig akzeptiert: X, Y" neben der Lösung – Antworten, die die Lehrkraft in
 * einem Onlinetest zu diesem Wort akzeptiert hat (modules/onlinetest/akzeptiert.ts). Nur im Lösungsblatt (Editor, Druck,
 * PDF), nicht auf dem Schülerblatt und nicht in der Abgabe als Blatt; nur mit dem Schul-Apps-Server.
 */
import { alternativenFuerLoesung } from '../../onlinetest/akzeptiert'
import { useAkzeptierte } from '../../onlinetest/akzeptiertSpeicher'
import { showsAnswers, useRender } from './RenderContext'

export function SchonAkzeptiert({ loesung, auch }: { loesung: string; auch?: string[] }): React.JSX.Element | null {
  const { mode, language, abgabe } = useRender()
  const liste = useAkzeptierte(showsAnswers(mode) && !abgabe ? language : undefined)
  if (!showsAnswers(mode) || abgabe) return null
  const alternativen = alternativenFuerLoesung(liste, loesung, auch)
  if (!alternativen.length) return null
  return (
    <span className="vt-schon-akzeptiert" data-schon-akzeptiert style={{ fontSize: '0.75em', fontWeight: 'normal', fontStyle: 'italic', color: '#555' }}>
      {' '}
      (Schon einmal als richtig akzeptiert: {alternativen.join(', ')})
    </span>
  )
}
