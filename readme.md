# Actual‑FinTS Connector — README

## Kurzbeschreibung
- Dieses Skript verbindet ein deutsches Bankkonto per FinTS mit der App ActualBudget.
- Ziel: Kontostände und Umsätze aus FinTS abrufen und so aufbereiten, dass [ActualBudget](https://actualbudget.org) sie einem vorhandenen Konto zuordnen kann.

## Abhängigkeiten
Das Skript verwendet das NPM Package [Fints](https://www.npmjs.com/package/fints) zum Abruf der Umsätze über die Fints/HBCI-Schnittstelle der Bank.

>  15.11.2025: das Package ist recht alt und wurde vor 5 Jahren des letzte Mal aktualisiert. Ebenso findet aktuell eine Umstellung der Banken auf das XML-basierte Camt-Format statt. Breaking Changes sind theoretisch möglich

Für die Kommunikation mit einem ActucalBduget-Server wird die offizielle [API](https://actualbudget.org/docs/api/) von ActualBudget genutzt

## Einschränkung
Die verwendete Package zur FinTS-Kommunikation liefert  vorgemerkte Buchungen. 

Die aktuelle Version des Skripts supportet nur eine Fints-Account.

## Konfiguration
### FinTS‑Zugang
Über Umgebungsvariablen oder eine lokale Konfigurationsdatei (z. B. `.env`).
   
**FINTS_URL**:   
URL des FinTS Server der Bank
**FINTS_LOGIN:**
User / Login beim Onlinebanking
**FINTS_PIN:**   
Passwort / Pin zum Onlinebanking
**FINTS_BLZ:**   
Bankleitzahl der Bank  

### ActualBudget 
**AB_URL:**
des ActualBudget Servers
**AB_PASS:**
Passwort der ActualBudget Servers
**AB_SYNC_DB:**
Sync ID der Datei
**AB_PATH:**
Pfad des Ordners, in dem die sqlite-DB gespeichert wird
**Mappingdatei:** 
Mapping-Datei um die Bankkonten aus dem Onlinebanking mit den ActucalBudget zu matchen 

### Mapping (wichtig)
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
**Regeln:**
   - IBANs müssen normalisiert sein (keine Leerzeichen, Großbuchstaben). Beispiel: "DE12500105170648489890".
   - `actualBudgetAccount` muss exakt dem Kontonamen in ActualBudget entsprechen. Die Zuordnung erfolgt per String‑Vergleich.
   - Wenn keine passende Mapping‑Zeile gefunden wird, wird der Datensatz entweder verworfen oder in eine Fehlerdatei geschrieben (je nach Script‑Konfiguration).


### Fehlerbehandlung / Hinweise
- Prüfe zuerst, dass die `actualBudgetAccount`‑Namen exakt mit den Konten in ActualBudget übereinstimmen (inkl. Sonderzeichen).
- IBAN‑Formatierung ist kritisch: beim Abgleich werden Leerzeichen entfernt und Großschreibung erwartet.
- Bei Konten mit mehreren Unterkonten oder geteilten Kontonamen: lege für jedes tatsächliche Konto eine eigene Mapping‑Zeile an.
- Logs prüfen: fehlende Mappings, abgelehnte Transaktionen oder Verbindungsprobleme werden dort protokolliert.

## Hinweis: Node.js‑Implementierung
- Dieses Projekt ist in Node.js implementiert. 

### Voraussetzungen
- Node.js 16+ (oder LTS, z. B. 18). 
- Abhängigkeiten in package.json.

### Installation 
```bash
git clone <repo>
cd actual-fints
npm install
```

### Start
```bash
npm start
```