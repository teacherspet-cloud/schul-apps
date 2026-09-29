import Foundation
import Security
import Capacitor

/// Ein einzelner Geheimnis-Eintrag (z. B. die verschlüsselten API-Schlüssel) im iOS-Schlüsselbund.
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

    private func basisAnfrage() -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.dienst,
            kSecAttrAccount as String: Self.konto
        ]
    }

    @objc func get(_ call: CAPPluginCall) {
        var anfrage = basisAnfrage()
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
        var status = SecItemUpdate(basisAnfrage() as CFDictionary, aenderung as CFDictionary)
        if status == errSecItemNotFound {
            var neu = basisAnfrage()
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
        let status = SecItemDelete(basisAnfrage() as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("Schlüsselbund-Eintrag nicht löschbar (Status \(status)).")
        }
    }
}
