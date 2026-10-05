/**
 * Quellenanhang „Quellen und Urheberrecht" (05.10.2026, Wunsch der Lehrkraft: „Beim Speichern/Ausdrucken eine
 * Option, Quellenangaben und Urheberrechtshinweise auf einer Seite im Anhang hinzuzufügen – wie auf eduki").
 *
 * Gliederung nach den Gepflogenheiten von eduki (Quellenverzeichnis als letzte Seite): Bilder (TULLU – Titel,
 * Urheber, Lizenz, Link, Ursprungsort; KI-Bilder als „KI-generiert"), Texte (Verfasser, Textsorte, Datum,
 * Fundstelle; ohne Angabe „Eigene Darstellung"), Hörtexte und Videos, Schriftart, KI-Hinweis (Kennzeichnung,
 * EU-KI-Verordnung ab 08/2026) und ein Nutzungshinweis für den eigenen Unterricht – ohne Personennamen.
 *
 * Reine Funktion: Druck/PDF (SheetPages) und Word (export/docx) zeigen dieselben Abschnitte.
 */
import { kiVermerkText } from '@shared/kiKennzeichnung'
import { plainText } from '../../../shared/richtext/parse'
import type { Sheet, Worksheet } from '../model/types'
import { imageCredits } from './SheetPages'

export interface AnhangAbschnitt {
  titel: string
  zeilen: { label: string; text: string }[]
}

const SYSTEM_SCHRIFTEN = /calibri|arial|segoe|times|cambria|verdana|tahoma|georgia|helvetica|system-ui|sans-serif|serif/i

/** Die Abschnitte des Anhangs für ein Blatt */
export function quellenAnhang(ws: Worksheet, sheet: Sheet, schulName: string, jetzt = new Date()): AnhangAbschnitt[] {
  const aus: AnhangAbschnitt[] = []
  // Bilder: vorhandene Nachweise (Zitierstil), KI-Bilder gekennzeichnet
  const bilder: AnhangAbschnitt['zeilen'] = []
  let n = 0
  for (const b of sheet.blocks) {
    if (b.type !== 'image') continue
    const items = b.items?.length ? b.items : [{ image: b.image, caption: b.caption }]
    for (const it of items) {
      if (!it.image) continue
      n++
      const label = `Bild ${n}${it.caption?.trim() ? ` – ${plainText(it.caption).trim()}` : ''}`
      if (it.image.source === 'ai') bilder.push({ label, text: 'KI-generiert (Bild-KI), von der Lehrkraft ausgewählt' })
    }
  }
  for (const c of imageCredits(sheet)) if (!bilder.some((x) => x.label === c.label)) bilder.push({ label: c.label, text: c.credit })
  if (bilder.length) aus.push({ titel: 'Bilder', zeilen: bilder })

  // Texte (Materialien)
  const texte: AnhangAbschnitt['zeilen'] = []
  let m = 0
  for (const b of sheet.blocks) {
    if (b.type !== 'text') continue
    m++
    const kopf = b.sourceHeader
    const teile = [kopf?.author, kopf?.textType, kopf?.date].map((x) => String(x ?? '').trim()).filter(Boolean)
    const fund = [kopf?.found, b.source].map((x) => plainText(String(x ?? '')).trim()).filter(Boolean)
    const titel = plainText(b.title ?? '').trim()
    texte.push({
      label: `M${m}${titel ? ` – ${titel}` : ''}`,
      text: [...teile, ...fund].length ? [teile.join(', '), fund.join('; ')].filter(Boolean).join(' – ') : 'Eigene Darstellung'
    })
  }
  if (texte.length) aus.push({ titel: 'Texte', zeilen: texte })

  // Hörtexte und Videos
  const medien: AnhangAbschnitt['zeilen'] = []
  for (const b of sheet.blocks) {
    if (b.type === 'audio') {
      const titel = plainText(b.title ?? '').trim() || 'Hörtext'
      medien.push({
        label: titel,
        text:
          b.origin === 'archiv' && b.url
            ? `Aufnahme: ${b.url}`
            : b.audio?.dataUrl || b.audio?.fileName
              ? 'Skript und Sprachausgabe KI-generiert (Sprach-KI)'
              : 'Skript zum Vorlesen'
      })
    }
    if (b.type === 'video') medien.push({ label: plainText(b.title ?? '').trim() || 'Video', text: [b.sourceTitle, b.url].filter(Boolean).join(' – ') })
  }
  if (medien.length) aus.push({ titel: 'Hörtexte und Videos', zeilen: medien })

  // Schriftart
  const schrift = String(ws.design?.page?.fontFamily ?? '')
    .split(',')[0]
    .replace(/["']/g, '')
    .trim()
  if (schrift)
    aus.push({
      titel: 'Schriftart',
      zeilen: [
        {
          label: schrift,
          text: SYSTEM_SCHRIFTEN.test(schrift) ? 'Systemschrift (Microsoft/Betriebssystem)' : 'frei verwendbare Schrift (SIL Open Font License)'
        }
      ]
    })

  // KI-Hinweis
  aus.push({
    titel: 'Künstliche Intelligenz',
    zeilen: [
      {
        label: 'Hinweis',
        text: ws.meta.ki ? kiVermerkText(ws.meta.ki) : 'Mit KI-Unterstützung erstellt (Schul-Apps) und von der Lehrkraft geprüft und bearbeitet.'
      }
    ]
  })

  // Nutzungshinweis – ohne Personennamen
  const jahr = jetzt.getFullYear()
  aus.push({
    titel: 'Nutzungshinweis',
    zeilen: [
      {
        label: `© ${jahr}${schulName.trim() ? ` ${schulName.trim()}` : ''}`,
        text: 'Dieses Material ist für den eigenen Unterricht bestimmt. Vervielfältigung und Weitergabe an die eigenen Lernenden im Rahmen des Unterrichts sind erlaubt. Nicht gestattet sind die Veröffentlichung im Internet (auch auf offenen Plattformen) und jede kommerzielle Nutzung. Fremdinhalte unterliegen den oben genannten Lizenzen.'
      }
    ]
  })
  return aus
}
