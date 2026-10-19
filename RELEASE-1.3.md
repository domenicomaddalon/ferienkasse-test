# Ferienkasse 1.3 – Freigabeplan (bestehende Supabase-Datenbank)

Status: **Release-Kandidat / noch keine Produktivumstellung**.

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
4. Auth-Redirect-URLs für die endgültige GitHub-Pages-Adresse in Supabase ergänzen.
5. Migration aller benötigten Reisen einzeln durchführen, dabei doppelte Reisen vermeiden.
6. Jede Reise abgleichen: Personen, Ausgaben, Originalwährungen, historische Kurse, Salden, Zahlungen und PDF.
7. Anmeldung/Einladung, parallele Bearbeitung, Berechtigungen und mobile Darstellung auf der endgültigen Adresse testen.
8. PWA-Manifest, Service Worker und Caching für 1.3 getrennt von 1.2.1 konfigurieren.
9. Erst nach ausdrücklicher Freigabe Hauptadresse umschalten; alte Version unter einer separaten Rückfalladresse bereithalten.

## Rückfall
Bei Problemen GitHub Pages auf den gesicherten Stand 1.2.1 zurücksetzen. **Achtung:** Neue Einträge in Supabase nach dem Umschalten erscheinen nicht automatisch in der alten lokalen Version. Für einen Rückfall müssen die zwischenzeitlichen Daten separat exportiert/abgeglichen werden.

## Technische Freigabebedingungen
- Keine `TEST`-Beschriftungen oder Test-URLs in der freigegebenen Oberfläche.
- Login und Einladungslinks zeigen auf die richtige Domain.
- Keine Datenbank-Migrationen mit Löschoperationen.
- Release erst nach expliziter Bestätigung deployen.
