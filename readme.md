# Actual‑FinTS Connector

Node.js application that fetches transactions from German bank accounts via **FinTS/HBCI** and automatically imports them into [Actual Budget](https://actualbudget.org).

## Features

- Supports **multiple banks** with separate FinTS credentials
- Bank credentials are **AES-256-GCM encrypted** in a local SQLite database
- Interactive **CLI setup tool** for managing bank configurations
- Duplicate detection through Actual Budget's `importTransactions` API
- REST API to trigger imports via HTTP requests

## Dependencies

| Package | Purpose |
|---------|---------|
| [fints](https://www.npmjs.com/package/fints) | FinTS/HBCI bank interface |
| [@actual-app/api](https://actualbudget.org/docs/api/) | Actual Budget API |
| [express](https://expressjs.com/) | REST API server |

> **Note:** The `fints` package has not been updated in a while. Banks are currently migrating to the XML-based CAMT format — breaking changes are possible.

## Installation

```bash
git clone <repo>
cd actual-fints
npm install
```

## Configuration

### Environment Variables

Create a `.env` file in the project directory:

```env
# Actual Budget
AB_URL=https://actual-budget-server.example.com
AB_PASS=actual-budget-password
AB_SYNC_DB=budget-sync-id
AB_PATH=./actual-budget

# Encryption key for the credentials database
MASTER_KEY=ein-sicheres-master-passwort

# Optional
LOCALE=de-DE
PORT=3000
SERVICE_NAME=actual-fints-api
```

### Bank Setup

Bank credentials are stored encrypted in a local SQLite database (`credentials.db`). Use the interactive CLI to manage them:

```bash
# Add a new bank
npm run setup -- add-bank

# List all configured banks and accounts
npm run setup -- list

# Edit an existing bank
npm run setup -- edit-bank ExampleBank

# Remove a bank and its accounts
npm run setup -- remove-bank ExampleBank
```

The setup wizard guides you through entering:
- Bank name, FinTS URL, BLZ
- Online banking login and PIN (PIN input is hidden)
- One or more IBANs with their corresponding Actual Budget account names

## Usage

### CLI

```bash
# Fetch transactions for today
npm start

# Fetch transactions for a specific date range
npm start -- --start 2025-01-01 --end 2025-01-31
```

### REST API

```bash
npm run start-api
```

#### Load Transactions

```http
POST /api/transactions/load
Content-Type: application/json

{
  "start": "2025-01-01",
  "end": "2025-01-31"
}
```

**Response (new transactions found):**
```json
{
  "accounts": [
    { "account": "Girokonto Privat", "added": 5, "updated": 2 }
  ]
}
```

**Response (no new transactions):**
```json
{ "message": "Keine neuen Umsätze." }
```

#### Update Configuration

```http
PUT /api/update/config
```

Runs `git pull --ff-only` and restarts the service.

## Security

- Bank credentials (URL, BLZ, Login, PIN) are encrypted with **AES-256-GCM**
- The encryption key is derived from `MASTER_KEY` via **scrypt**
- The salt is stored in the database and generated once on first use
- `credentials.db` and `.env` are excluded from version control via `.gitignore`
- IBANs are masked in log output for privacy (GDPR compliance)

## Tests

```bash
node --test
```

## Project Structure

```
├── main.js                   # Main logic (CLI + exported function)
├── rest-api.js               # Express REST API
├── setup.js                  # Interactive CLI for bank management
├── lib/
│   ├── credentials-store.js  # Encrypted SQLite credential store
│   ├── fints-api.js          # FinTS client wrapper
│   └── budget-api.js         # Actual Budget API wrapper
├── utils/
│   ├── convert.js            # Transaction conversion
│   ├── decodeText.js         # Latin-1 → UTF-8 decoding
│   ├── env.js                # Environment variable validation
│   ├── mask.js               # IBAN masking for logs
│   ├── parseDateRange.js     # CLI argument parsing
│   └── uid.js                # UID detection
├── credentials.db            # Encrypted bank credentials (not in repo)
└── .gitignore
```

---

# Actual‑FinTS Connector (Deutsch)

Node.js-Anwendung, die Transaktionen von deutschen Bankkonten via **FinTS/HBCI** abruft und automatisch in [Actual Budget](https://actualbudget.org) importiert.

## Features

- Unterstützt **mehrere Banken** mit separaten FinTS-Zugangsdaten
- Zugangsdaten werden **AES-256-GCM-verschlüsselt** in einer lokalen SQLite-Datenbank gespeichert
- Interaktives **CLI-Setup-Tool** zur Verwaltung der Bankkonfigurationen
- Duplikat-Erkennung durch Actual Budget's `importTransactions` API
- REST-API zum Auslösen des Imports per HTTP-Request
- DSGVO-konformes Logging (IBANs werden maskiert)

## Abhängigkeiten

| Paket | Zweck |
|-------|-------|
| [fints](https://www.npmjs.com/package/fints) | FinTS/HBCI-Schnittstelle zur Bank |
| [@actual-app/api](https://actualbudget.org/docs/api/) | Actual Budget API |
| [express](https://expressjs.com/) | REST-API Server |

> **Hinweis:** Das `fints`-Paket wurde zuletzt vor längerer Zeit aktualisiert. Banken migrieren aktuell auf das XML-basierte CAMT-Format – Breaking Changes sind möglich.

## Installation

```bash
git clone <repo>
cd actual-fints
npm install
```

## Konfiguration

### Umgebungsvariablen

Erstelle eine `.env`-Datei im Projektverzeichnis:

```env
# Actual Budget
AB_URL=https://actual-budget-server.example.com
AB_PASS=actual-budget-passwort
AB_SYNC_DB=sync-id-des-budgets
AB_PATH=./actual-budget

# Verschlüsselungsschlüssel für die Credentials-Datenbank
MASTER_KEY=ein-sicheres-master-passwort

# Optional
LOCALE=de-DE
PORT=3000
SERVICE_NAME=actual-fints-api
```

### Bank-Setup

Zugangsdaten werden verschlüsselt in einer lokalen SQLite-Datenbank (`credentials.db`) gespeichert. Die Verwaltung erfolgt über ein interaktives CLI:

```bash
# Neue Bank hinzufügen
npm run setup -- add-bank

# Alle konfigurierten Banken und Konten anzeigen
npm run setup -- list

# Bestehende Bank bearbeiten
npm run setup -- edit-bank ExampleBank

# Bank und zugehörige Konten löschen
npm run setup -- remove-bank ExampleBank
```

Der Setup-Assistent führt durch:
- Bankname, FinTS-URL, BLZ
- Online-Banking Login und PIN (PIN-Eingabe wird nicht angezeigt)
- Eine oder mehrere IBANs mit zugehörigem Actual Budget Kontonamen

## Verwendung

### CLI

```bash
# Transaktionen für heute abrufen
npm start

# Transaktionen für einen bestimmten Zeitraum
npm start -- --start 2025-01-01 --end 2025-01-31
```

### REST-API

```bash
npm run start-api
```

#### Transaktionen laden

```http
POST /api/transactions/load
Content-Type: application/json

{
  "start": "2025-01-01",
  "end": "2025-01-31"
}
```

**Response (neue Transaktionen vorhanden):**
```json
{
  "accounts": [
    { "account": "Girokonto Privat", "added": 5, "updated": 2 }
  ]
}
```

**Response (keine neuen Transaktionen):**
```json
{ "message": "Keine neuen Umsätze." }
```

#### Konfiguration aktualisieren

```http
PUT /api/update/config
```

Führt `git pull --ff-only` aus und startet den Service neu.

## Sicherheit

- Zugangsdaten (URL, BLZ, Login, PIN) sind mit **AES-256-GCM** verschlüsselt
- Der Schlüssel wird aus `MASTER_KEY` via **scrypt** abgeleitet
- Der Salt wird in der Datenbank gespeichert und einmalig beim ersten Start generiert
- `credentials.db` und `.env` sind über `.gitignore` vom Versionskontrollsystem ausgeschlossen
- IBANs werden in Logs zum Datenschutz maskiert (DSGVO-konform)

## Tests

```bash
node --test
```

## Projektstruktur

```
├── main.js                   # Hauptlogik (CLI + exportierte Funktion)
├── rest-api.js               # Express REST-API
├── setup.js                  # Interaktives CLI für Bankverwaltung
├── lib/
│   ├── credentials-store.js  # Verschlüsselter SQLite-Credential-Store
│   ├── fints-api.js          # FinTS-Client Wrapper
│   └── budget-api.js         # Actual Budget API Wrapper
├── utils/
│   ├── convert.js            # Transaktions-Konvertierung
│   ├── decodeText.js         # Latin-1 → UTF-8 Dekodierung
│   ├── env.js                # Umgebungsvariablen-Validierung
│   ├── mask.js               # IBAN-Maskierung für Logs
│   ├── parseDateRange.js     # CLI-Argument Parsing
│   └── uid.js                # UID-Erkennung
├── credentials.db            # Verschlüsselte Zugangsdaten (nicht im Repo)
└── .gitignore
```