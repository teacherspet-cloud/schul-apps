/**
 * Abgelehnte Quellen dauerhaft speichern (01.10.2026).
 *
 * Eine Datei `quellen-ablehnungen.json` unter userData – für ALLE Programme gemeinsam. Die
 * Regeln (Normalisierung, Thema/global, Aufheben) stehen als reine Funktionen in
 * `@shared/quellenAblehnung`; hier wird nur gelesen und absturzsicher geschrieben.
 *
 * Warum im Hauptprozess und nicht im Browserspeicher der Oberfläche: Am Tablet läuft dieselbe
 * Suche über das Netz gegen diesen PC. Eine Ablehnung am Tablet muss auch am PC gelten – und
 * umgekehrt. Der Browserspeicher wäre je Gerät getrennt; genau so bliebe der gemeldete Fehler
 * („trotz Aussortierung wieder vorgeschlagen") auf dem jeweils anderen Gerät bestehen.
 */
import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ablehnen, aufheben, leereAblehnungen, pruefeAblehnungen, type AblehnungsDaten, type AblehnungsEingabe } from '@shared/quellenAblehnung'
import { writeAtomic } from './atomar'

/** Dateiname – steht auch in der Sicherung (wartung.ts, DATEIEN) */
export const ABLEHNUNGEN_DATEI = 'quellen-ablehnungen.json'

const datei = (): string => join(app.getPath('userData'), ABLEHNUNGEN_DATEI)

export function leseAblehnungen(): AblehnungsDaten {
  try {
    if (!existsSync(datei())) return leereAblehnungen()
    return pruefeAblehnungen(JSON.parse(readFileSync(datei(), 'utf8')))
  } catch {
    return leereAblehnungen()
  }
}

function schreibe(d: AblehnungsDaten): AblehnungsDaten {
  writeAtomic(datei(), JSON.stringify(d, null, 1))
  return d
}

/** Nimmt eine oder mehrere Ablehnungen auf (z. B. „Keine davon" für alle gezeigten Funde) */
export function quelleAblehnen(eingaben: (AblehnungsEingabe & { thema?: string })[] | (AblehnungsEingabe & { thema?: string })): AblehnungsDaten {
  const liste = Array.isArray(eingaben) ? eingaben : [eingaben]
  return schreibe(liste.reduce((d, e) => ablehnen(d, e), leseAblehnungen()))
}

export function ablehnungAufheben(auswahl: { url?: string; thema?: string }): AblehnungsDaten {
  return schreibe(aufheben(leseAblehnungen(), auswahl ?? {}))
}
