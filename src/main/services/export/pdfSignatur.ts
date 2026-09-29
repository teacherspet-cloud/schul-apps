/**
 * Digitale Signatur der Brief-PDFs (29.09.2026, Wunsch der Lehrkraft): PAdES-kompatible
 * Signatur (PKCS#7, adbe.pkcs7.detached) mit dem Zertifikat der Lehrkraft (.pfx/.p12).
 *
 * PDF-Programme zeigen danach, wer signiert hat und ob das Dokument seitdem verändert wurde.
 * Ob die Signatur als „vertrauenswürdig" gilt, hängt am Zertifikat: selbst erstellte gelten als
 * „Identität unbekannt", qualifizierte stammen von einem Vertrauensdiensteanbieter.
 * Das Passwort kommt bei jedem Signieren aus dem Dialog und wird nirgends gespeichert.
 */
import { readFileSync } from 'fs'
import { PDFDocument } from 'pdf-lib'
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib'
import { SignPdf } from '@signpdf/signpdf'
import { P12Signer } from '@signpdf/signer-p12'

export interface SignaturAngaben {
  /** Grund, erscheint in der Signatur („Elternbrief") */
  grund?: string
  /** Ort der Signatur */
  ort?: string
  /** Name der unterzeichnenden Person */
  name?: string
}

export async function signierePdf(pdf: Uint8Array, zertifikat: Uint8Array, passwort: string, angaben: SignaturAngaben = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf)
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: angaben.grund ?? 'Elternbrief',
    contactInfo: '',
    name: angaben.name ?? '',
    location: angaben.ort ?? '',
    // Platz für Zertifikatskette und Signatur (Standard 8192 reicht für längere Ketten nicht immer)
    signatureLength: 16384
  })
  const mitPlatz = Buffer.from(await doc.save({ useObjectStreams: false }))
  let signer: P12Signer
  try {
    signer = new P12Signer(Buffer.from(zertifikat), { passphrase: passwort })
  } catch (e) {
    throw new Error(`Das Zertifikat ließ sich nicht öffnen – ist das Passwort richtig? (${e instanceof Error ? e.message : String(e)})`)
  }
  try {
    return new Uint8Array(await new SignPdf().sign(mitPlatz, signer))
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    throw new Error(
      /password|mac|decrypt|pkcs12/i.test(text)
        ? 'Das Passwort des Zertifikats stimmt nicht – das PDF wurde nicht signiert.'
        : `Das PDF ließ sich nicht signieren: ${text}`
    )
  }
}

/** Zertifikat von der Platte lesen (Pfad aus den Einstellungen) */
export function leseZertifikat(pfad: string | undefined): Uint8Array {
  if (!pfad) throw new Error('Es ist kein Zertifikat gewählt (Einstellungen › Schule › Digitale Signatur).')
  try {
    return new Uint8Array(readFileSync(pfad))
  } catch {
    throw new Error(`Das Zertifikat „${pfad}" ist nicht mehr da – bitte in den Einstellungen neu wählen.`)
  }
}
