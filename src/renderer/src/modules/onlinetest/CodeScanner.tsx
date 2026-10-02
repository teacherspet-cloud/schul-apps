/**
 * QR-Code in der Web-App scannen (02.10.2026).
 *
 * Recherche: Auf iPad und iPhone öffnet ein QR-Code aus der Kamera-App IMMER Safari – nie die
 * Web-App vom Home-Bildschirm (kein Link-Fang auf iOS). Abgestimmt: Die Onlinetest-App hat
 * deshalb einen eigenen Scanner (Kamera in der Seite, jsQR – Safari kennt keinen eingebauten
 * QR-Leser). So bleibt man in der App mit ihrer Anmeldung.
 */
import { Alert, Button, Modal, Stack, Text } from '@mantine/core'
import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'

/** Aus dem Inhalt eines QR-Codes den Testcode lesen (Link auf /s/t/<CODE> oder der Code selbst) */
export function codeAus(inhalt: string): string | null {
  const t = inhalt.trim()
  const ausLink = /\/s\/t\/([A-Za-z0-9]{4,12})\/?(?:[?#].*)?$/.exec(t)?.[1]
  if (ausLink) return ausLink.toUpperCase()
  return /^[A-Za-z0-9]{4,12}$/.test(t) ? t.toUpperCase() : null
}

export function CodeScanner({ schliessen, gefunden }: { schliessen: () => void; gefunden: (code: string) => void }): React.JSX.Element {
  const video = useRef<HTMLVideoElement>(null)
  const [fehler, setFehler] = useState('')
  const [fremd, setFremd] = useState('')
  useEffect(() => {
    let strom: MediaStream | null = null
    let aus = false
    let rahmen = 0
    const leinwand = document.createElement('canvas')
    const g = leinwand.getContext('2d', { willReadFrequently: true })
    let zuletzt = 0
    const lesen = (): void => {
      if (aus) return
      rahmen = requestAnimationFrame(lesen)
      const v = video.current
      const jetzt = performance.now()
      if (!v || !g || v.readyState < 2 || jetzt - zuletzt < 150) return
      zuletzt = jetzt
      // Verkleinert lesen – schneller, und QR-Codes an der Tafel sind groß genug
      const s = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight))
      leinwand.width = Math.round(v.videoWidth * s)
      leinwand.height = Math.round(v.videoHeight * s)
      g.drawImage(v, 0, 0, leinwand.width, leinwand.height)
      const bild = g.getImageData(0, 0, leinwand.width, leinwand.height)
      const qr = jsQR(bild.data, bild.width, bild.height, { inversionAttempts: 'dontInvert' })
      if (!qr?.data) return
      const code = codeAus(qr.data)
      if (code) {
        aus = true
        gefunden(code)
      } else setFremd(qr.data.slice(0, 80))
    }
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (aus) return s.getTracks().forEach((t) => t.stop())
        strom = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play().catch(() => undefined)
        }
        lesen()
      })
      .catch(() => setFehler('Die Kamera ist nicht freigegeben. Bitte den Code von der Tafel eintippen – oder in den Einstellungen des Geräts die Kamera erlauben.'))
    if (!navigator.mediaDevices) setFehler('Dieses Gerät erlaubt hier keine Kamera. Bitte den Code eintippen.')
    return () => {
      aus = true
      cancelAnimationFrame(rahmen)
      strom?.getTracks().forEach((t) => t.stop())
    }
    // gefunden ist fest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <Modal opened onClose={schliessen} title="QR-Code scannen" centered size="lg" data-code-scanner>
      <Stack>
        {fehler ? (
          <Alert color="orange">{fehler}</Alert>
        ) : (
          <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }} />
        )}
        {fremd && (
          <Text size="sm" c="orange.8">
            Dieser QR-Code gehört nicht zu einem Onlinetest.
          </Text>
        )}
        <Text size="sm" c="dimmed">
          Halte die Kamera auf den QR-Code an der Tafel.
        </Text>
        <Button variant="subtle" onClick={schliessen}>
          Abbrechen
        </Button>
      </Stack>
    </Modal>
  )
}
