/**
 * Roter Punkt am Symbol „Startseite" (23.10.2026, Prüfung des Schulträgers, Meldeweg nach § 4 KKG – krise.ts): Zahl
 * der eigenen offenen vertraulichen Hinweise. Fragt nur die Zahl ab (GET /server/krisen/zahl), alle 2 Minuten, beim
 * Zurückkehren ins Fenster und nach „Gesehen" in der Karte (KrisenHinweise.tsx). Nur am Server, nur für Lehrkräfte.
 */
import { Indicator } from '@mantine/core'
import { useEffect, useState } from 'react'
import { holen } from '../modules/onlinetest/serverApi'
import { aufServer, serverIch } from '../shared/plattform'
import { KRISEN_EREIGNIS } from './krisenPush'

export default function KrisenPunkt({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [offen, setOffen] = useState(0)
  const aktiv = aufServer() && serverIch()?.rolle !== undefined && serverIch()?.rolle !== 'schueler'
  useEffect(() => {
    if (!aktiv) return
    let lebt = true
    const laden = (): void =>
      void holen<{ offen: number }>('/server/krisen/zahl').then(
        (r) => lebt && setOffen(Number(r.offen) || 0),
        () => undefined
      )
    laden()
    const uhr = setInterval(laden, 120_000)
    const sichtbar = (): void => {
      if (document.visibilityState === 'visible') laden()
    }
    window.addEventListener(KRISEN_EREIGNIS, laden)
    document.addEventListener('visibilitychange', sichtbar)
    return () => {
      lebt = false
      clearInterval(uhr)
      window.removeEventListener(KRISEN_EREIGNIS, laden)
      document.removeEventListener('visibilitychange', sichtbar)
    }
  }, [aktiv])
  return (
    <Indicator
      disabled={!offen}
      label={offen > 9 ? '9+' : String(offen)}
      size={16}
      offset={2}
      color="red"
      position="top-end"
      title="Neue vertrauliche Hinweise auf der Startseite"
      data-krisen-punkt={offen || undefined}
    >
      {children}
    </Indicator>
  )
}
