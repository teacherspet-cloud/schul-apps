import Foundation
import Security
import Capacitor

/// Geheimnis-Einträge im iOS-Schlüsselbund: ohne `konto` der Eintrag der API-Schlüssel ("secrets"),
/// mit `konto` ein eigener Eintrag (z. B. "iserv" für das IServ-Passwort, 01.10.2026).
/// Nur auf diesem Gerät, nach dem ersten Entsperren lesbar, nicht in Backups übertragbar.
@objc(SchluesselbundPlugin)
public class SchluesselbundPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SchluesselbundPlugin"
    public let jsName = "Schluesselbund"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private static let dienst = "de.kornahrens.schulapps.secrets"
    private static let konto = "secrets"

    /// Das Konto des Eintrags: nur Kleinbuchstaben und Ziffern (1–20), sonst der Standard-Eintrag
    private func konto(_ call: CAPPluginCall) -> String {
        guard let wunsch = call.getString("konto"), !wunsch.isEmpty, wunsch.count <= 20,
              wunsch.unicodeScalars.allSatisfy({ CharacterSet.lowercaseLetters.contains($0) || CharacterSet.decimalDigits.contains($0) }),
              wunsch.allSatisfy({ $0.isASCII })
        else { return Self.konto }
        return wunsch
    }

    private func basisAnfrage(_ call: CAPPluginCall) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.dienst,
            kSecAttrAccount as String: konto(call)
        ]
    }

    @objc func get(_ call: CAPPluginCall) {
        var anfrage = basisAnfrage(call)
        anfrage[kSecReturnData as String] = true
        anfrage[kSecMatchLimit as String] = kSecMatchLimitOne
        var ergebnis: AnyObject?
        let status = SecItemCopyMatching(anfrage as CFDictionary, &ergebnis)
        switch status {
        case errSecSuccess:
            if let daten = ergebnis as? Data, let text = String(data: daten, encoding: .utf8) {
                call.resolve(["value": text])
            } else {
                call.resolve(["value": NSNull()])
            }
        case errSecItemNotFound:
            call.resolve(["value": NSNull()])
        default:
            call.reject("Schlüsselbund nicht lesbar (Status \(status)).")
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let wert = call.getString("value") else {
            call.reject("Kein Wert für den Schlüsselbund übergeben.")
            return
        }
        let daten = Data(wert.utf8)
        let aenderung: [String: Any] = [
            kSecValueData as String: daten,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        var status = SecItemUpdate(basisAnfrage(call) as CFDictionary, aenderung as CFDictionary)
        if status == errSecItemNotFound {
            var neu = basisAnfrage(call)
            neu[kSecValueData as String] = daten
            neu[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(neu as CFDictionary, nil)
        }
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Schlüsselbund nicht beschreibbar (Status \(status)).")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        let status = SecItemDelete(basisAnfrage(call) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("Schlüsselbund-Eintrag nicht löschbar (Status \(status)).")
        }
    }
}
