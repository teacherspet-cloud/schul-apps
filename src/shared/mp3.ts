/**
 * MP3 ohne ffmpeg lesen, messen, schneiden und zusammensetzen (01.10.2026).
 *
 * Anlass: Die Zeitangaben auf dem Blatt sollen zur ECHTEN Aufnahme passen (Spieldauer,
 * Zeitmarken je Sprecherzeile), und bei kleinen Skriptänderungen sollen nur die geänderten
 * Stellen neu vertont und in die vorhandene Datei eingesetzt werden. Beides braucht keinen
 * Decoder: Eine MP3 besteht aus Rahmen (Frames) mit festem Kopf; Länge und Dauer jedes Rahmens
 * stehen im Kopf. Geschnitten wird nur an Rahmengrenzen (bei 44,1 kHz alle 26 ms).
 *
 * Eine Falle beim Schneiden ist das „Bit-Reservoir" von Layer III: Ein Rahmen darf Nutzdaten im
 * VORIGEN Rahmen ablegen (`main_data_begin`). Beginnt ein Stück mitten im Strom, fehlen diese
 * Daten – das gäbe ein kurzes Knacken. Deshalb werden solche Anfangsrahmen durch stille Rahmen
 * gleicher Länge ersetzt. Geschnitten wird ohnehin in der Pause zwischen zwei Sprecherzeilen,
 * dort ist Stille genau das Richtige.
 *
 * Reine Funktionen auf Uint8Array – laufen im Hauptprozess, in den Tests und im Renderer.
 */

export interface Mp3Rahmen {
  /** Byte-Position im Puffer */
  start: number
  laenge: number
  /** Dauer in Sekunden */
  sekunden: number
  /** Bit-Reservoir: >0 heißt, der Rahmen braucht Daten aus dem vorigen */
  reservoir: number
  /** Kopfrahmen (Xing/Info/VBRI) ohne Ton – zählt nicht zur Dauer */
  kopf: boolean
}

const BITRATEN_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const BITRATEN_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const ABTASTRATEN = [44100, 48000, 32000]

/** Kopf eines Layer-III-Rahmens an Position `i` lesen; null = kein gültiger Rahmen. */
function kopfBei(b: Uint8Array, i: number): Omit<Mp3Rahmen, 'kopf'> & { seiteninfo: number } | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null
  const version = (b[i + 1] >> 3) & 3 // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (b[i + 1] >> 1) & 3 // 1 = Layer III
  if (version === 1 || layer !== 1) return null
  const ohneCrc = b[i + 1] & 1
  const bi = (b[i + 2] >> 4) & 15
  const si = (b[i + 2] >> 2) & 3
  if (bi === 0 || bi === 15 || si === 3) return null
  const padding = (b[i + 2] >> 1) & 1
  const mono = ((b[i + 3] >> 6) & 3) === 3
  const v1 = version === 3
  const rate = ABTASTRATEN[si] / (v1 ? 1 : version === 2 ? 2 : 4)
  const kbit = (v1 ? BITRATEN_V1 : BITRATEN_V2)[bi]
  const samples = v1 ? 1152 : 576
  const laenge = Math.floor(((v1 ? 144 : 72) * kbit * 1000) / rate) + padding
  if (laenge < 8) return null
  const s = i + 4 + (ohneCrc ? 0 : 2)
  const reservoir = s + 1 < b.length ? (v1 ? (b[s] << 1) | (b[s + 1] >> 7) : b[s]) : 0
  const seiteninfo = v1 ? (mono ? 17 : 32) : mono ? 9 : 17
  return { start: i, laenge, sekunden: samples / rate, reservoir, seiteninfo: s - i + seiteninfo }
}

/** Länge eines ID3v2-Kopfes am Dateianfang (0 = keiner). */
function id3Laenge(b: Uint8Array, i = 0): number {
  if (i + 10 > b.length || b[i] !== 0x49 || b[i + 1] !== 0x44 || b[i + 2] !== 0x33) return 0
  const groesse = ((b[i + 6] & 0x7f) << 21) | ((b[i + 7] & 0x7f) << 14) | ((b[i + 8] & 0x7f) << 7) | (b[i + 9] & 0x7f)
  return 10 + groesse + (b[i + 5] & 0x10 ? 10 : 0)
}

const text = (b: Uint8Array, i: number, n: number): string => String.fromCharCode(...b.subarray(i, i + n))

/**
 * Alle Rahmen eines Puffers. ID3-Köpfe, ein ID3v1-Schluss und Müll zwischen den Rahmen werden
 * übersprungen; ein Rahmen zählt erst, wenn direkt dahinter wieder einer steht oder die Datei
 * endet (sonst wäre jedes zufällige 0xFF ein „Rahmen").
 */
