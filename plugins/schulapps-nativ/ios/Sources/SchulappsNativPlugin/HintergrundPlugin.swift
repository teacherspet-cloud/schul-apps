import Foundation
import UIKit
import Capacitor

/// Hintergrundzeit für laufende KI-Aufträge (30.09.2026).
///
/// Wechselt die App in den Hintergrund, hält iOS sie nach kurzer Zeit an. Mit
/// `beginBackgroundTask` darf sie um etwas Zeit bitten – iOS gewährt meist rund 30 Sekunden,
/// danach ruft es den Ablauf-Handler auf, und die Aufgabe MUSS beendet werden (sonst beendet
/// iOS die App). Längere KI-Anfragen im API-Modus können also trotzdem abbrechen; die App
/// wiederholt sie nach der Rückkehr (src/mobil/hintergrund.ts).
@objc(HintergrundPlugin)
public class HintergrundPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HintergrundPlugin"
    public let jsName = "Hintergrund"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "beginnen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beenden", returnType: CAPPluginReturnPromise)
    ]

    /// Laufende Hintergrundaufgaben: eigene Kennung → Kennung von iOS (nur auf dem Hauptthread benutzt)
    private var aufgaben: [String: UIBackgroundTaskIdentifier] = [:]

    @objc func beginnen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let kennung = UUID().uuidString
            let aufgabe = UIApplication.shared.beginBackgroundTask(withName: "Schul-Apps KI-Auftrag") { [weak self] in
                // Zeit abgelaufen: sofort beenden, wie iOS es verlangt
                self?.ende(kennung)
            }
            if aufgabe == .invalid {
                call.resolve(["id": NSNull()])
                return
            }
            self.aufgaben[kennung] = aufgabe
            call.resolve(["id": kennung])
        }
    }

    @objc func beenden(_ call: CAPPluginCall) {
        let kennung = call.getString("id") ?? ""
        DispatchQueue.main.async {
            self.ende(kennung)
            call.resolve()
        }
    }

    private func ende(_ kennung: String) {
        guard let aufgabe = aufgaben.removeValue(forKey: kennung) else { return }
        if aufgabe != .invalid {
            UIApplication.shared.endBackgroundTask(aufgabe)
        }
    }
}
