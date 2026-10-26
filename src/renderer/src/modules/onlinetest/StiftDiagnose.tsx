/**
 * Stift-Diagnose für das Schülerblatt (26.10.2026, Befund der Lehrkraft: Apple Pencil schreibt im iPad-Browser nicht
 * und wählt keine Werkzeuge, der Finger auf derselben Seite schon). Aus dem Code allein ließ sich die Ursache nicht
 * finden – diese Tafel zeigt am Gerät, was beim Antippen und Schreiben wirklich ankommt: Zeiger- und Berührungs-
 * ereignisse mit Zeigerart, Ziel, `touch-action` und ob etwas sie unterdrückt hat. Nur sichtbar, wenn die Adresse
 * `?diagnose=stift` trägt; keine Daten verlassen das Gerät, „Kopieren“ legt den Text in die Zwischenablage.
 */
import { Button, Group, Paper, Text } from '@mantine/core'
import { useEffect, useState } from 'react'

export const stiftDiagnoseAktiv = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).get('diagnose') === 'stift'
  } catch {
    return false
  }
}

interface Eintrag {
  zeit: string
  text: string
}

const EREIGNISSE = ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'click', 'contextmenu', 'mousedown'] as const
const HOECHSTENS = 60

function zielText(t: EventTarget | null): string {
  if (!(t instanceof Element)) return String(t)
  const teile = [t.tagName.toLowerCase()]
  for (const a of Array.from(t.attributes)) if (a.name.startsWith('data-') || a.name === 'aria-label') teile.push(`${a.name}${a.value ? `=${a.value.slice(0, 20)}` : ''}`)
  if (t.className && typeof t.className === 'string') teile.push(`.${t.className.split(/\s+/).slice(0, 2).join('.')}`)
  try {
    teile.push(`ta:${getComputedStyle(t).touchAction}`)
  } catch {
    /* ohne Stil */
  }
  return teile.join(' ')
}

function beschreiben(e: Event, phase: 'c' | 'b'): string {
  const p = e as PointerEvent
  const teile = [e.type, phase === 'c' ? '↓' : '↑']
  if ('pointerType' in p) teile.push(`${p.pointerType}${p.isPrimary ? '' : ' nebenzeiger'} druck=${(p.pressure ?? 0).toFixed(2)} b=${p.button}`)
  if (e instanceof TouchEvent) teile.push(`touches=${e.touches.length} typ=${Array.from(e.changedTouches).map((t) => (t as Touch & { touchType?: string }).touchType ?? '?').join(',')}`)
  if (e.defaultPrevented) teile.push('UNTERDRÜCKT')
  teile.push(zielText(e.target))
  return teile.join(' ')
}

export function StiftDiagnose(): React.JSX.Element {
  const [liste, setListe] = useState<Eintrag[]>([])
  useEffect(() => {
    const kopf: Eintrag[] = [
      { zeit: '', text: `UA: ${navigator.userAgent}` },
      { zeit: '', text: `touch-modus=${document.documentElement.hasAttribute('data-touch')} maxTouchPoints=${navigator.maxTouchPoints} grob=${matchMedia('(pointer: coarse)').matches} hover=${matchMedia('(hover: hover)').matches}` }
    ]
    setListe(kopf)
    const merken = (e: Event, phase: 'c' | 'b'): void => {
      // Die eigene Tafel nicht protokollieren
      if (e.target instanceof Element && e.target.closest('[data-stift-diagnose]')) return
      const zeit = new Date().toISOString().slice(11, 23)
      setListe((l) => [...l, { zeit, text: beschreiben(e, phase) }].slice(-HOECHSTENS))
    }
    const c = (e: Event): void => merken(e, 'c')
    const b = (e: Event): void => merken(e, 'b')
    for (const art of EREIGNISSE) {
      window.addEventListener(art, c, { capture: true, passive: true })
      window.addEventListener(art, b, { passive: true })
    }
    return () => {
      for (const art of EREIGNISSE) {
        window.removeEventListener(art, c, { capture: true })
        window.removeEventListener(art, b)
      }
    }
  }, [])
  const text = liste.map((e) => `${e.zeit} ${e.text}`).join('\n')
  return (
    <Paper
      withBorder
      shadow="md"
      p="xs"
      data-stift-diagnose
      style={{ position: 'fixed', left: 8, bottom: 8, width: 'min(520px, calc(100vw - 16px))', maxHeight: '40vh', zIndex: 2000, overflow: 'auto', fontSize: 11 }}
    >
      <Group justify="space-between" mb={4}>
        <Text size="xs" fw={700}>
          Stift-Diagnose ({liste.length})
        </Text>
        <Group gap={4}>
          <Button size="compact-xs" variant="default" onClick={() => void navigator.clipboard?.writeText(text)}>
            Kopieren
          </Button>
          <Button size="compact-xs" variant="default" onClick={() => setListe([])}>
            Leeren
          </Button>
        </Group>
      </Group>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11, lineHeight: 1.25 }}>{text}</pre>
    </Paper>
  )
}
