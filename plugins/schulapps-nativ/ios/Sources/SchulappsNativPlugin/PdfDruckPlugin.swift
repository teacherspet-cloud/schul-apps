import Foundation
import UIKit
import WebKit
import Capacitor

/// PDF aus HTML erzeugen (unsichtbarer WKWebView, Druck-Medientyp) und per AirPrint drucken.
@objc(PdfDruckPlugin)
public class PdfDruckPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PdfDruckPlugin"
    public let jsName = "PdfDruck"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "erzeugen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drucken", returnType: CAPPluginReturnPromise)
    ]

    /// Laufende Aufträge festhalten, bis sie fertig sind (sonst räumt ARC sie weg).
    private var laufend: [PdfAuftrag] = []

    @objc func erzeugen(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), !html.isEmpty else {
            call.reject("Kein HTML für die PDF-Erzeugung übergeben.")
            return
        }
        let messen = call.getString("messen")
        DispatchQueue.main.async {
            let wirt = self.bridge?.viewController?.view.window ?? self.bridge?.viewController?.view
            let auftrag = PdfAuftrag(html: html, messen: messen, wirt: wirt)
            self.laufend.append(auftrag)
            auftrag.starten { [weak self] ergebnis in
                self?.laufend.removeAll { $0 === auftrag }
                switch ergebnis {
                case .success(let fertig):
                    var antwort: [String: Any] = ["pdf": fertig.daten.base64EncodedString()]
                    if let messung = fertig.messung {
                        antwort["messung"] = messung
                    }
                    call.resolve(antwort)
                case .failure(let fehler):
                    call.reject(fehler.localizedDescription)
                }
            }
        }
    }

    @objc func drucken(_ call: CAPPluginCall) {
        guard let base64 = call.getString("pdf"),
              let daten = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
            call.reject("Keine gültigen PDF-Daten zum Drucken übergeben.")
            return
        }
        let name = call.getString("name") ?? "Schul-Apps"
        DispatchQueue.main.async {
            guard UIPrintInteractionController.isPrintingAvailable else {
                call.reject("Drucken ist auf diesem Gerät nicht verfügbar.")
                return
            }
            let steuerung = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.jobName = name
            info.outputType = .general
            steuerung.printInfo = info
            steuerung.printingItem = daten
            let fertig: UIPrintInteractionController.CompletionHandler = { _, abgeschlossen, fehler in
                if let fehler = fehler {
                    call.reject(fehler.localizedDescription)
                } else {
                    call.resolve(["abgeschlossen": abgeschlossen])
                }
            }
            if UIDevice.current.userInterfaceIdiom == .pad, let ansicht = self.bridge?.viewController?.view {
                let anker = CGRect(x: ansicht.bounds.midX, y: ansicht.safeAreaInsets.top + 44, width: 1, height: 1)
                steuerung.present(from: anker, in: ansicht, animated: true, completionHandler: fertig)
            } else {
                steuerung.present(animated: true, completionHandler: fertig)
            }
        }
    }
}

struct PdfFehler: LocalizedError {
    let text: String
    init(_ text: String) { self.text = text }
    var errorDescription: String? { text }
}

struct PdfFertig {
    let daten: Data
    let messung: String?
}

/// Ein Erzeugungsauftrag: HTML laden, auf Schriften/Bilder warten, Seiten messen,
/// je Seite createPDF(rect) und alles auf A4 (bzw. A4 quer) zusammenfügen.
final class PdfAuftrag: NSObject, WKNavigationDelegate {
    /// A4 in CSS-Pixeln (96 dpi) – so breit rendert auch der Desktop-Druck.
    static let cssBreite: CGFloat = 794
    static let cssHoehe: CGFloat = 1123
    /// A4 in PDF-Punkten.
    static let a4Breite: CGFloat = 595.2756
    static let a4Hoehe: CGFloat = 841.8898

    private let html: String
    private let messen: String?
    private weak var wirt: UIView?
    private var webView: WKWebView?
    private var abschluss: ((Result<PdfFertig, Error>) -> Void)?
    private var zeitgeber: Timer?
    private var messung: String?
    private var geladen = false

    init(html: String, messen: String?, wirt: UIView?) {
        self.html = html
        self.messen = messen
        self.wirt = wirt
        super.init()
    }

