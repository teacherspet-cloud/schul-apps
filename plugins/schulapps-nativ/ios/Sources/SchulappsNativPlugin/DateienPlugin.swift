import Foundation
import UIKit
import Capacitor

/// In die Dateien-App exportieren (01.10.2026).
///
/// Zeigt den Dokumentauswahl-Dialog von iOS im Exportmodus (`forExporting:asCopy:`, iOS 14+):
/// Die Lehrkraft wählt einen beliebigen Ort, den die Dateien-App kennt – iCloud Drive, „Auf
/// meinem iPad", OneDrive, einen eingebundenen WebDAV-/IServ-Anbieter … Die Datei kommt als
/// Base64 von der Web-Seite, wird kurz in einen eigenen temporären Ordner geschrieben und nach
/// dem Export wieder gelöscht.
@objc(DateienPlugin)
public class DateienPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "DateienPlugin"
    public let jsName = "Dateien"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "exportieren", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "vonSicherungAusnehmen", returnType: CAPPluginReturnPromise)
    ]

    /// Der laufende Export (nur auf dem Hauptthread benutzt)
    private var offen: CAPPluginCall?
    private var tempOrdner: URL?

    @objc func exportieren(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"), let daten = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
            call.reject("Keine Daten zum Exportieren übergeben.")
            return
        }
        let name = Self.sichererName(call.getString("name") ?? "Datei")
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else {
                call.reject("Keine Ansicht zum Anzeigen des Dialogs gefunden.")
                return
            }
            // Ein noch offener Export gilt als abgebrochen
            self.abschliessen(gespeichert: false)
            let ordner = FileManager.default.temporaryDirectory.appendingPathComponent("export-\(UUID().uuidString)", isDirectory: true)
            let datei = ordner.appendingPathComponent(name)
            do {
                try FileManager.default.createDirectory(at: ordner, withIntermediateDirectories: true)
                try daten.write(to: datei, options: .atomic)
            } catch {
                try? FileManager.default.removeItem(at: ordner)
                call.reject("Die Datei ließ sich nicht vorbereiten: \(error.localizedDescription)")
                return
            }
            self.offen = call
            self.tempOrdner = ordner
            let auswahl = UIDocumentPickerViewController(forExporting: [datei], asCopy: true)
            auswahl.delegate = self
            auswahl.modalPresentationStyle = .formSheet
            vc.present(auswahl, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        abschliessen(gespeichert: !urls.isEmpty)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        abschliessen(gespeichert: false)
    }

    private func abschliessen(gespeichert: Bool) {
        if let call = offen {
            call.resolve(["gespeichert": gespeichert])
        }
        offen = nil
        if let ordner = tempOrdner {
            try? FileManager.default.removeItem(at: ordner)
        }
        tempOrdner = nil
    }

    /// Ordner unter Library von der iCloud-/iTunes-Sicherung ausnehmen (23.10.2026, Nachprüfung des
    /// Schulträgers): die Ablagen mit Schülerdaten (Library/SchulApps/rueckmeldungen …). Sie liegen
    /// ohnehin verschlüsselt (Schlüssel im Schlüsselbund, nur dieses Gerät) – so verlassen sie das
    /// Gerät auch nicht als Chiffrat. Fehlende Ordner werden angelegt. Nur schlichte relative Pfade.
    @objc func vonSicherungAusnehmen(_ call: CAPPluginCall) {
        guard let pfade = call.getArray("pfade", String.self) else {
            call.reject("Keine Pfade übergeben.")
            return
        }
        let fm = FileManager.default
        guard let library = fm.urls(for: .libraryDirectory, in: .userDomainMask).first else {
            call.reject("Library-Ordner nicht gefunden.")
            return
        }
        var ausgenommen: [String] = []
        for pfad in pfade {
            let teile = pfad.split(separator: "/")
            if pfad.isEmpty || pfad.hasPrefix("/") || teile.contains(where: { $0 == ".." || $0 == "." }) { continue }
            var url = library.appendingPathComponent(pfad, isDirectory: true)
            do {
                try fm.createDirectory(at: url, withIntermediateDirectories: true)
                var werte = URLResourceValues()
                werte.isExcludedFromBackup = true
                try url.setResourceValues(werte)
                ausgenommen.append(pfad)
            } catch {
                continue
            }
        }
        call.resolve(["ausgenommen": ausgenommen])
    }

    /// Ein Dateiname ohne Pfadtrenner und Steuerzeichen
    private static func sichererName(_ roh: String) -> String {
        let verboten = CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters)
        let teile = roh.components(separatedBy: verboten)
        let name = teile.joined(separator: "-").trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty || name.hasPrefix(".") {
            return "Datei" + name
        }
        return name
    }
}
