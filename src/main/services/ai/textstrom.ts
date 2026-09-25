import { StringDecoder } from 'node:string_decoder'

/**
 * Text aus einem Datenstrom einsammeln, ohne Zeichen zu zerreißen.
 *
 * ANLASS (Lehrkraft, 24.09.2026): Auf einem Arbeitsblatt stand bei den nützlichen Wendungen
 * „Die wichtigste Einschränkung war ���" – drei Ersatzzeichen statt des Auslassungszeichens.
 *
 * URSACHE: Ein laufender Prozess liefert seine Ausgabe in Stücken, und die Stückgrenzen
 * liegen an beliebigen BYTES, nicht an Zeichen. Wurde jedes Stück für sich in Text
 * umgewandelt (`stdout += d`), zerfiel ein Zeichen, das über die Grenze reichte, in
 * Ersatzzeichen. Genau deshalb war „Einschränkung" heil und das „…" kaputt: Es hing vom
 * Zufall ab, wo die Grenze lag.
 *
 * `StringDecoder` hält angefangene Byte-Folgen zurück, bis sie vollständig sind. Das ist der
 * Unterschied zu `Buffer.toString()`, das jedes Stück für sich betrachtet.
 */
export function textSammler(): { push: (stueck: Buffer | string) => string; text: () => string; laenge: () => number } {
  const decoder = new StringDecoder('utf8')
  let text = ''
  return {
    /** Nimmt ein Stück auf und gibt zurück, was daraus schon an Text feststeht. */
    push(stueck) {
      const neu = typeof stueck === 'string' ? stueck : decoder.write(stueck)
      text += neu
      return neu
    },
    /** Der gesammelte Text, einschließlich eines etwaigen Restes am Ende. */
    text() {
      return text + decoder.end()
    },
    laenge() {
      return text.length
    }
  }
}
