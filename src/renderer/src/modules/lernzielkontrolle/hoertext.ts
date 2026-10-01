/**
 * Änderungswunsch an einen Hörtext der Lernzielkontrolle (01.10.2026) – derselbe Ablauf wie im
 * Arbeitsblatt (arbeitsblatt/generation/hoertextWunsch.ts), mit dem Systemauftrag der
 * Lernzielkontrolle. Das Skript ändert sich in jeder Fassung, in der der Hörtext steht; die
 * Aufgaben dazu werden je Fassung angepasst – alles in einem Rückgängig-Schritt.
 */
import { starteAuftrag } from '../../shared/auftraege'
import type { WunschArt } from '../../shared/kiWunsch'
import { notifySuccess } from '../../shared/util'
import { hoertextWunschAusfuehren, wendeHoertextWunschAn } from '../arbeitsblatt/generation/hoertextWunsch'
import { profileFromMeta } from '../arbeitsblatt/render/SheetPages'
import { kurztestPrompt } from './generation/generateKurztest'
import { kurztestOffen, legeKurztestAb } from './library'
import type { Kurztest } from './model/types'
import { worksheetMetaForKurztest } from './render/kurztestWorksheet'

export function hoertextWunschLzk(test: Kurztest, docId: string, audioId: string, art: WunschArt, wunsch: string): void {
  void starteAuftrag({
    moduleId: 'lernzielkontrolle',
    docId,
    titel: test.meta.title.trim() || test.meta.thema.trim() || 'Lernzielkontrolle',
    art: art === 'neu' ? 'Hörtext neu schreiben' : 'Hörtext überarbeiten',
    eingabe: test,
    istOffen: () => kurztestOffen(docId),
    sperrt: false,
    schluessel: audioId,
    fehlerTitel: 'Der Hörtext ließ sich nicht überarbeiten',
    arbeit: async (t, k) => {
      const varianten = t.varianten.map((v, i) => ({ i, v })).filter(({ v }) => v.blocks.some((b) => b.id === audioId))
      const meta = worksheetMetaForKurztest(t)
      const erg = await hoertextWunschAusfuehren({
        listen: varianten.map(({ v }) => v.blocks),
        audioId,
        art,
        wunsch,
        meta,
        profile: profileFromMeta(meta),
        ai: k.ai,
        system: kurztestPrompt(t, varianten[0]?.v.label ?? ''),
        melde: (x) => k.melde(x)
      })
      return { ...erg, varianten: varianten.map(({ i }) => i) }
    },
    abschluss: (erg) => erg.zusammenfassung,
    ablegen: async (erg, t) => {
      await legeKurztestAb(docId, t, (aktuell) => ({
        ...aktuell,
        varianten: aktuell.varianten.map((v, i) => {
          const k = erg.varianten.indexOf(i)
          return k < 0 ? v : { ...v, blocks: wendeHoertextWunschAn(v.blocks, audioId, erg.skript, erg.anpassungen[k]?.bloecke ?? new Map()) }
        })
      }))
      notifySuccess(erg.zusammenfassung)
    }
  })
}
