/**
 * Kennfarben der Materialarten in den Themenbereichen (Paket 10b, 26.09.2026).
 *
 * Wunsch der Lehrkraft: In einem Themenbereich liegen Arbeitsblatt, Lernzielkontrolle,
 * Grammatiktest, Klassenarbeit und Vokabeltest nebeneinander. Die Karten sind deshalb ganz
 * leicht (etwa 5 %) in der Farbe ihres Programms getönt und tragen links einen schmalen
 * Streifen in dieser Farbe; dazu steht das Programmbild an der Karte. Der Programmname
 * erscheint nur als Tooltip – die Farbe soll ordnen, nicht beschriften.
 *
 * Die Farben sind GEDÄMPFTE Fassungen der Programmfarben aus modules/registry.ts (teal,
 * indigo, blue, orange, grape) und stammen aus der Palette von Okabe und Ito (2008), die für
 * Farbfehlsichtige entworfen wurde. BELEGT und geprüft (tests/themenbereiche.test.ts): Auch in
 * der Simulation von Rot-Grün-Schwäche (Deuteranopie, Protanopie) und Blau-Gelb-Schwäche
 * (Tritanopie) nach Machado, Oliveira und Fernandes (2009, Schweregrad 1,0) liegen je zwei
 * Farben mindestens ΔE₀₀ = 10 auseinander. Die Fläche selbst ist bei 5 % Tönung für niemanden
 * deutlich – sie gibt nur den Grundton; unterschieden wird am Streifen und am Programmbild.
 *
 * Dunkelmodus: dieselben Farbtöne; die Tönung ist dort etwas stärker (8 %), weil 5 % auf
 * dunklem Grund nicht mehr zu sehen sind (app.css, `.material-karte`).
 */
export const ART_FARBEN: Record<string, string> = {
  vokabeltest: '#009e73', // Blaugrün (Okabe-Ito „bluish green") – Programmfarbe teal
  arbeitsblatt: '#0072b2', // Blau – Programmfarbe indigo
  lernzielkontrolle: '#56b4e9', // Himmelblau – Programmfarbe blue
  grammatiktest: '#e69f00', // Orange – Programmfarbe orange
  klassenarbeit: '#cc79a7' // Rötliches Violett – Programmfarbe grape
}

/** Kennfarbe einer Materialart (unbekannt: neutrales Grau) */
export const artFarbe = (moduleId: string): string => ART_FARBEN[moduleId] ?? '#868e96'

/**
 * Farbfehlsichtigkeit simulieren (Machado, Oliveira und Fernandes 2009, Schweregrad 1,0) –
 * Matrizen im linearen RGB. Nur für die Prüfung der Kennfarben.
 */
export const FEHLSICHTIGKEIT: Record<'deuteranopie' | 'protanopie' | 'tritanopie', number[][]> = {
  deuteranopie: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881]
  ],
  protanopie: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998]
  ],
  tritanopie: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039]
  ]
}

export function simuliere(hex: string, matrix: number[][]): string {
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const gamma = (v: number): number => {
    const x = Math.min(1, Math.max(0, v))
    return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255)
  }
  const h = hex.replace('#', '')
  const rgb = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16)))
  return `#${matrix
    .map((z) => gamma(z[0] * rgb[0] + z[1] * rgb[1] + z[2] * rgb[2]))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`
}
