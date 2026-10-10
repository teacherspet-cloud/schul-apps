/**
 * Eine Unterrichtsreihe bauen: Titel, Fach, Oberthema (Kerncurriculum des Landes), übergeordnete
 * Lernziele, Schritte (hinzufügen, ordnen, bearbeiten) und zuweisen.
 *
 * Übersicht (08.10.2026, Plan „Unterrichtsreihe: Übersicht, KI-Status, Transparenz" B/C/G.1): Kopf nach der Planung
 * eingeklappt (ReiheKopf.tsx), Standardmodus Stunde für Stunde (stundenAnsicht.ts) mit kompakten Schrittkarten
 * (SchrittKarte.tsx, „Warum?", „Grundlage:"), Expertenmodus mit Schalter „Stunden | Teile"; „Als Schüler ansehen" öffnet
 * die echte Schülerseite als Musterschüler (ReiheVorschau.tsx), der Ablauf-Simulator heißt im Expertenmodus „Ablauf testen".
 */
import { AlleOptionen, NurExperte, OptionenBereich } from '../../shared/components/NurExperte'
import { useAlleLernenden } from '../lernen/LernendeWahl'
import HaeufigSelect from '../../shared/components/HaeufigSelect'
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  Menu,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconChevronUp,
  IconDeviceFloppy,
  IconFolderPlus,
  IconMedal,
  IconPlayerPlay,
  IconPlus,
  IconSend,
  IconTrash
} from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import {
  artVon,
  berechneWeg,
  leererInhalt,
  neueSchrittId,
  ordneNachTeilen,
  SCHRITT_ARTEN,
  standardErfolg,
  teileVon,
  type Extern,
  type Reihe,
  type ReiheArt,
  type Schritt,
  type SchrittArt,
  type Stand
} from '@shared/reihe'
import { FAECHER } from '@shared/faecher'
import { lehrplanSchulform } from '@shared/lehrplan'
import { katalogBaum, ladeLehrplan, type KatalogKnoten } from '../../shared/themenKatalog'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { LernzieleFeld, type KcAuszug } from './Lernziele'
import { ichKannFormulieren, reihenLernziele } from './lernzieleKi'
import { SchrittBearbeiten } from './SchrittBearbeiten'
import { Zugang } from '../onlinetest/OnlinetestModule'
import { DruckMenue, PlanenFenster, StundenLeiste } from './ReiheKi'
import { horcheReihe } from './platzhalterAuftrag'
import { AllePlatzhalterKnopf, ReiheMaterialien, ZuweisenHinweis } from './SchrittStatus'
import { meldeOffeneReihe, usePlaene, usePlantGerade } from './planungAuftrag'
import type { ReihenPlan } from './reihePlanungKi'
import { IconBook, IconSparkles } from '@tabler/icons-react'
import { ReiheAusSchulbuch, type BuchReihe } from './SchulbuchReiheFenster'
import { TestFenster } from './TestHierKnopf'
import { fuegeEin, type TestZiel } from './reiheTest'
import { useExperte } from '../../shared/settingsStore'
import { SchrittKarte } from './SchrittKarte'
import { ansichtGemerkt, kopfGemerkt, KopfZeile, LeitfrageFeld, merkeAnsicht, merkeKopf, PlanHinweis } from './ReiheKopf'
import { ReiheAlsSchueler } from './ReiheVorschau'
import { merkeKcAuszug } from './grundlage'
import { ansichtFuer, stundenDaten, stundenGruppen, stundenTitel } from './stundenAnsicht'
import { StundenTermine } from './StundenTermine'
import { ArtPlakette, ArtWahl } from './ReiheArt'
import { PlanungExport, PlanungHinweis, PlanungOhneStunden, PlanungsStunde } from './StundenPlanung'
import { fuerDigital, nichtAmGeraet, schritteAlsPhasen, wechsleArt } from './reihePlanung'
import { horcheVerlauf } from './verlaufAuftrag'
import { useVerzoegertesSichern } from '../../shared/useAutosave'
import { ServerFehler } from '../onlinetest/serverApi'
import { fuehreZusammen, type Veroeffentlichung } from '@shared/reiheSpeichern'
import { planAufRaster } from './planAbdeckung'
import { NiveauWahl } from './ReiheNiveau'
import { IconArrowsMove, IconRefresh } from '@tabler/icons-react'
import FreigabePlanen, { planGeaendert, planKnopf, planKoerper, planMeldung, planStart, type PlanWahl } from '../../shared/components/FreigabePlanen'

/**
 * Lohnt sich das automatische Speichern? (08.10.2026) Gespeicherte Reihen immer; neue erst, wenn mehr als die Art gewählt
 * ist – sonst füllte jedes Öffnen von „Neue Reihe" die Liste.
 */
export const reiheSpeicherbar = (x: Reihe): boolean =>
  Boolean(x.id) || Boolean(x.art && (x.titel.trim() || x.schritte.length || x.lernziele.length || x.oberthema.trim() || x.stunden?.length))

const ki = <T,>(req: Parameters<typeof window.api.ai.structured>[0]): Promise<T> => window.api.ai.structured<T>(req)

/** Begründung der Planung auch am Schritt (08.10.2026, B5): Sie bleibt, wenn der Platzhalter beim Erstellen entfällt */
const mitBegruendung = (schritte: Schritt[]): Schritt[] =>
  schritte.map((s) => (s.platzhalter?.begruendung && !s.begruendung ? { ...s, begruendung: s.platzhalter.begruendung } : s))

/** Alle Zeilen unter einem Knoten (Unterthemen, auch tiefer) */
const zeilenVon = (k: KatalogKnoten): string[] => k.kinder.flatMap((c) => [c.wortlaut ?? c.name, ...zeilenVon(c).map((z) => `${c.name}: ${z}`)])

