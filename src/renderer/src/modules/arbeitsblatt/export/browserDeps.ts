import { imageSize } from '../../../shared/images'
import { browserMathRasterizer } from '../../../shared/richtext/docx'
import type { WorksheetDocxDeps } from './docx'
import { useAppSettings } from '../../../shared/settingsStore'

/** Farbstreifen mit gedrehtem Text als PNG (Seitenleiste im Word-Export). */
async function renderSidebar(text: string, color: string, widthMm: number, heightMm: number): Promise<string> {
  const scale = 6 // Pixel pro mm
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(widthMm * scale)
  canvas.height = Math.round(heightMm * scale)
  const g = canvas.getContext('2d')!
  g.fillStyle = color
  g.fillRect(0, 0, canvas.width, canvas.height)
  if (text) {
    g.save()
    g.translate(canvas.width / 2, canvas.height / 2)
    g.rotate(-Math.PI / 2)
    g.fillStyle = '#ffffff'
    g.font = `bold ${Math.round(widthMm * scale * 0.45)}px Calibri, Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 0, 0)
    g.restore()
  }
  return canvas.toDataURL('image/png')
}

export function browserDocxDeps(logo: string | null, schoolName: string): WorksheetDocxDeps {
  // Selbst gestaltete Piktogramme gelten auch im Word-Export
  const pictograms = useAppSettings.getState().pictograms
  return { logo, schoolName, sizer: imageSize, raster: browserMathRasterizer, sidebar: renderSidebar, pictograms }
}
