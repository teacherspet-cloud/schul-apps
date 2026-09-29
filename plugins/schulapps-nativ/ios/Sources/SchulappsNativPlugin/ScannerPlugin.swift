import Foundation
import UIKit
import VisionKit
import Capacitor

/// Dokumentenscanner von VisionKit: mehrere Seiten, automatisch zugeschnitten und entzerrt.
@objc(ScannerPlugin)
public class ScannerPlugin: CAPPlugin, CAPBridgedPlugin, VNDocumentCameraViewControllerDelegate {
    public let identifier = "ScannerPlugin"
    public let jsName = "Scanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scannen", returnType: CAPPluginReturnPromise)
    ]

    /// Längste Kante der gelieferten Seiten (reicht für KI-Auswertung und hält die Daten klein).
    private static let maxKante: CGFloat = 2400

    private var offen: CAPPluginCall?

    @objc func scannen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard VNDocumentCameraViewController.isSupported else {
                call.reject("Der Dokumentenscanner wird auf diesem Gerät nicht unterstützt.")
                return
            }
            guard let vc = self.bridge?.viewController else {
                call.reject("Keine Ansicht zum Anzeigen des Scanners gefunden.")
                return
            }
            if let alt = self.offen {
                alt.resolve(["seiten": [String]()])
            }
            self.offen = call
            let scanner = VNDocumentCameraViewController()
            scanner.delegate = self
            vc.present(scanner, animated: true)
        }
    }

    public func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                             didFinishWith scan: VNDocumentCameraScan) {
        var seiten: [String] = []
        for nr in 0..<scan.pageCount {
            let bild = Self.verkleinert(scan.imageOfPage(at: nr))
            if let jpeg = bild.jpegData(compressionQuality: 0.85) {
                seiten.append(jpeg.base64EncodedString())
            }
        }
        controller.dismiss(animated: true) {
            self.offen?.resolve(["seiten": seiten])
            self.offen = nil
        }
    }

    public func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true) {
            self.offen?.resolve(["seiten": [String]()])
            self.offen = nil
        }
    }

    public func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                             didFailWithError error: Error) {
        controller.dismiss(animated: true) {
            self.offen?.reject("Scannen fehlgeschlagen: \(error.localizedDescription)")
            self.offen = nil
        }
    }

    private static func verkleinert(_ bild: UIImage) -> UIImage {
        let groesse = bild.size
        let kante = max(groesse.width, groesse.height)
        guard kante > maxKante else { return bild }
        let faktor = maxKante / kante
        let ziel = CGSize(width: floor(groesse.width * faktor), height: floor(groesse.height * faktor))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: ziel, format: format).image { _ in
            bild.draw(in: CGRect(origin: .zero, size: ziel))
        }
    }
}
