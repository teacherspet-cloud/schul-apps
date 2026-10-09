/**
 * Handlungsbedarf der Sprachkurse in „Meine Klassen" (09.10.2026, eine Quelle mit der Kursseite – shared/kursHinweise.ts):
 * Die Einträge der Kurse kommen vom Server; dazu hier die Grammatik-Entwürfe dieses Geräts (liegen nur lokal, lassen
 * sich daher nicht ausblenden). Ein Klick bleibt in „Meine Klassen": passender Reiter (Grammatik → „Grammatik") und
 * Sprung an die Stelle (kursFokus.ts).
 */
import { useEntwuerfe } from '../lernen/GrammatikTraining'
import { zumHinweis } from '../lernen/kurs/kursFokus'
import { entwurfHinweis, klassenReiterFuer, kursBedarf, type KursBedarf } from '../lernen/kurs/kursHinweise'
import type { KursReiter } from '../lernen/kurs/kursDaten'

/** Eintrag eines Kurses, wie ihn der Client sieht (ohne Merkmal); `lokal` = nur in diesem Gerät (Entwürfe) */
export type KursEintrag = Omit<KursBedarf, 'merkmal'> & { lokal?: boolean }

/** Entwürfe zum Prüfen je Kurs der Lerngruppe – gleicher Wortlaut wie auf der Kursseite */
export function useEntwurfBedarf(kurse: { id: string; titel: string; kursName?: string; status?: string }[]): KursEintrag[] {
  const entwuerfe = useEntwuerfe()
  const je = kurse
    .map((k) => ({ k, h: entwurfHinweis(entwuerfe.filter((e) => e.empfaenger.vokId === k.id).length) }))
    .filter((x) => x.h)
  return je.flatMap(({ k, h }) =>
    kursBedarf({ id: k.id, name: je.length > 1 ? k.kursName || k.titel : undefined }, [h!]).map(({ merkmal: _m, ...b }) => ({ ...b, lokal: true }))
  )
}

/** Klick auf einen Kurs-Eintrag: Reiter in „Meine Klassen" wählen und an die Stelle springen. false = kein Kurs-Eintrag */
export function kursEintragOeffnen(b: Partial<Pick<KursEintrag, 'kurs' | 'reiter' | 'hinweis' | 'ids'>>, setzeReiter: (r: string) => void): boolean {
  if (!b.kurs || !b.reiter || !b.hinweis) return false
  setzeReiter(klassenReiterFuer({ reiter: b.reiter, hinweis: b.hinweis }))
  zumHinweis({ kurs: b.kurs, hinweis: b.hinweis, reiter: b.reiter as KursReiter, ids: b.ids })
  return true
}