    func starten(_ abschluss: @escaping (Result<PdfFertig, Error>) -> Void) {
        self.abschluss = abschluss
        let konfiguration = WKWebViewConfiguration()
        konfiguration.suppressesIncrementalRendering = false
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: Self.cssBreite, height: Self.cssHoehe),
                            configuration: konfiguration)
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = .white
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.isScrollEnabled = false
        web.isUserInteractionEnabled = false
        web.mediaType = "print"
        // Hinter der eigentlichen Oberfläche einhängen: im Fenster (damit WebKit rendert),
        // aber von der App-Ansicht vollständig verdeckt.
        if let wirt = wirt {
            wirt.insertSubview(web, at: 0)
        }
        webView = web
        zeitgeber = Timer.scheduledTimer(withTimeInterval: 90, repeats: false) { [weak self] _ in
            self?.beenden(.failure(PdfFehler("Zeitüberschreitung beim Erzeugen der PDF.")))
        }
        web.loadHTMLString(html, baseURL: nil)
    }

    // MARK: Navigation

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !geladen else { return }
        geladen = true
        let warten = """
        try { if (document.fonts && document.fonts.ready) { await document.fonts.ready; } } catch (e) {}
        await Promise.all(Array.prototype.slice.call(document.images).map(function (b) {
          if (b.complete) { return null; }
          return new Promise(function (r) { b.addEventListener('load', r); b.addEventListener('error', r); });
        }));
        await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
        return true;
        """
        webView.callAsyncJavaScript(warten, arguments: [:], in: nil, in: .page) { [weak self] _ in
            self?.nachDemLaden()
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        beenden(.failure(error))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        beenden(.failure(error))
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        beenden(.failure(PdfFehler("Die Druckansicht wurde unerwartet beendet (zu wenig Speicher?).")))
    }

    // MARK: Ablauf

    private func nachDemLaden() {
        guard let web = webView else { return }
        guard let messen = messen, !messen.isEmpty else {
            seitenMessen(versuch: 0)
            return
        }
        let skript = """
        const r = await eval(code);
        if (typeof r === 'string') { return r; }
        return JSON.stringify(r === undefined ? null : r);
        """
        web.callAsyncJavaScript(skript, arguments: ["code": messen], in: nil, in: .page) { [weak self] ergebnis in
            guard let self = self else { return }
            switch ergebnis {
            case .success(let wert):
                if let text = wert as? String {
                    self.messung = text
                } else if let zahl = wert as? NSNumber {
                    self.messung = zahl.stringValue
                }
            case .failure(let fehler):
                self.beenden(.failure(PdfFehler("Messung im Dokument fehlgeschlagen: \(fehler.localizedDescription)")))
                return
            }
            self.seitenMessen(versuch: 0)
        }
    }

    private static let messSkript = """
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-pdf-seite]'));
    if (!els.length) {
      els = Array.prototype.slice.call(document.querySelectorAll(
        '.ws-page, .vt-page, .blatt, .rm-seite, .bl-seite, .formular-seite, .pdf-seite'));
      els = els.filter(function (e) { return !els.some(function (o) { return o !== e && o.contains(e); }); });
    }
    var sx = window.scrollX || 0, sy = window.scrollY || 0;
    var seiten = els.map(function (e) {
      var r = e.getBoundingClientRect();
      return { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height };
    }).filter(function (s) { return s.w > 20 && s.h > 20; });
    var de = document.documentElement, b = document.body;
    return JSON.stringify({
      seiten: seiten,
      breite: Math.max(de.scrollWidth, b ? b.scrollWidth : 0),
      hoehe: Math.max(de.scrollHeight, b ? b.scrollHeight : 0)
    });
    """

    private struct Messung: Decodable {
        struct Seite: Decodable { let x: CGFloat; let y: CGFloat; let w: CGFloat; let h: CGFloat }
        let seiten: [Seite]
        let breite: CGFloat
        let hoehe: CGFloat
    }

    private func seitenMessen(versuch: Int) {
        guard let web = webView else { return }
        web.callAsyncJavaScript(Self.messSkript, arguments: [:], in: nil, in: .page) { [weak self] ergebnis in
            guard let self = self, let web = self.webView else { return }
            guard case .success(let wert) = ergebnis, let text = wert as? String,
                  let json = text.data(using: .utf8),
                  let m = try? JSONDecoder().decode(Messung.self, from: json) else {
                self.beenden(.failure(PdfFehler("Die Seiten des Dokuments ließen sich nicht vermessen.")))
                return
            }
            // Ansicht so groß machen wie der Inhalt (Querformat-Seiten sind breiter als 794 px),
            // damit createPDF alles innerhalb der Ansicht findet. Danach einmal neu messen.
            let breite = max(Self.cssBreite, ceil(m.breite))
            let hoehe = min(max(Self.cssHoehe, ceil(m.hoehe)), 400_000)
            if versuch == 0 && (abs(web.frame.width - breite) > 0.5 || abs(web.frame.height - hoehe) > 0.5) {
                web.frame = CGRect(x: 0, y: 0, width: breite, height: hoehe)
                web.setNeedsLayout()
                web.layoutIfNeeded()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { self.seitenMessen(versuch: 1) }
                return
            }
            var rechtecke = m.seiten.map { CGRect(x: $0.x, y: $0.y, width: $0.w, height: $0.h) }
            if rechtecke.isEmpty {
                // Rückfall: A4-Raster über die ganze Höhe.
                let anzahl = max(1, Int(ceil((m.hoehe - 2) / Self.cssHoehe)))
                rechtecke = (0..<anzahl).map {
                    CGRect(x: 0, y: CGFloat($0) * Self.cssHoehe, width: Self.cssBreite, height: Self.cssHoehe)
                }
            }
            self.seitenErzeugen(rechtecke, index: 0, gesammelt: [])
        }
    }

    private func seitenErzeugen(_ rechtecke: [CGRect], index: Int, gesammelt: [Data]) {
        guard let web = webView else { return }
        if index >= rechtecke.count {
            zusammenfuegen(gesammelt)
            return
        }
        let konfiguration = WKPDFConfiguration()
        konfiguration.rect = rechtecke[index]
        web.createPDF(configuration: konfiguration) { [weak self] ergebnis in
            guard let self = self else { return }
            switch ergebnis {
            case .success(let daten):
                self.seitenErzeugen(rechtecke, index: index + 1, gesammelt: gesammelt + [daten])
            case .failure(let fehler):
                self.beenden(.failure(PdfFehler("Seite \(index + 1) ließ sich nicht erzeugen: \(fehler.localizedDescription)")))
            }
        }
    }

    /// Jede Einzelseite (CSS-Pixel als Punkte) vektoriell auf A4 bzw. A4 quer skalieren.
    private func zusammenfuegen(_ teile: [Data]) {
        var seiten: [CGPDFPage] = []
        for teil in teile {
            guard let anbieter = CGDataProvider(data: teil as CFData),
                  let dokument = CGPDFDocument(anbieter) else { continue }
            if dokument.numberOfPages >= 1 {
                for nr in 1...dokument.numberOfPages {
                    if let seite = dokument.page(at: nr) { seiten.append(seite) }
                }
            }
        }
        guard !seiten.isEmpty else {
            beenden(.failure(PdfFehler("Das Dokument enthielt keine druckbaren Seiten.")))
            return
        }
        let ausgabe = NSMutableData()
        guard let verbraucher = CGDataConsumer(data: ausgabe as CFMutableData) else {
            beenden(.failure(PdfFehler("PDF-Ausgabe ließ sich nicht anlegen.")))
            return
        }
        var standard = CGRect(x: 0, y: 0, width: Self.a4Breite, height: Self.a4Hoehe)
        let info: [CFString: Any] = [kCGPDFContextCreator: "Schul-Apps"]
        guard let ziel = CGContext(consumer: verbraucher, mediaBox: &standard, info as CFDictionary) else {
            beenden(.failure(PdfFehler("PDF-Ausgabe ließ sich nicht anlegen.")))
            return
        }
        for seite in seiten {
            let quelle = seite.getBoxRect(.mediaBox)
            let quer = quelle.width > quelle.height
            var box = quer
                ? CGRect(x: 0, y: 0, width: Self.a4Hoehe, height: Self.a4Breite)
                : CGRect(x: 0, y: 0, width: Self.a4Breite, height: Self.a4Hoehe)
            let boxDaten = Data(bytes: &box, count: MemoryLayout<CGRect>.size) as CFData
            ziel.beginPDFPage([kCGPDFContextMediaBox: boxDaten] as CFDictionary)
            let massstab = min(box.width / max(quelle.width, 1), box.height / max(quelle.height, 1))
            let versatzX = (box.width - quelle.width * massstab) / 2
            let versatzY = box.height - quelle.height * massstab // oben bündig
            ziel.saveGState()
            ziel.setFillColor(UIColor.white.cgColor)
            ziel.fill(box)
            ziel.translateBy(x: versatzX, y: versatzY)
            ziel.scaleBy(x: massstab, y: massstab)
            ziel.translateBy(x: -quelle.minX, y: -quelle.minY)
            ziel.drawPDFPage(seite)
            ziel.restoreGState()
            ziel.endPDFPage()
        }
        ziel.closePDF()
        beenden(.success(PdfFertig(daten: ausgabe as Data, messung: messung)))
    }

    private func beenden(_ ergebnis: Result<PdfFertig, Error>) {
        guard let abschluss = abschluss else { return }
        self.abschluss = nil
        zeitgeber?.invalidate()
        zeitgeber = nil
        webView?.navigationDelegate = nil
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webView = nil
        abschluss(ergebnis)
    }
}