export function ReiheEditor({
  start,
  zurueck,
  meldeGeaendert
}: {
  start: Reihe
  zurueck: () => void
  /** Ungespeicherte Änderungen nach außen melden (08.10.2026, „Reihen planen" aus Laufende Reihen) */
  meldeGeaendert?: (geaendert: boolean) => void
}): React.JSX.Element {
  const [r, setR] = useState<Reihe>(start)
  // Jüngster Stand – für das sofortige Speichern übernommener KI-Ergebnisse (08.10.2026, horcheReihe)
  const rAktuell = useRef(r)
  rAktuell.current = r
  const [geaendert, setGeaendert] = useState(false)
  useEffect(() => {
    meldeGeaendert?.(geaendert)
  }, [geaendert, meldeGeaendert])
  const [bearbeiten, setBearbeiten] = useState<Schritt | null>(null)
  const [zuweisen, setZuweisen] = useState(false)
  const [vorschau, setVorschau] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [kc, setKc] = useState<KatalogKnoten[]>([])
  const [planen, setPlanen] = useState(false)
  const [ausBuch, setAusBuch] = useState(false)
  // Kopf (08.10.2026, B1): je Reihe gemerkt; sonst eine Reihe mit Schritten eingeklappt, eine neue, leere offen
  const [kopfOffen, setKopfOffenRoh] = useState(() => kopfGemerkt(start.id) ?? !start.schritte.length)
  const setKopfOffen = (offen: boolean): void => {
    setKopfOffenRoh(offen)
    merkeKopf(rAktuell.current.id, offen)
  }
  // Stunden | Teile (B3): Standardmodus Stunde für Stunde, Expertenmodus wählbar (gemerkt)
  const experte = useExperte()
  const [ansichtWahl, setAnsichtWahl] = useState(ansichtGemerkt)
  // Reihenart (08.10.2026, Plan E): Planungsreihen zeigen je Stunde den Verlauf statt der Schritte der Lernenden
  const art = artVon(r)
  const planung = art === 'planung'
  const ansicht = planung ? 'planung' : ansichtFuer(r, experte, ansichtWahl)
  // „Test hier erstellen" aus dem Menü „⋯" eines Schritts (B6)
  const [testHier, setTestHier] = useState<{ ziel: TestZiel; nach: string } | null>(null)
  const setze = (teil: Partial<Reihe>): void => {
    setR((x) => ({ ...x, ...teil }))
    setGeaendert(true)
  }
  useEffect(() => {
    let aktiv = true
    void ladeLehrplan(r.stateId).then((lp) => {
      if (!aktiv) return
      const baum = katalogBaum(r.fachId, lp, lehrplanSchulform(r.schoolTypeId), r.stateId).filter(
        (k) => k.quelle === 'lehrplan' && (!k.jahrgaenge?.length || k.jahrgaenge.includes(r.grade))
      )
      setKc(baum)
    })
    return () => {
      aktiv = false
    }
  }, [r.stateId, r.fachId, r.schoolTypeId, r.grade])
  const gewaehlt = kc.find((k) => k.name === r.oberthema)
  const auszug: KcAuszug | null = gewaehlt
    ? { zeilen: [gewaehlt.wortlaut ?? gewaehlt.name, ...zeilenVon(gewaehlt)].slice(0, 60), quelle: `Kerncurriculum ${r.stateId} ${r.fachLabel}` }
    : null
  // Auszug für die KI-Erstellung der Schritte bereitlegen (C1, grundlage.ts) – gleich hier, damit die Chips ihn sofort sehen
  merkeKcAuszug(r, auszug)

  /*
   * Speichern (08.10.2026, automatisch und von Hand):
   *  - Alle Läufe nacheinander (`kette`) – zwei gleichzeitige Läufe einer neuen Reihe hätten sonst zwei Reihen angelegt.
   *  - Nach dem Speichern kommen nur Kennung und Zeitstempel in den JETZIGEN Stand. Vorher ersetzte der gespeicherte Stand
   *    alles, was während des Speicherns getippt wurde (Befund: Eingaben verschwanden).
   *  - Der Server lehnt ab, wenn sein Stand neuer ist als der, auf dem der Editor aufbaut (409, reiheSpeichern.ts). Dann
   *    führt der Editor beide Stände zusammen (`fuehreZusammen` mit der letzten Basis) und speichert erneut.
   */
  const basis = useRef<Reihe | null>(start.id ? start : null)
  const geaendertRef = useRef(geaendert)
  geaendertRef.current = geaendert
  const [veroeff, setVeroeff] = useState<Veroeffentlichung | null>(null)
  const kette = useRef<Promise<unknown>>(Promise.resolve())
  const speichernJetzt = async (stand: Reihe, versuch = 0): Promise<Reihe | null> => {
    const jetzt0 = rAktuell.current
    // Kennung und Basis des letzten eigenen Speicherns (ein wartender Lauf kennt sie sonst noch nicht)
    const senden_ = { ...stand, id: stand.id || jetzt0.id, geaendert: jetzt0.geaendert ?? stand.geaendert }
    setLaeuft(true)
    try {
      const a = await senden<{ id: string; geaendert: string; veroeffentlichung?: Veroeffentlichung }>('/server/reihen/speichern', {
        reihe: senden_,
        basis: senden_.geaendert ?? ''
      })
      const gespeichert = { ...senden_, id: a.id, geaendert: a.geaendert }
      basis.current = gespeichert
      if (a.veroeffentlichung) setVeroeff(a.veroeffentlichung)
      const jetzt = rAktuell.current
      const neu = { ...jetzt, id: a.id, geaendert: a.geaendert }
      rAktuell.current = neu
      setR(neu)
      // Nur „gespeichert", wenn seitdem nichts dazukam – sonst plant das automatische Speichern den nächsten Lauf
      if (jetzt === stand || jetzt === jetzt0) setGeaendert(false)
      // Still speichern (08.10.2026): kein „Gespeichert." bei jedem Klick – Fehler meldet der catch-Zweig
      return gespeichert
    } catch (e) {
      const server = e instanceof ServerFehler && e.status === 409 ? (e.daten as { reihe?: Reihe } | undefined)?.reihe : undefined
      if (server && versuch < 2) {
        const zusammen = fuehreZusammen(rAktuell.current, basis.current, server)
        basis.current = server
        rAktuell.current = zusammen
        setR(zusammen)
        setGeaendert(true)
        return speichernJetzt(zusammen, versuch + 1)
      }
      notifyError(e, 'Nicht gespeichert')
      return null
    } finally {
      setLaeuft(false)
    }
  }
  const speichern = (stand?: Reihe): Promise<Reihe | null> => {
    const lauf = kette.current.catch(() => undefined).then(() => speichernJetzt(stand ?? rAktuell.current))
    kette.current = lauf
    return lauf
  }
  // Automatisch speichern (08.10.2026): 1,5 s nach der letzten Änderung; Programmwechsel und Schließen sichern sofort (autosave.ts)
  const sicherung = useVerzoegertesSichern(async () => {
    if (!geaendertRef.current || !reiheSpeicherbar(rAktuell.current)) return
    await speichern()
  })
  useEffect(() => {
    if (geaendert && reiheSpeicherbar(r)) sicherung.plane(1500)
  }, [r, geaendert, sicherung])
  // Stand der Veröffentlichung (zugewiesene Reihen): „n Änderungen noch nicht bei den Lernenden"
  useEffect(() => {
    if (!r.id) return
    let aktiv = true
    void holen<Veroeffentlichung>(`/server/reihen/${r.id}/veroeffentlichung`).then(
      (v) => aktiv && setVeroeff(v),
      () => undefined
    )
    return () => {
      aktiv = false
    }
  }, [r.id])
  const [veroeffLaeuft, setVeroeffLaeuft] = useState(false)
  /** „Für Lernende aktualisieren": erst speichern, dann den gespeicherten Stand veröffentlichen */
  const veroeffentlichen = async (): Promise<void> => {
    setVeroeffLaeuft(true)
    try {
      await sicherung.sofort()
      const x = geaendertRef.current || !rAktuell.current.id ? await speichern() : rAktuell.current
      if (!x?.id) return
      setVeroeff(await senden<Veroeffentlichung>(`/server/reihen/${x.id}/veroeffentlichen`))
      notifySuccess('Die Lernenden sehen jetzt den neuen Stand der Reihe.')
    } catch (e) {
      notifyError(e, 'Nicht veröffentlicht')
    } finally {
      setVeroeffLaeuft(false)
    }
  }
  /** „Alle Reihen": Anstehendes zuerst speichern */
  const zurueckGesichert = async (): Promise<void> => {
    await sicherung.sofort()
    await kette.current.catch(() => undefined)
    zurueck()
  }
  // Fertige Platzhalter aus dem Hintergrund übernehmen, solange die Reihe hier offen ist (05.10.2026)
  useEffect(() => {
    if (!r.id) return
    // Verknüpfung gleich speichern (08.10.2026) – sonst ginge sie mit „nicht speichern" verloren
    return horcheReihe(
      r.id,
      (schrittId, patch) => {
        const x = rAktuell.current
        const neu = { ...x, schritte: x.schritte.map((s) => (s.id === schrittId ? { ...s, ...patch } : s)) }
        rAktuell.current = neu
        setR(neu)
        setGeaendert(true)
      },
      () => speichern(rAktuell.current)
    )
  }, [r.id])
  // Stundenverlauf-Vorschläge der KI (Planungsreihe, verlaufAuftrag.ts) ebenso übernehmen und gleich speichern
  useEffect(() => {
    if (!r.id) return
    return horcheVerlauf(
      r.id,
      (stunde, p) => {
        const x = rAktuell.current
        const neu = { ...x, verlauf: { ...(x.verlauf ?? {}), [String(stunde)]: p } }
        rAktuell.current = neu
        setR(neu)
        setGeaendert(true)
      },
      () => speichern(rAktuell.current)
    )
  }, [r.id])
  /**
   * Art wechseln (E5) – mit Umwandlung (reihePlanung.ts) und gleich gespeichert; lehnt der Server ab (zugewiesene Reihe
   * → Planung), bleibt alles wie vorher.
   */
  const artWechseln = async (nach: ReiheArt): Promise<void> => {
    const vorher = rAktuell.current
    const warGeaendert = geaendert
    const neu = wechsleArt(vorher, nach)
    setR(neu)
    rAktuell.current = neu
    setGeaendert(true)
    if (!neu.id || !neu.titel.trim()) return
    if (!(await speichern(neu))) {
      setR(vorher)
      rAktuell.current = vorher
      setGeaendert(warGeaendert)
    }
  }
  /** Neue Schritte (KI-Plan, Schulbuch) passend zur Art: digital ohne „Im Unterricht", Planung als Phasen ihrer Stunde */
  const nachArt = (alt: Schritt[], neu: Schritt[], stunden = r.stunden, verlaufVorher = r.verlauf): Pick<Reihe, 'schritte' | 'verlauf'> => {
    if (art === 'digital') return { schritte: [...alt, ...fuerDigital(neu)], verlauf: r.verlauf }
    if (!planung) return { schritte: [...alt, ...neu], verlauf: r.verlauf }
    const { verlauf, aufgegangen } = schritteAlsPhasen({ stunden, verlauf: verlaufVorher }, neu)
    return { schritte: [...alt, ...neu.filter((s) => !aufgegangen.includes(s.id))], verlauf }
  }
  /*
   * KI-Planung im Hintergrund (08.10.2026, planungAuftrag.ts): Der fertige Plan liegt je Reihe bereit. Aus der
   * Auftragsleiste geöffnet (`zeigen`), erscheint gleich die Vorschau mit „Übernehmen"; sonst ein Hinweis über den Schritten.
   */
  useEffect(() => meldeOffeneReihe(r.id || null), [r.id])
  const planBereit = usePlaene((st) => (r.id ? st.plaene[r.id] : undefined))
  const plantGerade = usePlantGerade(r.id || undefined)
  const zeigePlan = usePlaene((st) => st.zeigen)
  useEffect(() => {
    if (!r.id || zeigePlan !== r.id) return
    usePlaene.getState().setzeZeigen(null)
    if (planBereit) setPlanen(true)
  }, [zeigePlan, r.id, planBereit])
  const schrittAendern = (id: string, patch: Partial<Schritt>): void => {
    setR((x) => ({ ...x, schritte: x.schritte.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
    setGeaendert(true)
  }
  /** KI-Plan übernehmen: ersetzen oder an die vorhandenen Schritte anhängen */
  const planUebernehmen = (plan: ReihenPlan, ersetzen: boolean): void => {
    const alteTeile = ersetzen ? [] : teileVon(r)
    const neueTeile = [...alteTeile, ...plan.teile.filter((t) => !alteTeile.includes(t))]
    // Hinweis der Planung und Begründungen in der Reihe sichern (08.10.2026, B5) – der Platzhalter entfällt beim Erstellen
    // Stunden wie geplant (08.10.2026): auf das Raster, für das die KI geplant hat – auch wenn es sich seitdem geändert hat
    const raster = planAufRaster(r.stunden, plan.stunden, mitBegruendung(plan.schritte), ersetzen)
    const n = nachArt(ersetzen ? [] : r.schritte, raster.schritte, raster.stunden, ersetzen ? {} : r.verlauf)
    setze({
      stunden: raster.stunden,
      schritte: ordneNachTeilen(n.schritte, neueTeile),
      ...(n.verlauf ? { verlauf: n.verlauf } : {}),
      teile: neueTeile,
      ...(plan.hinweis.trim() ? { planHinweis: plan.hinweis.trim() } : {}),
      // Reihenmuster (08.10.2026): Leitfrage der KI nur, wo die Lehrkraft keine hat (oder beim Ersetzen); Reihentyp wie geplant
      ...(plan.leitfrage && (ersetzen || !r.leitfrage?.trim()) ? { leitfrage: plan.leitfrage } : {}),
      ...(plan.reihentyp ? { reihentyp: plan.reihentyp } : {})
    })
    setKopfOffen(false)
    notifySuccess(`${plan.schritte.length} Schritte übernommen – Platzhalter lassen sich einzeln mit „Mit KI erstellen" füllen.`)
  }
  /** Reihe aus Schulbuchseiten (06.10.2026): Stundenraster, ggf. Lernziele und Schritte übernehmen */
  const buchUebernehmen = (b: BuchReihe, ersetzen: boolean): void => {
    const alteTeile = ersetzen ? [] : teileVon(r)
    const neueTeile = [...alteTeile, ...b.teile.filter((t) => !alteTeile.includes(t))]
    // Beim Anhängen kommen die neuen Stunden hinter die vorhandenen
    const versatz = ersetzen ? 0 : r.stunden?.length ?? 0
    const neu = mitBegruendung(b.schritte).map((x) => ({ ...x, stunde: (x.stunde ?? 0) + versatz }))
    const stunden = ersetzen ? b.stunden : [...(r.stunden ?? []), ...b.stunden]
    const n = nachArt(ersetzen ? [] : r.schritte, neu, stunden, ersetzen ? {} : r.verlauf)
    setze({
      stunden,
      lernziele: r.lernziele.length ? r.lernziele : b.lernziele,
      schritte: ordneNachTeilen(n.schritte, neueTeile),
      ...(n.verlauf ? { verlauf: n.verlauf } : {}),
      teile: neueTeile
    })
    setKopfOffen(false)
    notifySuccess(`${neu.length} Schritte aus dem Schulbuch übernommen – Platzhalter lassen sich einzeln mit „Mit KI erstellen" füllen.`)
  }
  /** „Test hier erstellen" (06.10.2026): Platzhalter an der Stelle einfügen und gleich speichern */
  const testEinfuegen = async (s: Schritt, nach: string | null): Promise<Reihe | null> => {
    const neu = { ...r, schritte: ordneNachTeilen(fuegeEin(r.schritte, nach, s), teileVon(r)) }
    setR(neu)
    return speichern(neu)
  }
  // Teile (03.10.2026): angelegte Teile + an Schritten genannte; Schritte stehen immer in der Reihenfolge der Teile
  const teile = teileVon(r)
  const setzeSchritte = (schritte: Schritt[], neueTeile = teile): void => setze({ schritte: ordneNachTeilen(schritte, neueTeile), teile: neueTeile })
  /** Schritt `id` in den Teil `teil` verschieben – vor `vor` (Schritt-Id) bzw. ans Ende */
  const verschiebeNach = (id: string, teil: string | undefined, vor: string | null): void => {
    const s0 = r.schritte.find((x) => x.id === id)
    if (!s0 || id === vor) return
    const ohne = r.schritte.filter((x) => x.id !== id)
    const neu = { ...s0, abschnitt: teil || undefined }
    const idx = vor ? ohne.findIndex((x) => x.id === vor) : -1
    if (idx >= 0) ohne.splice(idx, 0, neu)
    else {
      // ans Ende des Teils
      const letzter = ohne
        .map((x, k) => ((x.abschnitt || undefined) === (teil || undefined) ? k : -1))
        .filter((k) => k >= 0)
        .pop()
      ohne.splice(letzter === undefined ? ohne.length : letzter + 1, 0, neu)
    }
    setzeSchritte(ohne)
  }
  const verschiebe = (id: string, d: number): void => {
    const s0 = r.schritte.find((x) => x.id === id)!
    const imTeil = r.schritte.filter((x) => (x.abschnitt || undefined) === (s0.abschnitt || undefined))
    const k = imTeil.findIndex((x) => x.id === id)
    const ziel = imTeil[k + d]
    if (!ziel) return
    const liste = [...r.schritte]
    const i = liste.findIndex((x) => x.id === id)
    const j = liste.findIndex((x) => x.id === ziel.id)
    ;[liste[i], liste[j]] = [liste[j], liste[i]]
    setzeSchritte(liste)
  }
  const teilVerschieben = (t: string, d: number): void => {
    const i = teile.indexOf(t)
    const j = i + d
    if (j < 0 || j >= teile.length) return
    const neu = [...teile]
    ;[neu[i], neu[j]] = [neu[j], neu[i]]
    setzeSchritte(r.schritte, neu)
  }
  const teilUmbenennen = (alt: string, neuName: string): void => {
    const n = neuName.trim()
    if (!n || n === alt || teile.includes(n)) return
    setzeSchritte(
      r.schritte.map((x) => (x.abschnitt === alt ? { ...x, abschnitt: n } : x)),
      teile.map((t) => (t === alt ? n : t))
    )
  }
  const teilLoeschen = (t: string): void =>
    setzeSchritte(
      r.schritte.map((x) => (x.abschnitt === t ? { ...x, abschnitt: undefined } : x)),
      teile.filter((x) => x !== t)
    )
  const teilAnlegen = (): void => {
    let n = 1
    while (teile.includes(`Teil ${n}`)) n++
    setzeSchritte(r.schritte, [...teile, `Teil ${n}`])
  }
  const [neuIn, setNeuIn] = useState<string | undefined>(undefined)
  const neuerSchritt = (art: SchrittArt, teil?: string, stunde?: number): void => {
    setNeuIn(teil)
    setBearbeiten({
      id: neueSchrittId(),
      titel: '',
      lernziele: [],
      rolle: 'pflicht',
      erfolg: standardErfolg(art, artVon(r)),
      inhalt: leererInhalt(art),
      ...(teil ? { abschnitt: teil } : {}),
      ...(stunde !== undefined ? { stunde } : {})
    })
  }
  const [gezogen, setGezogen] = useState<string | null>(null)
  const [ueber, setUeber] = useState<string | null>(null)
  const nummer = new Map(r.schritte.map((x, k) => [x.id, k + 1]))
  const speichernVorher = async (): Promise<Reihe | null> => (geaendert || !r.id ? await speichern() : r)
  /** Was jede Schrittkarte kann – in beiden Ansichten gleich */
  const karte = (s: Schritt) => ({
    reihe: r,
    s,
    nummer: nummer.get(s.id) ?? 0,
    teile,
    setze: (p: Partial<Schritt>) => schrittAendern(s.id, p),
    bearbeiten: () => setBearbeiten(s),
    verdoppeln: () => {
      const i = r.schritte.findIndex((x) => x.id === s.id)
      setzeSchritte([...r.schritte.slice(0, i + 1), { ...structuredClone(s), id: neueSchrittId(), titel: `${s.titel} (Kopie)` }, ...r.schritte.slice(i + 1)])
    },
    entfernen: () => setzeSchritte(r.schritte.filter((x) => x.id !== s.id)),
    inTeil: (t: string | undefined) => verschiebeNach(s.id, t, null),
    speichernVorher,
    testHier: (ziel: TestZiel) => setTestHier({ ziel, nach: s.id }),
    ansehen: (x: Schritt) => setBearbeiten(x)
  })
  const halteZeile = (s: Schritt): React.ReactNode =>
    s.halt && (
      <Text size="xs" c="orange.7">
        ⏸ Haltepunkt: {s.halt.art === 'freigabe' ? 'nach gemeinsamer Besprechung' : `ab ${new Date(s.halt.ab).toLocaleDateString('de-DE')}`}
      </Text>
    )
  const anzahlOptional = r.schritte.filter((x) => x.rolle === 'optional' && x.inhalt.art !== 'hefter').length
  const nichtAmGeraetZahl = r.schritte.filter((x) => nichtAmGeraet(r, x)).length
  const ohneStunde = (s: Schritt): boolean => s.stunde === undefined || s.stunde < 0 || s.stunde >= (r.stunden?.length ?? 0)

  // Neue Reihe (E1): zuerst die Art wählen – drei Karten; gilt für alle Wege, die über `neueReihe` anlegen
  if (!r.id && !r.art && !r.schritte.length)
    return (
      <Stack data-reihe-editor>
        <Group>
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => void zurueckGesichert()} data-alle-reihen>
            Alle Reihen
          </Button>
        </Group>
        <ArtWahl waehle={(a) => setR((x) => ({ ...x, art: a }))} />
      </Stack>
    )

  return (
    <OptionenBereich>
      <Stack data-reihe-editor>
        <Group justify="space-between">
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => void zurueckGesichert()} data-alle-reihen>
            Alle Reihen
          </Button>
          <Group gap="xs">
            <Button
              variant="light"
              leftSection={<IconDeviceFloppy size={16} />}
              loading={laeuft}
              disabled={!reiheSpeicherbar(r)}
              onClick={() => void speichern()}
              data-reihe-speichern
              data-gespeichert={!geaendert || undefined}
            >
              {/* Automatisch gespeichert (08.10.2026) – der Knopf sichert sofort */}
              {geaendert ? 'Speichern *' : 'Gespeichert'}
            </Button>
            {planung && <PlanungExport reihe={r} />}
            {r.schritte.length > 0 && <DruckMenue reihe={r} />}
            <ReiheMaterialien reihe={r} />
            {planung ? (
              // Planungsreihe (E4): nur für die Lehrkraft – kein Zuweisen, keine Schüleransicht
              <PlanungHinweis />
            ) : (
              <>
                {/* Ablauf-Simulator (03.10.2026) – seit 08.10.2026 nur im Expertenmodus, die echte Schülerseite daneben */}
                <NurExperte>
                  <Button
                    variant="default"
                    leftSection={<IconPlayerPlay size={16} />}
                    disabled={!r.schritte.length}
                    onClick={() => setVorschau(true)}
                    data-ablauf-testen
                  >
                    Ablauf testen
                  </Button>
                </NurExperte>
                <ReiheAlsSchueler reihe={r} speichernVorher={speichernVorher} platzhalter={r.schritte.filter((x) => x.platzhalter).length} />
                <Button
                  leftSection={<IconSend size={16} />}
                  disabled={!r.titel.trim() || !r.schritte.length}
                  onClick={async () => {
                    const neu = geaendert || !r.id ? await speichern() : r
                    if (neu) setZuweisen(true)
                  }}
                  data-reihe-zuweisen
                >
                  Zuweisen
                </Button>
              </>
            )}
          </Group>
        </Group>
        {!kopfOffen ? (
          <KopfZeile reihe={r} aufklappen={() => setKopfOffen(true)} plakette={<ArtPlakette reihe={r} wechseln={(a) => void artWechseln(a)} />} />
        ) : (
        <Card withBorder data-reihe-kopf-offen>
          <Stack gap="sm">
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                Art der Reihe:
              </Text>
              <ArtPlakette reihe={r} wechseln={(a) => void artWechseln(a)} />
            </Group>
            <Group grow align="start">
              <TextInput label="Titel der Reihe" value={r.titel} onChange={(e) => setze({ titel: e.currentTarget.value })} data-reihe-titel />
              <HaeufigSelect
                art="fach"
                label="Fach"
                searchable
                data={FAECHER.map((f) => ({ value: f.id, label: f.label }))}
                value={r.fachId}
                onChange={(v) => v && setze({ fachId: v, fachLabel: FAECHER.find((f) => f.id === v)?.label ?? v })}
                allowDeselect={false}
              />
              <NumberInput label="Jahrgang" min={1} max={13} value={r.grade} onChange={(v) => setze({ grade: Number(v) || r.grade })} w={110} />
            </Group>
            <Select
              label="Oberthema"
              description={
                kc.length
                  ? `Themenfelder des Kerncurriculums (${r.stateId}, Jahrgang ${r.grade}) – oder eigenes eintippen`
                  : 'Kein Kerncurriculum für diese Auswahl gefunden – eigenes Oberthema eintippen'
              }
              searchable
              data={[...new Set([...kc.map((k) => k.name), ...(r.oberthema ? [r.oberthema] : [])])]}
              value={r.oberthema || null}
              onChange={(v) => setze({ oberthema: v ?? '' })}
              onSearchChange={(t) => {
                if (t && !kc.some((k) => k.name === t)) setR((x) => ({ ...x, oberthema: t }))
              }}
              clearable
              data-reihe-oberthema
            />
            {/* Leitfrage (08.10.2026, Reihenmuster): sehen die Lernenden oben in der Reihe */}
            <LeitfrageFeld wert={r.leitfrage ?? ''} setze={(leitfrage) => setze({ leitfrage })} />
            <LernzieleFeld
              titel="Lernziele der Reihe (sehen die Lernenden oben in der Reihe)"
              ziele={r.lernziele}
              setze={(l) => setze({ lernziele: l })}
              kc={auszug}
              vorschlagen={() => reihenLernziele(r, { auszug: auszug?.zeilen ?? [], quelle: auszug?.quelle ?? '' }, ki)}
              ichKann={(z) => ichKannFormulieren(r, z, ki)}
            />
            <StundenLeiste reihe={r} setze={setze} />
            {/* Niveau der Reihe (08.10.2026): Vorgabe für Planung und alle Schritte */}
            {!planung && <NiveauWahl niveau={r.niveau} setze={(n) => setze({ niveau: n })} />}
            {(r.planHinweis?.trim() || r.schritte.length > 0) && (
              <Group justify="flex-end" gap="xs">
                {r.planHinweis?.trim() && <PlanHinweis text={r.planHinweis} />}
                {r.schritte.length > 0 && (
                  <Button size="xs" variant="subtle" color="gray" leftSection={<IconChevronUp size={14} />} onClick={() => setKopfOffen(false)} data-reihe-kopf-zu>
                    Einklappen
                  </Button>
                )}
              </Group>
            )}
          </Stack>
        </Card>
        )}

        <Group justify="space-between">
          <Group gap="sm">
            <Text fw={700}>{planung ? 'Stunden' : 'Schritte'}</Text>
            {experte && !planung && (r.stunden?.length ?? 0) > 0 && (
              <SegmentedControl
                size="xs"
                value={ansicht}
                onChange={(v) => {
                  const a = v as 'stunden' | 'teile'
                  setAnsichtWahl(a)
                  merkeAnsicht(a)
                }}
                data={[
                  { value: 'stunden', label: 'Stunden' },
                  { value: 'teile', label: 'Teile' }
                ]}
                data-reihe-ansicht
              />
            )}
          </Group>
          <Group gap="xs">
            <AllePlatzhalterKnopf reihe={r} speichernVorher={speichernVorher} />
            <Button variant="light" color="grape" leftSection={<IconBook size={16} />} onClick={() => setAusBuch(true)} data-reihe-aus-buch-knopf>
              Aus Schulbuch
            </Button>
            <Button
              variant="light"
              color="grape"
              leftSection={<IconSparkles size={16} />}
              onClick={() => setPlanen(true)}
              data-reihe-planen
              data-plant={plantGerade || undefined}
            >
              {plantGerade ? 'Plant im Hintergrund …' : 'Mit KI planen'}
            </Button>
            {ansicht === 'teile' && (
              <Button variant="light" leftSection={<IconFolderPlus size={16} />} onClick={teilAnlegen} data-teil-neu>
                Teil hinzufügen
              </Button>
            )}
            <SchrittMenue neu={(a) => neuerSchritt(a)} reiheArt={art} />
          </Group>
        </Group>
        {nichtAmGeraetZahl > 0 && (
          <Alert variant="light" color="orange" icon={<IconAlertTriangle size={16} />} data-nicht-am-geraet-hinweis>
            {nichtAmGeraetZahl === 1 ? 'Ein Schritt „Im Unterricht“ geht' : `${nichtAmGeraetZahl} Schritte „Im Unterricht“ gehen`} in einer digitalen Reihe nicht am
            Gerät – bitte durch eine Aufgabe ersetzen (markiert mit „nicht am Gerät“) oder die Art der Reihe auf „Gemischt“ ändern.
          </Alert>
        )}
        {/* Zugewiesene Reihe (08.10.2026): Speichern ändert nur den Entwurf – erst „Für Lernende aktualisieren" zeigt ihn */}
        {!planung && veroeff && veroeff.zugewiesen > 0 && veroeff.offen > 0 && (
          <Alert variant="light" color="blue" icon={<IconRefresh size={16} />} data-unveroeffentlicht={veroeff.offen}>
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm">
                {veroeff.offen === 1 ? '1 Änderung ist' : `${veroeff.offen} Änderungen sind`} noch nicht bei den Lernenden – sie sehen den Stand
                {veroeff.am ? ` vom ${new Date(veroeff.am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : ' der Zuweisung'}.
              </Text>
              <Button size="xs" loading={veroeffLaeuft} onClick={() => void veroeffentlichen()} data-fuer-lernende-aktualisieren>
                Für Lernende aktualisieren
              </Button>
            </Group>
          </Alert>
        )}
        {planBereit && !planen && (
          <Alert variant="light" color="grape" data-plan-bereit>
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm">
                Der KI-Plan ist fertig: {planBereit.plan.schritte.length} Schritte in {planBereit.plan.teile.length} Teilen – ansehen und übernehmen.
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Button size="xs" variant="subtle" color="gray" onClick={() => r.id && usePlaene.getState().verwerfe(r.id)} data-plan-verwerfen>
                  Verwerfen
                </Button>
                <Button size="xs" color="grape" onClick={() => setPlanen(true)} data-plan-ansehen>
                  Ansehen
                </Button>
              </Group>
            </Group>
          </Alert>
        )}
        {!planung && r.schritte.length === 0 && teile.length === 0 && (
          <Text c="dimmed" size="sm">
            Noch keine Schritte. Am schnellsten: „Aus Schulbuch“ – Seiten der Einheit hochladen, die KI plant daraus. Oder von Hand, zum Beispiel: Teil 1
            „Grundlagen“ mit Eingangsdiagnose → Arbeitsblatt → Lernkarten, Teil 2 „Anwenden“ mit Zwischenaufgabe → Test → Selbsteinschätzung. Schritte lassen
            sich mit der Maus in einen anderen Teil ziehen.
          </Text>
        )}
        {ansicht === 'planung' && (
          <Stack gap="sm" data-planung-ansicht>
            {(r.stunden?.length ?? 0) === 0 && <PlanungOhneStunden leiste={<StundenLeiste reihe={r} setze={setze} />} />}
            {(r.stunden?.length ?? 0) > 0 && <StundenTermine reihe={r} setze={setze} />}
            {(r.stunden ?? []).map((_, i) => (
              <PlanungsStunde
                key={i}
                reihe={r}
                stunde={i}
                setze={setze}
                speichernVorher={speichernVorher}
                materialNeu={<SchrittMenue neu={(a) => neuerSchritt(a, undefined, i)} reiheArt={art} klein label="Material hinzufügen" />}
                material={
                  <Stack gap={6}>
                    {r.schritte
                      .filter((s) => s.stunde === i)
                      .map((s) => (
                        <SchrittKarte key={s.id} {...karte(s)} teileAnsicht={false} />
                      ))}
                  </Stack>
                }
              />
            ))}
            {r.schritte.some(ohneStunde) && (
              <Paper withBorder radius="md" p="sm" data-planung-ohne-stunde>
                <Text fw={700} mb={6}>
                  Material ohne Stunde
                </Text>
                <Stack gap={6}>
                  {r.schritte.filter(ohneStunde).map((s) => (
                    <SchrittKarte key={s.id} {...karte(s)} teileAnsicht={false} />
                  ))}
                </Stack>
              </Paper>
            )}
          </Stack>
        )}
        {ansicht === 'stunden' && (
          <Stack gap="sm" data-stunden-ansicht>
            <StundenTermine reihe={r} setze={setze} />
            {stundenGruppen(r).map((g) => (
              <Paper
                key={g.stunde ?? 'ohne'}
                withBorder
                radius="md"
                p="sm"
                bg="var(--mantine-color-default-hover)"
                data-stunde-gruppe={g.stunde ?? ''}
                data-ueberlang={g.ueberlang || undefined}
                // Schritte in eine Stunde ziehen (08.10.2026) – auch in eine leere
                onDragOver={(e) => {
                  if (!gezogen) return
                  e.preventDefault()
                  setUeber(`stunde:${g.stunde ?? ''}`)
                }}
                onDragLeave={() => setUeber((u) => (u === `stunde:${g.stunde ?? ''}` ? null : u))}
                onDrop={(e) => {
                  e.preventDefault()
                  if (gezogen) schrittAendern(gezogen, { stunde: g.stunde ?? undefined })
                  setGezogen(null)
                  setUeber(null)
                }}
                style={{ outline: ueber === `stunde:${g.stunde ?? ''}` ? '2px dashed var(--mantine-color-blue-5)' : undefined }}
              >
                <Group justify="space-between" mb={6} wrap="nowrap">
                  <Text fw={700}>{stundenTitel(g, g.stunde === null ? null : stundenDaten(r)[g.stunde])}</Text>
                  {experte && g.stunde !== null && (
                    <Group gap={4} wrap="nowrap" data-stunde-summe>
                      {g.ueberlang && <IconAlertTriangle size={14} color="var(--mantine-color-red-6)" />}
                      <Text size="xs" c={g.ueberlang ? 'red' : 'dimmed'}>
                        {g.summe} von {g.laenge} min verplant{g.ueberlang ? ' – mehr, als die Stunde hat' : ''}
                      </Text>
                    </Group>
                  )}
                </Group>
                <Stack gap={6}>
                  {g.zeilen.length === 0 && g.stunde !== null && (
                    // Leere Stunde (08.10.2026): gleich etwas anlegen oder hierher holen – oder eine Karte hineinziehen
                    <Group justify="center" gap="xs" py={4} data-stunde-leer>
                      <SchrittMenue neu={(a) => neuerSchritt(a, undefined, g.stunde!)} reiheArt={art} klein label="Schritt hier anlegen" />
                      <SchrittHolen
                        schritte={r.schritte.filter((x) => x.stunde !== g.stunde)}
                        nummer={nummer}
                        holen={(id) => schrittAendern(id, { stunde: g.stunde! })}
                      />
                    </Group>
                  )}
                  {g.zeilen.map(({ schritt: s, teil, teilWechsel }) => (
                    <Stack key={s.id} gap={4}>
                      {teilWechsel && (
                        <Group gap={4} mt={2} data-teil-ueberschrift={teil}>
                          <IconMedal size={13} color="var(--mantine-color-yellow-6)" />
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            {teil}
                          </Text>
                        </Group>
                      )}
                      {halteZeile(s)}
                      <SchrittKarte
                        {...karte(s)}
                        teileAnsicht={false}
                        rahmen={{
                          draggable: true,
                          onDragStart: (e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', s.id)
                            setGezogen(s.id)
                          },
                          onDragEnd: () => {
                            setGezogen(null)
                            setUeber(null)
                          },
                          style: { cursor: 'grab', opacity: gezogen === s.id ? 0.4 : 1 }
                        }}
                      />
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
        {ansicht === 'teile' &&
          [undefined, ...teile].map((teil) => {
          const schritte = r.schritte.filter((x) => (teil ? x.abschnitt === teil : !x.abschnitt || !teile.includes(x.abschnitt)))
          if (!teil && !schritte.length) return null
          const zielKennung = `teil:${teil ?? ''}`
          return (
            <Paper
              key={teil ?? '__ohne'}
              withBorder={Boolean(teil)}
              p={teil ? 'sm' : 0}
              radius="md"
              bg={teil ? 'var(--mantine-color-default-hover)' : undefined}
              data-teil={teil ?? ''}
              onDragOver={(e) => {
                if (!gezogen) return
                e.preventDefault()
                setUeber(zielKennung)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (gezogen && ueber === zielKennung) verschiebeNach(gezogen, teil, null)
                setGezogen(null)
                setUeber(null)
              }}
              style={{ outline: ueber === zielKennung ? '2px dashed var(--mantine-color-blue-5)' : undefined }}
            >
              {teil && (
                <TeilKopf
                  name={teil}
                  abzeichen
                  erster={teile[0] === teil}
                  letzter={teile[teile.length - 1] === teil}
                  umbenennen={(n) => teilUmbenennen(teil, n)}
                  hoch={() => teilVerschieben(teil, -1)}
                  runter={() => teilVerschieben(teil, 1)}
                  loeschen={() => teilLoeschen(teil)}
                  neu={(a) => neuerSchritt(a, teil)}
                  reiheArt={art}
                />
              )}
              <Stack gap={6} mt={teil ? 'xs' : 0}>
                {teil && schritte.length === 0 && (
                  <Text size="xs" c="dimmed" ta="center" py="xs">
                    Noch leer – Schritt hinzufügen oder hierher ziehen.
                  </Text>
                )}
                {schritte.map((s, imTeil) => (
                  <Stack key={s.id} gap={4}>
                    {halteZeile(s)}
                    <SchrittKarte
                      {...karte(s)}
                      teileAnsicht
                      hoch={imTeil > 0 ? () => verschiebe(s.id, -1) : undefined}
                      runter={imTeil < schritte.length - 1 ? () => verschiebe(s.id, 1) : undefined}
                      rahmen={{
                        draggable: true,
                        onDragStart: (e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', s.id)
                          setGezogen(s.id)
                        },
                        onDragEnd: () => {
                          setGezogen(null)
                          setUeber(null)
                        },
                        onDragOver: (e) => {
                          if (!gezogen || gezogen === s.id) return
                          e.preventDefault()
                          e.stopPropagation()
                          setUeber(s.id)
                        },
                        onDrop: (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (gezogen) verschiebeNach(gezogen, s.abschnitt && teile.includes(s.abschnitt) ? s.abschnitt : undefined, s.id)
                          setGezogen(null)
                          setUeber(null)
                        },
                        style: {
                          cursor: 'grab',
                          opacity: gezogen === s.id ? 0.4 : 1,
                          borderTop: ueber === s.id ? '3px solid var(--mantine-color-blue-5)' : undefined
                        }
                      }}
                    />
                  </Stack>
                ))}
              </Stack>
            </Paper>
          )
        })}
        {teile.length > 0 && !planung && (
          <Text size="xs" c="dimmed">
            Abzeichen gibt es für jeden geschafften Teil: {teile.join(', ')}.
          </Text>
        )}
        <NurExperte geaendert={Boolean(r.optionalMindestens) && 'Mindestzahl optionaler Schritte'}>
          {anzahlOptional > 0 && (
            <Group gap="xs" data-optional-mindestens>
              <Text size="sm">Die Reihe ist abgeschlossen, wenn alle Pflichtschritte und mindestens</Text>
              <NumberInput
                size="xs"
                w={70}
                min={0}
                max={anzahlOptional}
                value={Math.min(anzahlOptional, r.optionalMindestens ?? 0)}
                onChange={(v) => setze({ optionalMindestens: Math.max(0, Math.min(anzahlOptional, Number(v) || 0)) })}
                aria-label="Mindestens optionale Schritte"
              />
              <Text size="sm">von {anzahlOptional} optionalen Schritten geschafft sind.</Text>
            </Group>
          )}
        </NurExperte>
        {bearbeiten && (
          <SchrittBearbeiten
            reihe={r}
            schritt={bearbeiten}
            schliessen={() => setBearbeiten(null)}
            teile={teile}
            speichern={(s) => {
              const da = r.schritte.some((x) => x.id === s.id)
              setzeSchritte(
                // Bearbeitet und übernommen = geprüft: Marke „KI-Entwurf" entfällt (08.10.2026)
                // „bitte ersetzen" (aus der Planung) entfällt ebenso
                da
                  ? r.schritte.map((x) => (x.id === s.id ? { ...s, kiEntwurf: undefined, ersetzen: undefined } : x))
                  : [...r.schritte, { ...s, ...(neuIn && !s.abschnitt ? { abschnitt: neuIn } : {}) }]
              )
              setBearbeiten(null)
            }}
          />
        )}
        {zuweisen && r.id && !planung && <Zuweisen reiheId={r.id} reihe={r} schliessen={() => setZuweisen(false)} />}
        {testHier && <TestFenster reihe={r} nach={testHier.nach} ziel={testHier.ziel} einfuegen={testEinfuegen} schliessen={() => setTestHier(null)} />}
        {planen && (
          <PlanenFenster
            // Kommt der Plan, während das Fenster offen ist, gleich die Vorschau zeigen
            key={planBereit?.fertig ?? 'formular'}
            reihe={r}
            kc={{ auszug: auszug?.zeilen ?? [], quelle: auszug?.quelle ?? '' }}
            schliessen={() => setPlanen(false)}
            uebernehmen={planUebernehmen}
            setzeStunden={setze}
            setzeNiveau={(niveau) => setze({ niveau })}
            setzeReihentyp={(reihentyp) => setze({ reihentyp })}
            speichernVorher={async () => (geaendert || !r.id ? await speichern() : r)}
            ergebnis={planBereit}
          />
        )}
        {ausBuch && (
          <ReiheAusSchulbuch
            reihe={r}
            kc={{ auszug: auszug?.zeilen ?? [], quelle: auszug?.quelle ?? '' }}
            schliessen={() => setAusBuch(false)}
            uebernehmen={buchUebernehmen}
          />
        )}
        {vorschau && <Vorschau reihe={r} schliessen={() => setVorschau(false)} />}
        <AlleOptionen />
      </Stack>
    </OptionenBereich>
  )
}

function Zuweisen({ reiheId, reihe, schliessen }: { reiheId: string; reihe: Reihe; schliessen: () => void }): React.JSX.Element {
  const [art, setArt] = useState<'gruppe' | 'einzeln' | 'gaeste'>('gruppe')
  // Gäste per QR-Code (05.10.2026): zusätzlich zu Lerngruppe/Einzelnen oder allein
  const [mitGaesten, setMitGaesten] = useState(false)
  // Planen mit optionalem Ende (09.10.2026)
  const [plan, setPlan] = useState<PlanWahl>(planStart)
  const [qr, setQr] = useState<{ code: string; link: string } | null>(null)
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [gruppe, setGruppe] = useState<string | null>(null)
  // Mitglieder aller eigenen Lerngruppen (für „einzelne Lernende" – auch aus verschiedenen Gruppen)
  const [alle, setAlle] = useState<{ gruppe: string; gruppeId: string; benutzer: string; name: string }[]>([])
  const [einzelne, setEinzelne] = useState<string[]>([])
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then(
      async (d) => {
        setGruppen(d.gruppen)
        const listen = await Promise.all(
          d.gruppen.map((g) =>
            holen<{ mitglieder: { benutzer: string; name: string }[] }>(`/server/feedback/mitglieder?gruppe=${encodeURIComponent(g.id)}`).then(
              (m) => m.mitglieder.map((x) => ({ ...x, gruppe: g.name, gruppeId: g.id })),
              () => []
            )
          )
        )
        setAlle(listen.flat())
      },
      () => setGruppen([])
    )
  }, [])
  const inGruppe = alle.filter((m) => m.gruppeId === gruppe)
  // Einzelne Lernende: alle Schülerkonten der Schule, nach Klasse (03.10.2026)
  const alleLernenden = useAlleLernenden()
  if (qr)
    return (
      <Modal opened onClose={schliessen} title="Reihe für Gäste – QR-Code" size="lg">
        <Stack>
          <Text size="sm" c="dimmed">
            Gäste scannen den Code, geben Vorname und Anfangsbuchstaben ein und bearbeiten die Reihe digital – alle Arbeitsblätter und Aufgaben der Reihe sind
            für sie mit freigegeben. Lernende mit Konto kommen über denselben Code hinein.
          </Text>
          <Zugang code={qr.code} link={qr.link} />
        </Stack>
      </Modal>
    )
  const gaesteAn = art === 'gaeste' || mitGaesten
  return (
    <Modal opened onClose={schliessen} title="Reihe zuweisen" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Die Lernenden finden die Reihe auf ihrer Startseite unter „Unterrichtsreihen“. Arbeitsblätter, Tests und Aufgaben der Reihe werden dabei für sie
          freigegeben.
        </Text>
        {/* Noch ungeprüfte KI-Entwürfe (08.10.2026) – zuweisen bleibt möglich */}
        <ZuweisenHinweis reihe={reihe} />
        <SegmentedControl
          value={art}
          onChange={(v) => {
            setArt(v as 'gruppe' | 'einzeln' | 'gaeste')
            setEinzelne([])
          }}
          data={[
            { value: 'gruppe', label: 'Lerngruppe' },
            { value: 'einzeln', label: 'Einzelne Lernende' },
            { value: 'gaeste', label: 'Gäste per QR-Code' }
          ]}
          data-zuweisen-art
        />
        {art === 'gruppe' ? (
          <>
            <Select
              label="Lerngruppe"
              data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
              value={gruppe}
              onChange={(v) => (setGruppe(v), setEinzelne([]))}
              placeholder="wählen …"
              data-zuweisen-gruppe
            />
            <NurExperte>
              {gruppe && (
                <MultiSelect
                  label="Nur für einzelne aus der Lerngruppe"
                  description="Leer = die ganze Lerngruppe (auch wer später dazukommt)."
                  data={inGruppe.map((m) => ({ value: m.benutzer, label: m.name }))}
                  value={einzelne}
                  onChange={setEinzelne}
                  searchable
                  clearable
                  placeholder="alle"
                />
              )}
            </NurExperte>
          </>
        ) : art === 'gaeste' ? (
          <Text size="sm">
            Nach dem Zuweisen erscheint ein QR-Code mit Link. Gäste geben nur Vorname und Anfangsbuchstaben des Nachnamens ein; Lernende mit Konto kommen über
            denselben Code dazu.
          </Text>
        ) : (
          <MultiSelect
            label="Lernende"
            description="Alle Schülerkonten der Schule, nach Klasse – zum Beispiel für eine Förder- oder Fordergruppe."
            data={alleLernenden.daten}
            value={einzelne}
            onChange={setEinzelne}
            searchable
            clearable
            nothingFoundMessage="Kein Schülerkonto mit diesem Namen"
            placeholder={alleLernenden.geladen && !alleLernenden.anzahl ? 'Noch keine Schülerkonten angelegt' : 'Namen suchen …'}
            data-zuweisen-einzelne
          />
        )}
        <NurExperte>
          {art !== 'gaeste' && (
            <Checkbox
              label="Zusätzlich Gäste per QR-Code zulassen"
              checked={mitGaesten}
              onChange={(e) => setMitGaesten(e.currentTarget.checked)}
              data-zuweisen-gaeste
            />
          )}
        </NurExperte>
        <FreigabePlanen wert={plan} aendern={setPlan} mitEnde endeText="Danach lässt sich die Reihe nur noch ansehen – keine neuen Abgaben." />
        <Group justify="flex-end" className="dialog-fuss">
          <Button
            loading={laeuft}
            disabled={art === 'gaeste' ? false : art === 'gruppe' ? !gruppe : !einzelne.length}
            onClick={() => {
              setLaeuft(true)
              void senden<{ id: string; code?: string; link?: string }>(`/server/reihen/${reiheId}/zuweisen`, {
                lerngruppeId: art === 'gruppe' ? gruppe : '',
                schueler: art === 'gaeste' ? [] : einzelne,
                gaeste: gaesteAn,
                ...planKoerper(plan, { mitEnde: true })
              })
                .then((r) => {
                  planGeaendert()
                  notifySuccess(planMeldung(plan, 'Unterrichtsreihe') || 'Zugewiesen.')
                  if (r.code && r.link) setQr({ code: r.code, link: r.link })
                  else schliessen()
                })
                .catch((e: unknown) => notifyError(e))
                .finally(() => setLaeuft(false))
            }}
            data-zuweisen-los
          >
            {planKnopf(plan, 'Zuweisen')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Menü „Schritt hinzufügen" (oben und in jedem Teil) */
function SchrittMenue({
  neu,
  klein,
  reiheArt = 'gemischt',
  label = 'Schritt hinzufügen'
}: {
  neu: (art: SchrittArt) => void
  klein?: boolean
  /** Digital: kein „Im Unterricht" (nicht am Gerät); Planung: das steht als Phase im Verlauf (08.10.2026) */
  reiheArt?: ReiheArt
  label?: string
}): React.JSX.Element {
  return (
    <Menu position="bottom-end" width={360}>
      <Menu.Target>
        <Button size={klein ? 'xs' : 'sm'} variant={klein ? 'subtle' : 'filled'} leftSection={<IconPlus size={klein ? 14 : 16} />} data-schritt-neu>
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {SCHRITT_ARTEN.filter((a) => reiheArt === 'gemischt' || a.id !== 'praesenz').map((a) => (
          <Menu.Item key={a.id} onClick={() => neu(a.id)} data-schritt-art={a.id}>
            <Text size="sm" fw={600}>
              {a.label}
            </Text>
            <Text size="xs" c="dimmed">
              {a.text}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

/** „Schritt hierher verschieben" (08.10.2026): Auswahl unter den Schritten anderer Stunden für eine leere Stunde */
function SchrittHolen({
  schritte,
  nummer,
  holen
}: {
  schritte: Schritt[]
  nummer: Map<string, number>
  holen: (id: string) => void
}): React.JSX.Element | null {
  if (!schritte.length) return null
  return (
    <Menu position="bottom" width={340} withinPortal>
      <Menu.Target>
        <Button size="xs" variant="subtle" leftSection={<IconArrowsMove size={14} />} data-schritt-holen>
          Schritt hierher verschieben
        </Button>
      </Menu.Target>
      <Menu.Dropdown mah={360} style={{ overflowY: 'auto' }}>
        {schritte.map((x) => (
          <Menu.Item key={x.id} onClick={() => holen(x.id)} data-schritt-holen-wahl={x.id}>
            <Text size="sm" truncate>
              {nummer.get(x.id) ?? ''}. {x.titel || '(ohne Titel)'}
            </Text>
            <Text size="xs" c="dimmed">
              {x.stunde !== undefined ? `jetzt in Stunde ${x.stunde + 1}` : 'ohne Stunde'}
              {x.minuten ? ` · ${x.minuten} min` : ''}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

/** Kopf eines Teils: Name (bearbeitbar), verschieben, löschen, Schritt hinzufügen */
function TeilKopf(p: {
  name: string
  abzeichen?: boolean
  erster: boolean
  letzter: boolean
  umbenennen: (n: string) => void
  hoch: () => void
  runter: () => void
  loeschen: () => void
  neu: (art: SchrittArt) => void
  reiheArt?: ReiheArt
}): React.JSX.Element {
  const [text, setText] = useState(p.name)
  useEffect(() => setText(p.name), [p.name])
  return (
    <Group justify="space-between" wrap="nowrap">
      <Group gap={6} wrap="nowrap" style={{ flex: 1 }}>
        {p.abzeichen && <IconMedal size={18} color="var(--mantine-color-yellow-6)" />}
        <TextInput
          variant="unstyled"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onBlur={() => (text.trim() ? p.umbenennen(text) : setText(p.name))}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          styles={{ input: { fontWeight: 700, fontSize: 'var(--mantine-font-size-md)' } }}
          style={{ flex: 1 }}
          aria-label="Name des Teils"
          data-teil-name
        />
      </Group>
      <Group gap={2} wrap="nowrap">
        <SchrittMenue neu={p.neu} klein reiheArt={p.reiheArt} />
        <ActionIcon variant="subtle" onClick={p.hoch} disabled={p.erster} aria-label="Teil nach oben">
          <IconArrowUp size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" onClick={p.runter} disabled={p.letzter} aria-label="Teil nach unten">
          <IconArrowDown size={16} />
        </ActionIcon>
        <Tooltip label="Teil löschen (die Schritte bleiben, ohne Teil)">
          <ActionIcon variant="subtle" color="red" onClick={p.loeschen} aria-label="Teil löschen">
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  )
}

/**
 * „Ablauf testen" (03.10.2026 als „Als Schüler ansehen", Idee aus LearningView; seit 08.10.2026 nur im Expertenmodus –
 * die echte Schülerseite öffnet ReiheVorschau.tsx): der Weg, wie ihn Lernende sehen – mit
 * simulierten Ergebnissen, um Freischaltung, Haltepunkte, Wahl- und Förderschritte zu prüfen.
 * Nichts wird gespeichert.
 */
function Vorschau({ reihe, schliessen }: { reihe: Reihe; schliessen: () => void }): React.JSX.Element {
  const [stand, setStand] = useState<Stand>({ schritte: {} })
  const [extern, setExtern] = useState<Record<string, Extern>>({})
  const [frei, setFrei] = useState<string[]>([])
  const weg = berechneWeg(reihe, stand, extern, frei)
  const simuliere = (s: Schritt, ok: boolean): void => {
    const verknuepft = ['arbeitsblatt', 'rueckmeldung', 'onlinetest', 'vokabeln'].includes(s.inhalt.art)
    if (verknuepft) setExtern({ ...extern, [s.id]: { eingereicht: 9, runden: 9, kriterien: [ok ? 'sicher' : 'noch nicht'], prozent: ok ? 100 : 0 } })
    else
      setStand({
        ...stand,
        schritte: { ...stand.schritte, [s.id]: ok ? { hand: 'geschafft' } : { eingereicht: 9, bewertung: { text: '', geschafft: false, zeit: 0 } } }
      })
  }
  return (
    <Modal opened onClose={schliessen} title={`Ablauf testen: ${reihe.titel}`} size="lg">
      <Stack gap="xs" data-vorschau>
        <Text size="sm" c="dimmed">
          So sieht der Weg für Lernende aus. Mit den Knöpfen simulierst du Ergebnisse – gespeichert wird nichts.
        </Text>
        <Progress value={weg.fortschritt * 100} size="lg" radius="xl" />
        {weg.optional && (
          <Text size="xs" c="dimmed" data-vorschau-optional>
            {weg.optional.geschafft} von {weg.optional.gesamt} optionalen geschafft
            {weg.optional.noetig ? ` · ${weg.optional.noetig} nötig für den Abschluss` : ''}
            {weg.fertig ? ' · Reihe abgeschlossen' : ''}
          </Text>
        )}
        {reihe.lernziele.length > 0 && (
          <Text size="sm">
            <b>Am Ende der Reihe:</b> {reihe.lernziele.map((l) => l.ichKann || l.text).join(' · ')}
          </Text>
        )}
        {reihe.schritte.map((s, i) => {
          const l = weg.schritte[i]
          if (s.rolle === 'foerder' && l.status === 'gesperrt') return null
          return (
            <Paper key={s.id} withBorder p="xs" radius="md" style={{ opacity: l.status === 'gesperrt' ? 0.6 : 1 }} data-vorschau-station={l.status}>
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={600} size="sm">
                    {l.status === 'geschafft' ? '✓ ' : l.status === 'gesperrt' ? '🔒 ' : l.status === 'uebersprungen' ? '» ' : `${i + 1}. `}
                    {s.titel}
                    {s.rolle === 'foerder'
                      ? ' (Übung)'
                      : s.rolle === 'forder'
                      ? ' ★'
                      : s.rolle === 'wahl'
                      ? ' (Wahl)'
                      : s.rolle === 'optional'
                      ? ' (optional)'
                      : ''}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {l.status}
                    {l.hinweis ? ` – ${l.hinweis}` : ''}
                  </Text>
                </div>
                <Group gap={4} wrap="nowrap">
                  {s.halt?.art === 'freigabe' && !frei.includes(s.id) && (
                    <Button size="compact-xs" variant="light" onClick={() => setFrei([...frei, s.id])}>
                      Haltepunkt frei
                    </Button>
                  )}
                  {l.status !== 'gesperrt' && l.status !== 'geschafft' && (
                    <>
                      <Button size="compact-xs" color="green" onClick={() => simuliere(s, true)} data-vorschau-geschafft>
                        geschafft
                      </Button>
                      <Button size="compact-xs" color="orange" variant="light" onClick={() => simuliere(s, false)}>
                        nicht geschafft
                      </Button>
                    </>
                  )}
                </Group>
              </Group>
            </Paper>
          )
        })}
        <Group justify="space-between">
          <Text size="sm">{weg.abzeichen.length ? `Abzeichen: ${weg.abzeichen.join(', ')}` : ''}</Text>
          <Button variant="subtle" onClick={() => (setStand({ schritte: {} }), setExtern({}), setFrei([]))}>
            Zurücksetzen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
