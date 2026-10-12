/**
 * Einstellungen › Material › Problemwörter (12.10.2026, Wunsch der Lehrkraft): Standard-Empfindlichkeit für alle eigenen
 * Kurse. Gespeichert am Server (dort werden die Problemwörter berechnet); je Kurs lässt sie sich im Pop-up
 * „Problemwörter" in „Meine Klassen" abweichend einstellen.
 */
import { Card, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { problemStufe, type ProblemStufe } from '@shared/problemWoerter'
import { holen, senden } from '../modules/onlinetest/serverApi'
import { ProblemRegler } from '../shared/components/ProblemRegler'
import { notifyError } from '../shared/util'

export default function ProblemWoerterCard(): React.JSX.Element {
  const [stufe, setStufe] = useState<ProblemStufe | null>(null)
  useEffect(() => {
    void holen<{ stufe: number }>('/server/vokabeln/problem-stufe').then(
      (d) => setStufe(problemStufe(d.stufe)),
      () => setStufe(problemStufe(null))
    )
  }, [])
  const setzen = (st: ProblemStufe): void => {
    const vorher = stufe
    setStufe(st)
    void senden<{ stufe: number }>('/server/vokabeln/problem-stufe', { stufe: st }).catch((e: unknown) => {
      setStufe(vorher)
      notifyError(e)
    })
  }
  return (
    <Card withBorder padding="lg" data-problemwoerter-einstellung>
      <Title order={4} mb={4}>
        Problemwörter
      </Title>
      <Text size="sm" c="dimmed" mb="sm">
        Ab wann ein Wort in den eigenen Vokabelkursen als Problemwort gilt (Meine Klassen, Kursseite, Startseite). Je Kurs lässt sich das im Fenster
        „Problemwörter“ abweichend einstellen.
      </Text>
      <ProblemRegler wert={stufe ?? 3} deaktiviert={stufe === null} onAendern={setzen} />
    </Card>
  )
}
