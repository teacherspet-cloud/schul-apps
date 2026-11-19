// Seiten vor dem PDF einpassen (19.11.2026, shared/seitenEinpassen.ts): Befund „Welcome to my home!" – im Server-PDF
// stand die Wortzahl im Fuß, die letzte Zeile auf der Trennlinie (andere Schrift als im Browser der Lehrkraft).
// Nachgestellt mit einer Seite, deren Inhalt in den Fuß ragt: danach endet alles über dem Fuß, nichts verschwindet,
// und eine passende Seite bleibt unberührt.
// Aufruf: npx tsx tests/e2e/pdf-einpassen.mts
import { chromium } from 'playwright-core'
import { seitenEinpassen } from '../../src/shared/seitenEinpassen'

const seite = (absaetze: number): string => `
<div class="ws-page"><div class="ws-content" style="left:15mm;right:15mm;top:15mm;bottom:12mm">
  <div class="ws-body"><div class="ws-block" style="break-inside:avoid">
    ${Array.from({ length: absaetze }, (_, i) => `<p>Absatz ${i + 1}: Maya lives in a flat with her mum. Her brother Sam lives there too. The flat is small, but she likes it.</p>`).join('')}
    <div class="ws-wortzahl">(219 Wörter)</div>
  </div></div>
  <footer class="ws-footer">Seite</footer>
</div></div>`
const html = `<!doctype html><html><head><style>
@page { size: A4; margin: 0 } body { margin: 0; font: 13pt/1.3 Verdana, sans-serif }
.ws-page { position: relative; box-sizing: border-box; width: 210mm; height: 297mm; overflow: clip; break-after: page }
.ws-content { position: absolute; display: flex; flex-direction: column }
.ws-body { flex: 1; min-height: 0; overflow: clip; padding-top: 4mm; position: relative }
.ws-footer { border-top: 0.3mm solid #999; padding-top: 1.5mm; font-size: 0.7em }
.ws-wortzahl { text-align: right }
</style></head><body>${seite(16)}${seite(4)}</body></html>`

const b = await chromium.launch({ channel: 'msedge' })
const probleme: string[] = []
try {
  const p = await b.newPage({ viewport: { width: 794, height: 1123 } })
  await p.setContent(html)
  await p.emulateMedia({ media: 'print' })
  const abstand = (): Promise<number[]> =>
    p.evaluate(() =>
      Array.from(document.querySelectorAll('.ws-page')).map((pg) => {
        const fuss = pg.querySelector('.ws-footer')!.getBoundingClientRect().top
        return Math.round(fuss - pg.querySelector('.ws-wortzahl')!.getBoundingClientRect().bottom)
      })
    )
  const vorher = await abstand()
  if (!(vorher[0] < 0)) probleme.push(`Seite 1 sollte vorher in den Fuß ragen (${vorher[0]})`)
  const ein = (await p.evaluate(`(${seitenEinpassen.toString()})(document)`)) as { seite: number; massstab: number }[]
  const nachher = await abstand()
  if (!(nachher[0] >= 0)) probleme.push(`Seite 1 endet nachher über dem Fuß (${nachher[0]})`)
  if (ein.length !== 1 || ein[0].seite !== 0) probleme.push(`Nur Seite 1 eingepasst (${JSON.stringify(ein)})`)
  if (nachher[1] !== vorher[1]) probleme.push('Seite 2 unverändert')
  // Im PDF steht die Wortzahl noch auf Seite 1 (kein Verschieben auf eine Folgeseite)
  const pdf = Buffer.from(await p.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true })).toString('latin1')
  const seiten = (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  if (seiten !== 2) probleme.push(`PDF mit 2 Seiten (${seiten})`)
  console.log(`Abstand Wortzahl–Fuß vorher ${vorher.join(', ')} px, nachher ${nachher.join(', ')} px; eingepasst ${JSON.stringify(ein)}`)
} finally {
  await b.close()
}
console.log(probleme.length ? `Probleme:\n- ${probleme.join('\n- ')}` : 'Alles in Ordnung.')
process.exit(probleme.length ? 1 : 0)
