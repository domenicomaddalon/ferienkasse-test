# Ferienkasse 1.3 – Freigabeplan (bestehende Supabase-Datenbank)

Status: **Release-Kandidat / noch keine Produktivumstellung**.

**Festgelegt:** Die endgültige Adresse bleibt https://domenicomaddalon.github.io/ferienkasse/ . Die bestehende Supabase-Datenbank wird verwendet. Der Umschaltzeitpunkt ist noch nicht freigegeben.

## Unveränderliche Ausgangslage
- Produktivversion 1.2.1: https://domenicomaddalon.github.io/ferienkasse/
- Testversion 1.3: https://domenicomaddalon.github.io/ferienkasse-test/trips-preview.html
- Supabase-Projekt wird **weiterverwendet**; keine neue Datenbank, keine Tabellen löschen, kein Schema zurücksetzen.
- Vorhandene Reisen und Benutzer bleiben erhalten.
- Der alte lokale Speicherschlüssel `ferienkasse.pwa.v1` bleibt unangetastet.

## Vor dem Umschalten
1. Bestehenden Stand von `domenicomaddalon/ferienkasse` als unveränderlichen Release/Tag sichern.
2. Jede relevante Reise in Version 1.2.1 als aktuelle JSON-Sicherung exportieren und die Dateien extern sichern.
3. Bestehende Supabase-Daten sichern (SQL-Backup oder Supabase-Backup). Daten und Auth-Konfiguration getrennt prüfen.
4. Auth-Redirect-URLs für https://domenicomaddalon.github.io/ferienkasse/ (und den Auth-Callback) in Supabase ergänzen; Einladungslinks und Redirects kontrollieren.
5. Migration aller benötigten Reisen einzeln durchführen, dabei doppelte Reisen vermeiden.
6. Jede Reise abgleichen: Personen, Ausgaben, Originalwährungen, historische Kurse, Salden, Zahlungen und PDF.
7. Anmeldung/Einladung, parallele Bearbeitung, Berechtigungen und mobile Darstellung auf der endgültigen Adresse testen.
8. PWA-Manifest, Service Worker, Scope und Caching für die bestehende Adresse auf 1.3 umstellen; alte 1.2.1-Caches dürfen die neue Oberfläche nicht überlagern.
9. Erst nach ausdrücklicher Freigabe Hauptadresse umschalten; alte Version unter einer separaten Rückfalladresse bereithalten.

## Rückfall
Bei Problemen GitHub Pages auf den gesicherten Stand 1.2.1 zurücksetzen. **Achtung:** Neue Einträge in Supabase nach dem Umschalten erscheinen nicht automatisch in der alten lokalen Version. Für einen Rückfall müssen die zwischenzeitlichen Daten separat exportiert/abgeglichen werden.

## Technische Freigabebedingungen
- Keine `TEST`-Beschriftungen oder Test-URLs in der freigegebenen Oberfläche.
- Login und Einladungslinks zeigen auf die richtige Domain.
- Keine Datenbank-Migrationen mit Löschoperationen.
- Release erst nach expliziter Bestätigung deployen.

## Vorbereitete Freigabedateien (nur Release-Branch)
- `index.html` und `app.js`: Startseite und Reiseverwaltung ohne Test-Beschriftung.
- `auth.html` und `auth.js`: Anmeldung mit Redirect zur vorgesehenen Auth-Seite.
- `supabase/project-config.js`: verweist unverändert auf die bereits genutzte Supabase-Datenbank.
- Die Freigabedateien sind **noch nicht auf die produktive GitHub-Pages-Adresse kopiert oder veröffentlicht**.
- Noch offen: Asset-Übernahme (`style.css`, mobile CSS, Tabs CSS, Supabase-Konfiguration), PWA-Manifest/Service Worker, Supabase Redirect-URLs, Backup, Integrations- und Sicherheitstest.
- Bestehende Auth-Session nutzt weiterhin `ferienkasse.v1.3.auth.test` zur Kompatibilität mit dem Teststand; vor Freigabe bewerten.
