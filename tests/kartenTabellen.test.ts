import { describe, expect, it } from 'vitest'
import { beschrifteKartenTabelle } from '../src/renderer/src/shared/touch/kartenTabellen'

/** Übersichtstabellen als Kartenliste am Telefon (07.10.2026): Spaltennamen kommen als data-label an die Zellen */
describe('Kartentabellen', () => {
  it('beschriftet jede Zelle mit ihrer Spalte, auch bei verbundenen Zellen', () => {
    const zelle = () => ({ colSpan: 1, attrs: {} as Record<string, string>, getAttribute(n: string) { return this.attrs[n] ?? null }, setAttribute(n: string, v: string) { this.attrs[n] = v } })
    const z1 = [zelle(), { ...zelle(), colSpan: 2 }, zelle()]
    const t = {
      tHead: { rows: [{ cells: [{ textContent: 'Name' }, { textContent: 'Stand' }, { textContent: 'Fehler' }, { textContent: 'Zuletzt' }] }] },
      tBodies: [{ rows: [{ cells: z1 }] }]
    }
    beschrifteKartenTabelle(t as unknown as HTMLTableElement)
    expect(z1.map((z) => z.attrs['data-label'])).toEqual(['Name', 'Stand', 'Zuletzt'])
  })
})
