import forge from 'node-forge'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { signierePdf } from '../src/main/services/export/pdfSignatur'

/*
 * Digitale Signatur der Brief-PDFs (29.09.2026): Mit einem selbst erzeugten Testzertifikat wird
 * ein PDF signiert; geprüft wird, dass die Signatur den ganzen Inhalt abdeckt (ByteRange) und
 * kryptografisch zum Inhalt passt – und dass ein falsches Passwort verständlich abgelehnt wird.
 */
function testZertifikat(passwort: string): Uint8Array {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 86400000)
  cert.validity.notAfter = new Date(Date.now() + 86400000 * 365)
  const attrs = [{ name: 'commonName', value: 'Testlehrkraft' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passwort, { algorithm: '3des' })
  return Uint8Array.from(forge.asn1.toDer(p12).getBytes(), (c) => c.charCodeAt(0))
}

async function testPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage().drawText('Liebe Eltern, am Freitag, 12.12.2026 ...')
  return doc.save()
}

describe('PDF digital signieren', () => {
  const zert = testZertifikat('geheim')

  it('signiert über den ganzen Inhalt, die Signatur passt zum Inhalt', async () => {
    const signiert = Buffer.from(await signierePdf(await testPdf(), zert, 'geheim', { grund: 'Elternbrief', name: 'Testlehrkraft', ort: 'Bremerhaven' }))
    const text = signiert.toString('latin1')
    expect(text).toContain('/Type /Sig')
    expect(text).toContain('/SubFilter /adbe.pkcs7.detached')
    const br = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(text)!
    const [a, b, c, d] = br.slice(1).map(Number)
    expect(a).toBe(0)
    expect(c + d).toBe(signiert.length)
    // Signatur (hex zwischen den Bereichen) prüfen: PKCS#7 über die beiden Bereiche
    const hex = text.slice(a + b + 1, c - 1).replace(/0+$/, '')
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.hexToBytes(hex.length % 2 ? `${hex}0` : hex))) as forge.pkcs7.PkcsSignedData & {
      rawCapture: { authenticatedAttributes: forge.asn1.Asn1[]; signature: string }
    }
    const inhalt = Buffer.concat([signiert.subarray(a, a + b), signiert.subarray(c, c + d)])
    const digest = forge.md.sha256.create().update(inhalt.toString('latin1')).digest().getBytes()
    const attr = p7.rawCapture.authenticatedAttributes
    const md = attr.find((x) => forge.asn1.derToOid((x.value as forge.asn1.Asn1[])[0].value as string) === forge.pki.oids.messageDigest)!
    expect(((md.value as forge.asn1.Asn1[])[1].value as forge.asn1.Asn1[])[0].value).toBe(digest)
    expect(p7.certificates[0].subject.getField('CN').value).toBe('Testlehrkraft')
  }, 30000)

  it('lehnt ein falsches Passwort verständlich ab', async () => {
    await expect(signierePdf(await testPdf(), zert, 'falsch')).rejects.toThrow(/Passwort/)
  }, 30000)
})
