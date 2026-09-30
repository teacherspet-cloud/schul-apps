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

export class SchluesselbundWeb extends WebPlugin {
  async get() {
    try {
      return { value: window.localStorage.getItem(SCHLUESSEL) }
    } catch {
      return { value: null }
    }
  }

  async set(optionen) {
    window.localStorage.setItem(SCHLUESSEL, String(optionen?.value ?? ''))
  }

  async remove() {
    try {
      window.localStorage.removeItem(SCHLUESSEL)
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
