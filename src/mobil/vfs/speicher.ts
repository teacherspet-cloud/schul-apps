/**
 * Das Dateisystem der iPad-App – im Speicher, mit dauerhafter Ablage im Hintergrund.
 *
 * Der Hauptprozess-Code (src/main/services) liest und schreibt SYNCHRON über `fs`. Im WKWebView
 * gibt es kein `fs`, und die Dateien des Geräts erreicht man nur asynchron über
 * @capacitor/filesystem. Deshalb:
 *
 *  - Beim Start wird alles Nötige in eine Map (Pfad → Bytes) geladen (vfs/mounts.ts).
 *  - `fs`-Aufrufe arbeiten auf dieser Map, mit den Fehlern und Eigenheiten von Node
 *    (ENOENT, EEXIST, ENOTDIR …) – der Code darüber merkt keinen Unterschied (shims/fs.ts).
 *  - Jede Änderung merkt sich eine Schreibwarteschlange; 300 ms nach der letzten Änderung eines
 *    Pfads geht sie an den Träger (Capacitor). Beim Wechsel in den Hintergrund wird sofort alles
 *    geschrieben (`sichereAlles`).
 *
 * Die Klasse kennt Capacitor nicht: Der Träger wird hineingereicht. So laufen die Prüfungen
 * (tests/mobilVfs.test.ts) unter Node gegen dieselbe Logik.
 */

/** Dauerhafte Ablage hinter einem Einhängepunkt (Pfade relativ zum Einhängepunkt, mit „/") */
export interface Traeger {
  schreiben(pfad: string, daten: Uint8Array): Promise<void>
  loeschen(pfad: string): Promise<void>
  ordnerLoeschen(pfad: string): Promise<void>
}

export interface Einhaengepunkt {
  /** z. B. „/userData" */
  wurzel: string
  /** Ohne Träger ist der Inhalt flüchtig (/tmp) */
  traeger?: Traeger
  /** Nur lesen (/resources) */
  nurLesen?: boolean
  /** Lädt eine bekannte, noch nicht geladene Datei nach (vfs.sicherstellen) */
  laden?: (pfad: string) => Promise<Uint8Array>
}

interface Datei {
  /** null = bekannt (Verzeichnis der Ressourcen), aber noch nicht geladen */
  daten: Uint8Array | null
  groesse: number
  mtime: number
}

export interface Werte {
  groesse: number
  mtime: number
  ordner: boolean
}

export class VfsFehler extends Error {
  code: string
  errno: number
  syscall: string
  path: string
  constructor(code: string, syscall: string, pfad: string, text?: string) {
    const texte: Record<string, string> = {
      ENOENT: 'no such file or directory',
      EEXIST: 'file already exists',
      ENOTDIR: 'not a directory',
      EISDIR: 'illegal operation on a directory',
      ENOTEMPTY: 'directory not empty',
      EROFS: 'read-only file system',
      EIO: 'i/o error'
    }
    super(`${code}: ${text ?? texte[code] ?? 'error'}, ${syscall} '${pfad}'`)
    this.code = code
    this.errno = -1
    this.syscall = syscall
    this.path = pfad
  }
}

/** Pfad vereinheitlichen: „/", keine Laufwerksbuchstaben, kein „.", „..", doppelte oder abschließende „/" */
export function normiere(pfad: string | URL): string {
  let p = pfad instanceof URL ? decodeURIComponent(pfad.pathname) : String(pfad)
  p = p.replace(/\\/g, '/').replace(/^[a-zA-Z]:(?=\/)/, '')
  const teile: string[] = []
  for (const t of p.split('/')) {
    if (!t || t === '.') continue
    if (t === '..') teile.pop()
    else teile.push(t)
  }
  return '/' + teile.join('/')
}

const elternVon = (p: string): string => (p === '/' ? '/' : p.slice(0, p.lastIndexOf('/')) || '/')
const liegtUnter = (p: string, ordner: string): boolean => ordner === '/' || p === ordner || p.startsWith(ordner + '/')

export class Vfs {
  private dateien = new Map<string, Datei>()
  private ordner = new Set<string>(['/'])
  private punkte: Einhaengepunkt[] = []
  /** Pfad → Zeitpunkt, ab dem er geschrieben wird */
  private faellig = new Map<string, number>()
  private ordnerWeg: string[] = []
  private zeitgeber: ReturnType<typeof setTimeout> | null = null
  private kette: Promise<void> = Promise.resolve()
  /** Fehler beim dauerhaften Schreiben – für das Protokoll (mobil/start.ts) */
  onSchreibfehler: (pfad: string, fehler: unknown) => void = () => undefined

