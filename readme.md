# Actual‑FinTS Connector — README

Kurzbeschreibung
- Dieses Skript verbindet ein deutsches Bankkonto per FinTS mit der App ActualBudget.
- Ziel: Kontostände und Umsätze aus FinTS abrufen und so aufbereiten, dass ActualBudget sie einem vorhandenen Konto zuordnen kann.

Konfiguration
- FinTS‑Zugang: über Umgebungsvariablen oder eine lokale Konfigurationsdatei (z. B. `.env`).
   - Beispiele: FINTS_BIC, FINTS_USER, FINTS_PIN, FINTS_BANKCODE
- Mappingdatei: `mapping-data.json` (Pfad kann per Option geändert werden).

Mapping (wichtig)
- Zweck: Das Script braucht Zuordnungen zwischen IBANs (Bankkonten) und den Kontonamen, die in ActualBudget existieren.
- Datei: `mapping-data.json`
- Format (Beispiel):
```json
 [
   {
      "iban": "DE12500105170648489890",
      "actualBudgetAccount": "Girokonto / Bank X",
   },
   {
      "iban": "DE44500105175412345678",
      "actualBudgetAccount": "Sparkonto / Bank X",
   }
]

```
- Regeln:
   - IBANs müssen normalisiert sein (keine Leerzeichen, Großbuchstaben). Beispiel: "DE12500105170648489890".
   - `actualBudgetAccount` muss exakt dem Kontonamen in ActualBudget entsprechen. Die Zuordnung erfolgt per String‑Vergleich.
   - Wenn keine passende Mapping‑Zeile gefunden wird, wird der Datensatz entweder verworfen oder in eine Fehlerdatei geschrieben (je nach Script‑Konfiguration).

- Ausgabe: CSV/JSON, das den Import‑/Zuordnungsanforderungen von ActualBudget entspricht (Kontoname muss mit `actualBudgetAccount` übereinstimmen).

Fehlerbehandlung / Hinweise
- Prüfe zuerst, dass die `actualBudgetAccount`‑Namen exakt mit den Konten in ActualBudget übereinstimmen (inkl. Sonderzeichen).
- IBAN‑Formatierung ist kritisch: beim Abgleich werden Leerzeichen entfernt und Großschreibung erwartet.
- Bei Konten mit mehreren Unterkonten oder geteilten Kontonamen: lege für jedes tatsächliche Konto eine eigene Mapping‑Zeile an.
- Logs prüfen: fehlende Mappings, abgelehnte Transaktionen oder Verbindungsprobleme werden dort protokolliert.

Sicherheit
- PIN/Credentials niemals im Repo speichern. Nutze Umgebungsvariablen oder sichere Secrets.
- Beschränke Leserechte für die Mapping‑ und Exportdateien, wenn sie sensible Informationen enthalten.

Weiteres
- Ergänze Tests für das Mapping‑Matching (Unit‑Tests).
- Dokumentiere das exakte Exportformat für ActualBudget, falls eine spezielle Spaltenanordnung erwartet wird.

Kontakt / Contribution
- Pull Requests willkommen — bitte Mapping‑Schema backward‑kompatibel halten und README bei Änderungen anpassen.
- Issues für Probleme mit FinTS‑Verbindung oder Mapping melden.
Hinweis: Node.js‑Implementierung
- Dieses Projekt ist in Node.js implementiert. Ignoriere die obenstehenden Hinweise zu Python; ersetze sie durch die hierstehenden Node.js‑Anweisungen.

Voraussetzungen
- Node.js 16+ (oder LTS, z. B. 18). Empfohlen: nvm zur Verwaltung von Node‑Versionen.
- Abhängigkeiten in package.json.

Installation (Beispiel Node.js)
```bash
git clone <repo>
cd actual-fints-poc
# optional: nvm use
npm install
```

Konfiguration / Umgebungsvariablen
- Nutze eine .env‑Datei oder echte Umgebungsvariablen. Beispiel .env:
```
FINTS_BIC=...
FINTS_USER=...
FINTS_PIN=...
FINTS_BANKCODE=...
MAPPING_PATH=./mapping-data.json
```
- Die Implementation lädt .env automatisch, falls das Paket dotenv verwendet wird.

Mapping / Pfadoption
- Standardpfad: ./mapping-data.json
- Alternativ per CLI/Script‑Option angeben (Beispiel siehe Nutzung).

Hinweise
- Die CLI‑Optionen und Script‑Namen können je nach Implementation in package.json abweichen. Prüfe package.json für die verfügbaren npm‑Scripte.
- PIN/Credentials niemals ins Repo committen. Verwende sichere Secrets/Umgebungsvariablen.
- Unit‑Tests für das Mapping werden empfohlen.

Wenn du willst, passe ich die package.json‑Scripts beispielhaft an oder schreibe eine kurze CLI‑Anleitung für das vorhandene Node.js‑Programm.