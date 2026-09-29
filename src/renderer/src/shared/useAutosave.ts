import { useEffect, useRef } from 'react'
import { verzoegerteSicherung, type VerzoegerteSicherung } from './autosave'
import { notifyError } from './util'

const meldeFehler = (e: unknown): void => notifyError(e, 'Automatisches Speichern fehlgeschlagen')

/**
 * Verzögert sichern aus einer Komponente heraus (z. B. die Vokabellisten, deren Stand nur
 * in der Komponente liegt). Beim Aushängen wird Anstehendes gesichert, nicht verworfen.
 *
 * `speichern` darf sich bei jedem Rendern ändern – ausgeführt wird immer die neueste Fassung.
 */
export function useVerzoegertesSichern(speichern: () => Promise<void>): VerzoegerteSicherung {
  const aktuell = useRef(speichern)
  aktuell.current = speichern
  // Angelegt im Effekt, nicht beim Rendern: Nur so passen An- und Abmeldung zusammen, auch
  // wenn React den Effekt (im Entwicklungsmodus) zweimal ausführt.
  const inneres = useRef<VerzoegerteSicherung | null>(null)
  useEffect(() => {
    const s = verzoegerteSicherung(() => aktuell.current(), meldeFehler)
    inneres.current = s
    return () => {
      s.beende()
      if (inneres.current === s) inneres.current = null
    }
  }, [])
  const huelle = useRef<VerzoegerteSicherung>({
    plane: (ms) => inneres.current?.plane(ms),
    sofort: () => inneres.current?.sofort() ?? Promise.resolve(),
    steht: () => inneres.current?.steht() ?? false,
    beende: () => inneres.current?.beende()
  })
  return huelle.current
}

interface StoreLike<S> {
  getState: () => S
  subscribe: (listener: (state: S, prev: S) => void) => () => void
}

export interface StoreAutosave<S> {
  store: StoreLike<S>
  /** Kennung des offenen Dokuments – wechselt sie, ist ein anderes Dokument offen */
  dokument: (s: S) => string
  /** Liegt das Dokument schon in der Bibliothek? */
  gesichert: (s: S) => boolean
  /** Gibt es etwas, das sich zu sichern lohnt? Ein leeres Formular soll die Bibliothek nicht füllen. */
  bereit: (s: S) => boolean
  /** Hat sich etwas geändert, das gesichert werden muss? */
  geaendert: (s: S, prev: S) => boolean
  /** Verzögerung nach einer Änderung (ms) */
  verzoegerung?: number
  speichern: () => Promise<void>
}

/**
 * Das gemeinsame automatische Sichern der Programme.
 *
 * Vorher hatte jedes Programm seinen eigenen, fast gleichen Hook – mit kleinen Unterschieden,
 * die niemand beabsichtigt hatte (der Vokabeltest sicherte erst nach dem ersten Handspeichern,
 * das Arbeitsblatt erst mit ausformulierten Bausteinen). Jetzt gilt überall:
 *
 * - gesichert wird, sobald es etwas zu sichern gibt (`bereit`) – auch als Entwurf,
 * - nach einer Änderung mit Verzögerung, damit nicht jeder Tastendruck eine Datei schreibt,
 * - ein neu geöffnetes, noch nie gesichertes Dokument mit Inhalt (etwa aus einer Datei) gleich,
 * - ein aus der Bibliothek geöffnetes Dokument NICHT, nur weil es geöffnet wurde – sonst
 *   rückte es allein durchs Ansehen in der Bibliothek nach oben,
 * - und Anstehendes lässt sich jederzeit sofort ausführen (`sichereAlles`).
 */
export function useStoreAutosave<S>(optionen: StoreAutosave<S>): void {
  const o = useRef(optionen)
  o.current = optionen
  const sicherung = useVerzoegertesSichern(() => o.current.speichern())
  useEffect(() => beobachteStore(() => o.current, sicherung), [sicherung])
}

/**
 * Die Regeln von `useStoreAutosave` ohne React – so lassen sie sich ohne Oberfläche prüfen
 * (tests/loeschenBleibt.test.ts). Liefert die Abmeldung vom Store.
 */
export function beobachteStore<S>(optionen: () => StoreAutosave<S>, sicherung: Pick<VerzoegerteSicherung, 'plane'>): () => void {
  const { store, bereit, gesichert } = optionen()
  const kurz = 200
  const start = store.getState()
  if (bereit(start) && !gesichert(start)) sicherung.plane(kurz)
  return store.subscribe((s, prev) => {
    const { dokument, gesichert, bereit, geaendert, verzoegerung = 1500 } = optionen()
    if (dokument(s) !== dokument(prev)) {
      if (bereit(s) && !gesichert(s)) sicherung.plane(kurz)
      return
    }
    if (!bereit(s) || !geaendert(s, prev)) return
    sicherung.plane(verzoegerung)
  })
}
