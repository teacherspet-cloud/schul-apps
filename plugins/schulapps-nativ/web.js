import { WebPlugin } from '@capacitor/core'

const SCHLUESSEL = 'schulapps.secrets'

export class PdfDruckWeb extends WebPlugin {
  async erzeugen() {
    throw this.unavailable(
      'PDF-Erzeugung ist nur in der iPad-/iPhone-App verfügbar. Im Browser über „Drucken“ → „Als PDF sichern“.'
    )
  }

  async drucken() {
    window.print()
    return { abgeschlossen: true }
  }
}

const schluessel = (konto) => (konto ? `${SCHLUESSEL}.${konto}` : SCHLUESSEL)

export class SchluesselbundWeb extends WebPlugin {
  async get(optionen) {
    try {
      return { value: window.localStorage.getItem(schluessel(optionen?.konto)) }
    } catch {
      return { value: null }
    }
  }

  async set(optionen) {
    window.localStorage.setItem(schluessel(optionen?.konto), String(optionen?.value ?? ''))
  }

  async remove(optionen) {
    try {
      window.localStorage.removeItem(schluessel(optionen?.konto))
    } catch {
      /* nichts zu tun */
    }
  }
}

export class ScannerWeb extends WebPlugin {
  async scannen() {
    return { seiten: [] }
  }
}

export class HintergrundWeb extends WebPlugin {
  async beginnen() {
    return { id: null }
  }

  async beenden() {}
}

export class DateienWeb extends WebPlugin {
  async exportieren(optionen) {
    const roh = atob(String(optionen?.base64 ?? ''))
    const bytes = new Uint8Array(roh.length)
    for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([bytes]))
    const a = document.createElement('a')
    a.href = url
    a.download = String(optionen?.name ?? 'Datei')
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return { gespeichert: true }
  }
}
