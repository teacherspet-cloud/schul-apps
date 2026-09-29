/**
 * Ereignisse des „Hauptprozesses" an die Oberfläche – auf dem iPad im selben Fenster.
 * Ersetzt ipcRenderer.on (PC) bzw. den Ereignisstrom vom Server (Browser im Netz).
 */
type Hoerer = (wert: unknown) => void

const hoerer = new Map<string, Set<Hoerer>>()

export const bus = {
  subscribe(kanal: string, cb: Hoerer): () => void {
    if (!hoerer.has(kanal)) hoerer.set(kanal, new Set())
    hoerer.get(kanal)!.add(cb)
    return () => {
      hoerer.get(kanal)?.delete(cb)
    }
  },
  emit(kanal: string, wert: unknown): void {
    // Wie über IPC: eine Kopie, und erst nach dem laufenden Aufruf
    let kopie: unknown = wert
    try {
      kopie = structuredClone(wert)
    } catch {
      // nicht kopierbar – dann das Original
    }
    queueMicrotask(() => {
      for (const cb of hoerer.get(kanal) ?? []) {
        try {
          cb(kopie)
        } catch (e) {
          console.error(e)
        }
      }
    })
  }
}
