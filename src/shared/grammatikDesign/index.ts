/**
 * Übungsdesign je Grammatikform (28.10.2026, Grammatik-Neubeginn): Ausarbeitung aller 119 englischen Formen nach
 * Recherche (Fachdidaktik, Übungsseiten wie ego4u, Lingolia, englisch-hilfen, British Council, levrai, Spotlight) – wo
 * Lücken uneindeutig werden, womit sie eindeutig werden, wie viel Kontext nötig ist, welche Formate je Etappe passen,
 * dazu geprüfte Beispiele. Geht als Vorgabe in den KI-Auftrag (grammatikBankErzeugen.ts). Weitere Sprachen folgen.
 * Die Daten werden erst beim Erzeugen geladen (eigener Baustein, kein Gewicht für die übrige Oberfläche).
 */
export interface FormDesign {
  kern: string
  kontext: string
  kontextWarum: string
  eindeutig: string[]
  vermeiden: string[]
  etappen: Partial<Record<'erkennen' | 'bilden' | 'anwenden' | 'profi' | 'bonus', string[]>>
  beispiele: { etappe?: string; format?: string; anweisung?: string; aufgabe?: string; loesungen?: string[] }[]
  teilformen: Record<string, string>
}

/** Design einer Form (Kennung „en.verb.present_perfect“; eine Teilform-Kennung „…/since-for“ geht auch) */
export async function designFuer(kennung: string): Promise<{ design: FormDesign; teil: string } | null> {
  const [thema, teil = ''] = kennung.split('/')
  if (!thema.startsWith('en.')) return null
  const daten = (await import('./englisch.json')).default as unknown as Record<string, FormDesign>
  const design = daten[thema]
  return design ? { design, teil } : null
}

/** Als Text für den KI-Auftrag */
export function designText(d: { design: FormDesign; teil: string }): string {
  const x = d.design
  const zeilen = [
    'ÜBUNGSDESIGN FÜR DIESE FORM (aus der Recherche – verbindlich):',
    `Worauf es ankommt: ${x.kern}`,
    `Kontext: ${x.kontext}${x.kontextWarum ? ` – ${x.kontextWarum}` : ''}`,
    x.eindeutig.length ? `Eindeutig machen: ${x.eindeutig.join(' | ')}` : '',
    x.vermeiden.length ? `Vermeiden: ${x.vermeiden.join(' | ')}` : '',
    ...Object.entries(x.etappen).map(([e, l]) => `Formate ${e}: ${(l ?? []).join(' | ')}`),
    d.teil && x.teilformen[d.teil] ? `Diese Teilform: ${x.teilformen[d.teil]}` : '',
    x.beispiele.length ? 'Beispiele (Stil und Eindeutigkeit, nicht wiederholen):' : '',
    ...x.beispiele.map((b) => `- [${b.etappe} · ${b.format}] ${b.anweisung ?? ''} ${String(b.aufgabe ?? '').replace(/\s+/g, ' ')} → ${(b.loesungen ?? []).join(' | ')}`)
  ]
  return zeilen.filter(Boolean).join('\n')
}