export function mp3Rahmen(b: Uint8Array): Mp3Rahmen[] {
  const out: Mp3Rahmen[] = []
  let i = 0
  while (i < b.length) {
    const id3 = id3Laenge(b, i)
    if (id3) {
      i += id3
      continue
    }
    if (b.length - i === 128 && text(b, i, 3) === 'TAG') break
    const k = kopfBei(b, i)
    const folgt = k && (i + k.laenge >= b.length || kopfBei(b, i + k.laenge) || id3Laenge(b, i + k.laenge) || text(b, i + k.laenge, 3) === 'TAG')
    if (!k || !folgt) {
      i++
      continue
    }
    const kennung = text(b, i + k.seiteninfo, 4)
    const kopf = kennung === 'Xing' || kennung === 'Info' || text(b, i + 36, 4) === 'VBRI'
    out.push({ start: k.start, laenge: k.laenge, sekunden: k.sekunden, reservoir: k.reservoir, kopf })
    i += k.laenge
  }
  return out
}

/** Spieldauer in Sekunden (ohne Kopfrahmen). */
export function mp3Sekunden(b: Uint8Array): number {
  return mp3Rahmen(b).reduce((n, r) => n + (r.kopf ? 0 : r.sekunden), 0)
}

/** Ein stiller Rahmen derselben Bauart und Länge wie `vorbild` (Seiteninfo und Daten auf null). */
export function stillerRahmen(b: Uint8Array, vorbild: Mp3Rahmen): Uint8Array {
  const r = new Uint8Array(vorbild.laenge)
  r.set(b.subarray(vorbild.start, vorbild.start + 4))
  // Ohne Prüfsumme – sonst stimmte die CRC über die genullte Seiteninfo nicht
  r[1] |= 1
  return r
}

/** Höchstens so viele Anfangsrahmen werden still gesetzt (bei 44,1 kHz rund 0,2 s) */
const MAX_STILLE_RAHMEN = 8

/**
 * Die Rahmen `[von, bis)` als eigenständiges Stück: Kopfrahmen fallen weg, Anfangsrahmen, die
 * Daten aus dem abgeschnittenen Vorgänger bräuchten, werden zu Stille.
 */
export function mp3Stueck(b: Uint8Array, rahmen: Mp3Rahmen[], von: number, bis: number): Uint8Array {
  const teile: Uint8Array[] = []
  let anfang = true
  let still = 0
  for (const r of rahmen.slice(von, bis)) {
    if (r.kopf) continue
    if (anfang && r.reservoir > 0 && still < MAX_STILLE_RAHMEN) {
      teile.push(stillerRahmen(b, r))
      still++
      continue
    }
    anfang = false
    teile.push(b.subarray(r.start, r.start + r.laenge))
  }
  return verbinde(teile)
}

/** Nur die Tonrahmen – ohne ID3, Xing/Info und Müll. So stimmt auch die Dauer im Abspieler. */
export function mp3Bereinigt(b: Uint8Array): Uint8Array {
  const r = mp3Rahmen(b)
  return mp3Stueck(b, r, 0, r.length)
}

/**
 * An den Zeitpunkten `schnitte` (Sekunden, aufsteigend) in Stücke teilen – jeweils an der
 * nächstgelegenen Rahmengrenze. Liefert `schnitte.length + 1` Stücke.
 */
export function mp3Schneiden(b: Uint8Array, schnitte: number[]): Uint8Array[] {
  const rahmen = mp3Rahmen(b)
  // Beginn jedes Rahmens in Sekunden; der letzte Eintrag ist das Ende der Datei
  const beginn: number[] = [0]
  for (const r of rahmen) beginn.push(beginn[beginn.length - 1] + (r.kopf ? 0 : r.sekunden))
  const grenzen: number[] = [0]
  for (const s of schnitte) {
    let i = grenzen[grenzen.length - 1]
    // Die Rahmengrenze, die dem Schnitt am nächsten liegt – nie vor der vorigen Grenze
    while (i < rahmen.length && Math.abs(beginn[i + 1] - s) <= Math.abs(beginn[i] - s)) i++
    grenzen.push(i)
  }
  grenzen.push(rahmen.length)
  return grenzen.slice(0, -1).map((von, i) => mp3Stueck(b, rahmen, von, grenzen[i + 1]))
}

export function verbinde(teile: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(teile.reduce((n, t) => n + t.length, 0))
  let o = 0
  for (const t of teile) {
    out.set(t, o)
    o += t.length
  }
  return out
}

/**
 * Stille als MP3 (MPEG1 Layer III, 128 kbit/s, 44,1 kHz, mono) – für die Attrappe der
 * Oberflächentests und die Unit-Tests. `fuellung` setzt ein Byte in die Nutzdaten, damit sich
 * Stücke unterscheiden lassen (hörbar bleibt es trotzdem still: Die Seiteninfo ist null).
 */
export function stilleMp3(sekunden: number, fuellung = 0): Uint8Array {
  const rahmenDauer = 1152 / 44100
  const zahl = Math.max(1, Math.round(sekunden / rahmenDauer))
  const laenge = 417
  const out = new Uint8Array(zahl * laenge)
  for (let i = 0; i < zahl; i++) {
    const o = i * laenge
    out[o] = 0xff
    out[o + 1] = 0xfb
    out[o + 2] = 0x90
    out[o + 3] = 0xc4
    if (fuellung) out[o + laenge - 1] = fuellung & 0xff
  }
  return out
}
