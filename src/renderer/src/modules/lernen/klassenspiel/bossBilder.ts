/**
 * Bilder des Boss-Kampfs (17.11.2026): per Bild-KI erzeugt (ChatGPT-Abo der Lehrkraft), freigestellt, als WebP im
 * Programm. Namen: held-<figur>-<pose>, boss-<monster>-<pose>, hg-<hintergrund>, effekte-<art> (shared/klassenspiel/bossBestand.ts).
 */
const BILDER = import.meta.glob<string>('../../../assets/klassenspiele/boss/*.webp', { eager: true, import: 'default' })

export const bossBild = (name: string): string | undefined => BILDER[`../../../assets/klassenspiele/boss/${name}.webp`]

export type FigurPose = 'ruhe' | 'angriff' | 'getroffen' | 'besiegt'
export const figurBild = (figur: string, pose: FigurPose = 'ruhe'): string | undefined => bossBild(`held-${figur}-${pose}`) ?? bossBild(`held-${figur}-ruhe`)
