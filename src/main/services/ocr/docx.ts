import mammoth from 'mammoth'

/** Wandelt eine Word-Datei in HTML um (Tabellen bleiben erhalten). */
export async function docxToHtml(data: Uint8Array): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(data) })
  return result.value
}