  constructor(public verzoegerungMs = 300) {}

  /** Alles vergessen (Prüfungen) */
  zuruecksetzen(): void {
    this.dateien.clear()
    this.ordner = new Set(['/'])
    this.punkte = []
    this.faellig.clear()
    this.ordnerWeg = []
    if (this.zeitgeber) clearTimeout(this.zeitgeber)
    this.zeitgeber = null
  }

  einhaengen(punkt: Einhaengepunkt): void {
    const wurzel = normiere(punkt.wurzel)
    this.punkte = [...this.punkte.filter((p) => p.wurzel !== wurzel), { ...punkt, wurzel }].sort((a, b) => b.wurzel.length - a.wurzel.length)
    // Die Wurzel und ihre Eltern gibt es immer
    for (let p = wurzel; ; p = elternVon(p)) {
      this.ordner.add(p)
      if (p === '/') break
    }
  }

  private punktVon(p: string): Einhaengepunkt | undefined {
    return this.punkte.find((m) => liegtUnter(p, m.wurzel))
  }

  private relativ(p: string, punkt: Einhaengepunkt): string {
    return p.slice(punkt.wurzel.length + 1)
  }

  // ---------- Laden (ohne Schreibwarteschlange) ----------

  /** Eine geladene Datei übernehmen – beim Start, ohne sie erneut zu schreiben */
  uebernehmen(pfad: string, daten: Uint8Array | null, mtime = Date.now(), groesse?: number): void {
    const p = normiere(pfad)
    this.elternAnlegen(p)
    this.dateien.set(p, { daten, groesse: groesse ?? daten?.byteLength ?? 0, mtime })
  }

  /** Einen (leeren) Ordner übernehmen */
  ordnerUebernehmen(pfad: string): void {
    const p = normiere(pfad)
    this.elternAnlegen(p + '/x')
  }

  private elternAnlegen(p: string): void {
    for (let e = elternVon(p); !this.ordner.has(e); e = elternVon(e)) this.ordner.add(e)
  }

  /** Bekannte, noch nicht geladene Dateien nachladen (Ressourcen vor einem Aufruf) */
  async sicherstellen(pfade: string[]): Promise<void> {
    await Promise.all(
      pfade.map(async (roh) => {
        const p = normiere(roh)
        const d = this.dateien.get(p)
        if (!d || d.daten) return
        const punkt = this.punktVon(p)
        if (!punkt?.laden) return
        const daten = await punkt.laden(this.relativ(p, punkt))
        const jetzt = this.dateien.get(p)
        if (jetzt && !jetzt.daten) this.dateien.set(p, { ...jetzt, daten, groesse: daten.byteLength })
      })
    )
  }

  // ---------- Lesen ----------

  istDatei(pfad: string): boolean {
    return this.dateien.has(normiere(pfad))
  }

  istOrdner(pfad: string): boolean {
    return this.ordner.has(normiere(pfad))
  }

  existiert(pfad: string): boolean {
    const p = normiere(pfad)
    return this.dateien.has(p) || this.ordner.has(p)
  }

  lies(pfad: string, syscall = 'open'): Uint8Array {
    const p = normiere(pfad)
    const d = this.dateien.get(p)
    if (!d) throw new VfsFehler(this.ordner.has(p) ? 'EISDIR' : 'ENOENT', syscall === 'open' && this.ordner.has(p) ? 'read' : syscall, p)
    if (!d.daten) throw new VfsFehler('EIO', syscall, p, 'Datei ist noch nicht geladen')
    return d.daten
  }

  werte(pfad: string, syscall = 'stat'): Werte {
    const p = normiere(pfad)
    const d = this.dateien.get(p)
    if (d) return { groesse: d.groesse, mtime: d.mtime, ordner: false }
    if (this.ordner.has(p)) return { groesse: 0, mtime: 0, ordner: true }
    throw new VfsFehler('ENOENT', syscall, p)
  }

