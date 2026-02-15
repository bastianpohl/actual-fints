# Actual‑FinTS Connector

Node.js application that fetches transactions from German bank accounts via **FinTS/HBCI** and automatically imports them into [Actual Budget](https://actualbudget.org).

## Features

- Supports **multiple bank accounts** via a mapping file
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
# FinTS / Bank
FINTS_URL=https://banking-url.example.com/fints
FINTS_LOGIN=online-banking-login
FINTS_PIN=online-banking-pin
FINTS_BLZ=12345678

# Actual Budget
AB_URL=https://actual-budget-server.example.com
AB_PASS=actual-budget-password
AB_SYNC_DB=budget-sync-id
AB_PATH=./actual-budget

# Optional
LOCALE=de-DE
MAPPING_FILE=./account-mapping.json
PORT=3000
SERVICE_NAME=actual-fints-api
```

### Account Mapping

The file `account-mapping.json` links bank accounts (IBANs) to account names in Actual Budget. See `account-mapping-demo.json` for an example.

```json
[
  {
    "iban": "DE60100100101234567890",
    "actualBudgetAccountName": "Girokonto Privat",
    "actualBudgetAccountID": "123e4567-e89b-12d3-a456-426614174000"
  },
  {
    "iban": "DE11500105170648489890",
    "actualBudgetAccountName": "Tagesgeld Rücklagen",
    "actualBudgetAccountID": "123e4567-e89b-12d3-a456-426614174000"
  }
]
```

**Important:**
- IBANs must be normalized (no spaces, uppercase)
- `actualBudgetAccountName` can be either the **account name** or the **account ID (UUID)** from Actual Budget

## Limitations

- All mapped accounts must belong to the **same bank** (single set of FinTS credentials)

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

## Tests

```bash
node --test
```

## Project Structure

```
├── main.js                   # Main logic (CLI + exported function)
├── rest-api.js               # Express REST API
├── lib/
│   ├── fints-api.js          # FinTS client wrapper
│   └── budget-api.js         # Actual Budget API wrapper
├── utils/
│   ├── convert.js            # Transaction conversion
│   ├── decodeText.js         # Latin-1 → UTF-8 decoding
│   ├── env.js                # Environment variable validation
│   ├── mask.js               # IBAN masking for logs
│   ├── parseDateRange.js     # CLI argument parsing
│   └── uid.js                # UID detection
├── account-mapping.json      # Account mapping (not in repo)
└── account-mapping-demo.json # Example mapping
```

---

# Actual‑FinTS Connector (Deutsch)

Node.js-Anwendung, die Transaktionen von deutschen Bankkonten via **FinTS/HBCI** abruft und automatisch in [Actual Budget](https://actualbudget.org) importiert.

## Features

- Unterstützt **mehrere Bankkonten** über eine Mapping-Datei
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
# FinTS / Bank
FINTS_URL=https://banking-url.example.com/fints
FINTS_LOGIN=online-banking-login
FINTS_PIN=online-banking-pin
FINTS_BLZ=12345678

# Actual Budget
AB_URL=https://actual-budget-server.example.com
AB_PASS=actual-budget-passwort
AB_SYNC_DB=sync-id-des-budgets
AB_PATH=./actual-budget

# Optional
LOCALE=de-DE
MAPPING_FILE=./account-mapping.json
PORT=3000
SERVICE_NAME=actual-fints-api
```

### Account-Mapping

Die Datei `account-mapping.json` verknüpft Bankkonten (IBANs) mit den Kontonamen in Actual Budget. Eine Beispieldatei findest du in `account-mapping-demo.json`.

```json
[
  {
    "iban": "DE60100100101234567890",
    "actualBudgetAccountName": "Girokonto Privat"
  },
  {
    "iban": "DE11500105170648489890",
    "actualBudgetAccountName": "Tagesgeld Rücklagen"
  }
]
```

**Wichtig:**
- IBANs müssen normalisiert sein (keine Leerzeichen, Großbuchstaben)
- `actualBudgetAccountName` kann entweder der **Kontoname** oder die **Konto-ID (UUID)** aus Actual Budget sein

## Einschränkungen

- Alle gemappten Konten müssen bei der **gleichen Bank** sein (ein Satz FinTS-Zugangsdaten)

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

## Tests

```bash
node --test
```

## Projektstruktur

```
├── main.js                   # Hauptlogik (CLI + exportierte Funktion)
├── rest-api.js               # Express REST-API
├── lib/
│   ├── fints-api.js          # FinTS-Client Wrapper
│   └── budget-api.js         # Actual Budget API Wrapper
├── utils/
│   ├── convert.js            # Transaktions-Konvertierung
│   ├── decodeText.js         # Latin-1 → UTF-8 Dekodierung
│   ├── env.js                # Umgebungsvariablen-Validierung
│   ├── mask.js               # IBAN-Maskierung für Logs
│   ├── parseDateRange.js     # CLI-Argument Parsing
│   └── uid.js                # UID-Erkennung
├── account-mapping.json      # Konto-Mapping (nicht im Repo)
└── account-mapping-demo.json # Beispiel-Mapping
```