# Schul-Apps an IServ anbinden (Single-Sign-On)

Anleitung für die IServ-Administration von **gywem.de**. Ziel: Lehrkräfte und – für Onlinetests –
Schülerinnen und Schüler melden sich bei Schul-Apps mit ihrem IServ-Konto an, so wie bei WebUntis.

**Datenschutz:** Das IServ-Passwort wird nur bei IServ eingegeben. Schul-Apps erhält es nie und
speichert keine IServ-Zugangsdaten. Übermittelt werden nur Benutzername, Name, Rollen und Gruppen.

## 1. Voraussetzung

Das Paket **„IServ 3: OAuth- und Open-ID-Connect-Server“** ist installiert:
*Verwaltung › System › Pakete*. Laut Discovery-Dokument von gywem.de ist das bereits der Fall.

## 2. Anwendung eintragen

*Verwaltung › System › Single-Sign-On › Hinzufügen*

| Feld | Eintrag |
|---|---|
| Name | Schul-Apps |
| Weiterleitungs-URI | `https://217.154.120.64:8443/auth/rueckruf` |
| Vertrauenswürdig | optional (ohne Haken fragt IServ beim ersten Anmelden nach der Zustimmung) |
| Scopes | `openid`, `profile`, `email`, `roles`, `groups`, `iserv:roles`, `iserv:groups` |
| Rechte | Rollen **Lehrer** und **Schüler** (alle anderen bleiben ausgeschlossen) |

Nach dem Speichern zeigt IServ eine **Client-ID** und ein **Client-Geheimnis**.

## 3. Werte an Schul-Apps übergeben

Die Client-ID und das Client-Geheimnis gehen an den Admin von Schul-Apps (t.kornahrens), am besten
persönlich oder über IServ-Mail. Er trägt beides in *Schul-Apps › Verwaltung › IServ-Anbindung*
ein. Das Geheimnis wird dort verschlüsselt gespeichert und nie wieder angezeigt.

## Was Schul-Apps mit den Angaben macht

- **Lehrkräfte**: Zugang nur mit der IServ-Rolle *Lehrer* und einem Benutzernamen im Format
  `m.mustermann`. Ihre Klassen- und Kursgruppen kann eine Lehrkraft als Lerngruppen übernehmen.
- **Schülerinnen und Schüler**: nur der Schülerbereich (Onlinetest, freigegebene Aufgaben). Ihre
  Klasse wird aus den IServ-Gruppen übernommen.
- **Andere Konten** werden abgewiesen.
- **Klarnamen** bleiben auf dem Server. Sie gehen nie an eine KI; dort ersetzt Schul-Apps Namen
  durch Platzhalter.