  /** Namen der Einträge eines Ordners, sortiert */
  liste(pfad: string): { name: string; ordner: boolean }[] {
    const p = normiere(pfad)
    if (this.dateien.has(p)) throw new VfsFehler('ENOTDIR', 'scandir', p)
    if (!this.ordner.has(p)) throw new VfsFehler('ENOENT', 'scandir', p)
    const vorsatz = p === '/' ? '/' : p + '/'
    const namen = new Map<string, boolean>()
    for (const k of this.dateien.keys()) if (k.startsWith(vorsatz) && !k.slice(vorsatz.length).includes('/')) namen.set(k.slice(vorsatz.length), false)
    for (const k of this.ordner) if (k !== p && k.startsWith(vorsatz) && !k.slice(vorsatz.length).includes('/')) namen.set(k.slice(vorsatz.length), true)
    return [...namen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, ordner]) => ({ name, ordner }))
  }

  // ---------- Schreiben ----------

  private schreibbar(p: string, syscall: string): void {
    if (this.punktVon(p)?.nurLesen) throw new VfsFehler('EROFS', syscall, p)
  }

  schreibe(pfad: string, daten: Uint8Array, syscall = 'open'): void {
    const p = normiere(pfad)
    this.schreibbar(p, syscall)
    if (this.ordner.has(p)) throw new VfsFehler('EISDIR', syscall, p)
    const eltern = elternVon(p)
    if (this.dateien.has(eltern)) throw new VfsFehler('ENOTDIR', syscall, p)
    if (!this.ordner.has(eltern)) throw new VfsFehler('ENOENT', syscall, p)
    this.dateien.set(p, { daten, groesse: daten.byteLength, mtime: Date.now() })
    this.merke(p)
  }

  anhaengen(pfad: string, daten: Uint8Array): void {
    const p = normiere(pfad)
    const alt = this.dateien.get(p)?.daten
    if (!alt) return this.schreibe(p, daten)
    const neu = new Uint8Array(alt.byteLength + daten.byteLength)
    neu.set(alt, 0)
    neu.set(daten, alt.byteLength)
    this.schreibe(p, neu)
  }

  /** Ordner anlegen; liefert den ersten neu angelegten Ordner (wie Node bei `recursive`) */
  ordnerAnlegen(pfad: string, rekursiv = false): string | undefined {
    const p = normiere(pfad)
    this.schreibbar(p, 'mkdir')
    if (this.dateien.has(p)) throw new VfsFehler('EEXIST', 'mkdir', p)
    if (this.ordner.has(p)) {
      if (rekursiv) return undefined
      throw new VfsFehler('EEXIST', 'mkdir', p)
    }
    const eltern = elternVon(p)
    if (this.dateien.has(eltern)) throw new VfsFehler('ENOTDIR', 'mkdir', p)
    if (!this.ordner.has(eltern)) {
      if (!rekursiv) throw new VfsFehler('ENOENT', 'mkdir', p)
      const erster = this.ordnerAnlegen(eltern, true)
      this.ordner.add(p)
      return erster ?? p
    }
    this.ordner.add(p)
    return p
  }

  /** Datei oder Ordner entfernen (Node: rmSync) */
  entferne(pfad: string, opt: { recursive?: boolean; force?: boolean } = {}, syscall = 'rm'): void {
    const p = normiere(pfad)
    if (this.dateien.has(p)) {
      this.schreibbar(p, syscall)
      this.dateien.delete(p)
      this.merke(p)
      return
    }
    if (this.ordner.has(p)) {
      this.schreibbar(p, syscall)
      if (this.punkte.some((m) => m.wurzel === p)) throw new VfsFehler('EISDIR', syscall, p, 'mount point cannot be removed')
      const vorsatz = p + '/'
      const hatInhalt = [...this.dateien.keys()].some((k) => k.startsWith(vorsatz)) || [...this.ordner].some((k) => k.startsWith(vorsatz))
      if (!opt.recursive) {
        if (syscall === 'rmdir' && !hatInhalt) {
          this.ordner.delete(p)
          this.ordnerWegMerken(p)
          return
        }
        throw new VfsFehler(syscall === 'rmdir' ? 'ENOTEMPTY' : 'EISDIR', syscall, p, syscall === 'rm' ? 'Path is a directory' : undefined)
      }
      for (const k of [...this.dateien.keys()]) if (k.startsWith(vorsatz)) this.dateien.delete(k)
      for (const k of [...this.ordner]) if (k === p || k.startsWith(vorsatz)) this.ordner.delete(k)
      this.ordnerWegMerken(p)
      return
    }
    if (!opt.force) throw new VfsFehler('ENOENT', syscall === 'rm' ? 'lstat' : syscall, p)
  }

  /** Änderungszeit setzen (Node: utimesSync) – nur im Speicher, der Träger kennt keine Zeiten */
  setzeZeit(pfad: string, mtime: number): void {
    const p = normiere(pfad)
    const d = this.dateien.get(p)
    if (d) this.dateien.set(p, { ...d, mtime })
    else if (!this.ordner.has(p)) throw new VfsFehler('ENOENT', 'utime', p)
  }

  benenneUm(von: string, nach: string): void {
    const a = normiere(von)
    const b = normiere(nach)
    this.schreibbar(a, 'rename')
    this.schreibbar(b, 'rename')
    if (a === b) {
      if (!this.existiert(a)) throw new VfsFehler('ENOENT', 'rename', a)
      return
    }
    const zielEltern = elternVon(b)
    if (!this.ordner.has(zielEltern)) throw new VfsFehler('ENOENT', 'rename', a)
    const datei = this.dateien.get(a)
    if (datei) {
      if (this.ordner.has(b)) throw new VfsFehler('EISDIR', 'rename', a)
      this.dateien.delete(a)
      this.dateien.set(b, { ...datei, mtime: Date.now() })
      this.merke(a)
      this.merke(b)
      return
    }
    if (!this.ordner.has(a)) throw new VfsFehler('ENOENT', 'rename', a)
    if (liegtUnter(b, a)) throw new VfsFehler('EINVAL', 'rename', a, 'invalid argument')
    if (this.dateien.has(b)) throw new VfsFehler('ENOTDIR', 'rename', a)
    if (this.ordner.has(b) && this.liste(b).length) throw new VfsFehler('ENOTEMPTY', 'rename', a)
    const vorsatz = a + '/'
    for (const [k, d] of [...this.dateien]) {
      if (!k.startsWith(vorsatz)) continue
      const neu = b + k.slice(a.length)
      this.dateien.delete(k)
      this.dateien.set(neu, d)
      this.merke(neu)
    }
    for (const k of [...this.ordner]) {
      if (k !== a && !k.startsWith(vorsatz)) continue
      this.ordner.delete(k)
      this.ordner.add(b + k.slice(a.length))
    }
    this.ordnerWegMerken(a)
  }

  // ---------- Schreibwarteschlange ----------

  private merke(p: string): void {
    const punkt = this.punktVon(p)
    if (!punkt?.traeger) return
    this.faellig.set(p, Date.now() + this.verzoegerungMs)
    this.plane()
  }

  private ordnerWegMerken(p: string): void {
    const punkt = this.punktVon(p)
    if (!punkt?.traeger) return
    // Anstehendes darunter ist mit dem Ordner erledigt
    for (const k of [...this.faellig.keys()]) if (k.startsWith(p + '/')) this.faellig.delete(k)
    this.ordnerWeg.push(p)
    this.plane()
  }

  private plane(): void {
    if (this.zeitgeber) clearTimeout(this.zeitgeber)
    const naechster = Math.min(...this.faellig.values(), this.ordnerWeg.length ? Date.now() + this.verzoegerungMs : Infinity)
    if (!Number.isFinite(naechster)) {
      this.zeitgeber = null
      return
    }
    this.zeitgeber = setTimeout(() => void this.schreibeFaellige(false), Math.max(0, naechster - Date.now()))
  }

  /** Stehen noch Änderungen aus? */
  get ausstehend(): number {
    return this.faellig.size + this.ordnerWeg.length
  }

  private schreibeFaellige(alle: boolean): Promise<void> {
    const jetzt = Date.now()
    const pfade = [...this.faellig.entries()].filter(([, t]) => alle || t <= jetzt).map(([p]) => p)
    for (const p of pfade) this.faellig.delete(p)
    const ordnerWeg = this.ordnerWeg
    this.ordnerWeg = []
    this.plane()
    this.kette = this.kette.then(async () => {
      for (const o of ordnerWeg) {
        const punkt = this.punktVon(o)
        if (!punkt?.traeger) continue
        try {
          await punkt.traeger.ordnerLoeschen(this.relativ(o, punkt))
        } catch (e) {
          this.onSchreibfehler(o, e)
        }
      }
      for (const p of pfade) {
        const punkt = this.punktVon(p)
        if (!punkt?.traeger) continue
        // Geschrieben wird der Stand von JETZT – eine inzwischen gelöschte Datei wird gelöscht
        const d = this.dateien.get(p)
        try {
          if (d?.daten) await punkt.traeger.schreiben(this.relativ(p, punkt), d.daten)
          else await punkt.traeger.loeschen(this.relativ(p, punkt))
        } catch (e) {
          this.onSchreibfehler(p, e)
        }
      }
    })
    return this.kette
  }

  /** Alles Anstehende sofort schreiben (App geht in den Hintergrund, vor dem Teilen einer Datei) */
  async sichereAlles(): Promise<void> {
    await this.schreibeFaellige(true)
    // Was während des Schreibens dazukam, gleich mit
    if (this.ausstehend) await this.schreibeFaellige(true)
  }
}

/** Das eine Dateisystem der App (shims/fs.ts arbeitet darauf) */
export const vfs = new Vfs()
