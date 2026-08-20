# Actual‑FinTS Connector

Node.js application that fetches transactions from German bank accounts via **FinTS/HBCI** and automatically imports them into [Actual Budget](https://actualbudget.org).

## Project Structure

This repository is split into two parts:
- `/server`: The Node.js Express server backend and static web dashboard SPA.
- `/ios`: The native SwiftUI iOS application Xcode project.

## Features

- Supports **multiple banks** with separate FinTS credentials
- Bank credentials are **AES-256-GCM encrypted** in a local SQLite database
- Interactive **CLI setup tool** for managing bank configurations
- Duplicate detection through Actual Budget's `importTransactions` API
- REST API to trigger imports via HTTP requests
- **Interactive Web Dashboard (SPA)**: A beautiful mobile-optimized interface to sync transactions, view live logs, and manage accounts (with premium iOS native bottom-sheets and auto-zoom prevention)
- **Native iOS App**: A 100% native SwiftUI client featuring dynamic themes, section-based bank configuration mapping, balance comparison, pending transactions drawer, custom haptic feedback, and a Siri Shortcut / App Intent integration for automated imports.
- **Automated Reconciliation**: Automatically matches bank balances with Actual Budget balances and performs safe, lock-secured reconciliations.
- **Pending Transactions Import**: Pending (vorgemerkte) bookings are imported as *uncleared* transactions. Every import run first deletes the pending bookings of the previous run, so they are always in sync with the bank and never survive as stale entries.

## Dependencies

| Package | Purpose |
|---------|---------|
| [fints](https://www.npmjs.com/package/fints) | FinTS/HBCI bank interface |
| [@actual-app/api](https://actualbudget.org/docs/api/) | Actual Budget API |
| [express](https://expressjs.com/) | REST API server |

> **Note:** The `fints` package has not been updated in a while. Banks are currently migrating to the XML-based CAMT format — breaking changes are possible.

## Installation & Setup

All server-side commands should be run inside the `/server` directory:

```bash
git clone <repo>
cd actual-fints/server
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

# Optional: pending transactions import (enabled by default)
IMPORT_PENDING=true
PENDING_DAYS=30
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

### Web Dashboard & SPA

The application serves a gorgeous single-page web dashboard directly from `http://127.0.0.1:3000` (or your configured port). It allows you to:
- Sync bank transactions dynamically and visualize added vs. ignored (duplicate) ones.
- Manage bank settings (BLZ, URL, IBAN mappings) without writing code.
- View live real-time output logs.

#### iOS & Mobile Smartphone Optimizations

The SPA has been tailored specifically for iPhones/smartphones, offering a premium native-like app experience:
- **Viewport-fit Cover & Safe Areas**: Seamless integration with iPhone safe area paddings (`viewport-fit=cover`), ensuring notch/dynamic island and home indicator compatibility.
- **Native Bottom-Sheets**: Modals slide up beautifully from the bottom with a native spring animation on screens `< 600px`, complete with a visual dragging handle.
- **Form-stacking & Touch Targets**: Controls are optimized to comfortable touch sizes (minimum 44px/48px) and automatically stack vertically.
- **Auto-Zoom Prevention**: Enforces a `16px` font size on active form inputs under iOS Safari to prevent disruptive automated screen zooming on focus.
- **Touch-Momentum & Swipe Scroll**: Native inertia scrolling is enabled on all log/terminal sections, and the transaction list table supports horizontal swipe navigation.

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

## Projektstruktur

Dieses Repository ist in zwei Teile aufgeteilt:
- `/server`: Der Node.js Express-Server (Backend) und das Web-Interface (Frontend).
- `/ios`: Das native SwiftUI iOS-App Xcode-Projekt.

## Features

- Unterstützt **mehrere Banken** mit separaten FinTS-Zugangsdaten
- Zugangsdaten werden **AES-256-GCM-verschlüsselt** in einer lokalen SQLite-Datenbank gespeichert
- Interaktives **CLI-Setup-Tool** zur Verwaltung der Bankkonfigurationen
- Duplikat-Erkennung durch Actual Budget's `importTransactions` API
- REST-API zum Auslösen des Imports per HTTP-Request
- DSGVO-konformes Logging (IBANs werden maskiert)
- **Interaktives Web-Dashboard (SPA)**: Eine wunderschöne, für Smartphones und iOS Safari optimierte Weboberfläche zum Synchronisieren, Verwalten von Banken und Ansehen von Live-Logs (inkl. nativen Bottom-Sheets und Auto-Zoom-Schutz)
- **Native iOS-App**: Ein 100% nativer SwiftUI-Client mit dynamischem Farbschema, sektionsbasierter Kontoverwaltung, Kontostandsvergleichen, Vorgemerkte-Umsätze-Drawer, haptischem Feedback und Siri-Kurzbefehlen (App Intents) für automatisierte Imports.
- **Automatische Abstimmung (Reconciliation)**: Gleicht die tatsächlichen Banksalden automatisch mit den Kontoständen in Actual Budget ab und führt sichere, zugriffsgeschützte Kontenabstimmungen durch.
- **Import vorgemerkter Umsätze**: Vorgemerkte Buchungen werden als *nicht bestätigt* (uncleared) nach Actual Budget importiert. Vor jedem Import werden die Vormerkungen des letzten Laufs gelöscht, damit keine veralteten Vormerkungen zurückbleiben.

## Abhängigkeiten

| Paket | Zweck |
|-------|-------|
| [fints](https://www.npmjs.com/package/fints) | FinTS/HBCI-Schnittstelle zur Bank |
| [@actual-app/api](https://actualbudget.org/docs/api/) | Actual Budget API |
| [express](https://expressjs.com/) | REST-API Server |

> **Hinweis:** Das `fints`-Paket wurde zuletzt vor längerer Zeit aktualisiert. Banken migrieren aktuell auf das XML-basierte CAMT-Format – Breaking Changes sind möglich.

## Installation & Setup

Alle Server-Befehle müssen im Unterordner `/server` ausgeführt werden:

```bash
git clone <repo>
cd actual-fints/server
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

# Optional: Import vorgemerkter Umsätze (standardmäßig aktiv)
IMPORT_PENDING=true
PENDING_DAYS=30
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

### Web-Dashboard & SPA

Die Anwendung stellt direkt über `http://127.0.0.1:3000` (oder deinen konfigurierten Port) ein wunderschönes, reaktionsschnelles Single-Page Web-Dashboard bereit. Es ermöglicht dir:
- Den Transaktionsimport live zu starten und hinzugefügte vs. ignorierte (Duplikat-)Umsätze differenziert zu visualisieren.
- Deine Bankverbindungen und Konto-Mappings komfortabel im Browser zu pflegen.
- Die Ausführungsprotokolle (System-Logs) in Echtzeit im integrierten Live-Terminal einzusehen.

#### iOS- & Smartphone-Optimierungen

Die SPA wurde speziell für iPhones und andere Smartphones optimiert, um eine App-ähnliche, native Benutzererfahrung im mobilen Browser zu bieten:
- **Viewport-fit Cover & Safe-Areas**: Volle Kompatibilität mit randlosen iPhone-Displays (`viewport-fit=cover`). Alle Abstände passen sich über CSS-Safe-Areas automatisch an Notch und Home-Indikator an.
- **Native Bottom-Sheets**: Dialoge und Formulare gleiten auf Smartphones (`< 600px`) als native Bottom-Sheets mit Feder-Animation von unten herauf und besitzen einen optischen Zieh-Griff.
- **Bequeme Touch-Targets**: Sämtliche Buttons und Navigationstabs besitzen eine Mindesthöhe von `44px` bis `48px`, um Fehlklicks zu verhindern.
- **Auto-Zoom-Schutz**: Durch die gezielte Forcierung einer Schriftgröße von `16px` bei Eingabefeldern im mobilen Fokus wird das lästige automatische Heranzoomen unter iOS Safari unterbunden.
- **Inertia Touch Scroll**: Butterweiches Trägheitsscrollen (`-webkit-overflow-scrolling: touch`) in Scrollbereichen (wie System-Logs) und horizontal wischbare Ergebnistabellen, ohne dass das Layout gesprengt wird.

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

---

## Development (Vibe Coding)

This project is built and maintained utilizing the principles of **Vibe Coding**. The entire application — including the Express server backend, SPA web dashboard, SQLite-encrypted database, test suite, and the 100% native SwiftUI iOS application — was designed and written in a collaborative partnership with a highly autonomous agentic AI coding assistant. 

Instead of manually editing files line-by-line, the human and AI pair program via high-level goals, automatic testing cycles, real-time log reviews, and visual feedback iterations. Development is conducted purely on high-level vibes, with the agent handling the heavy lifting of code generation and verification.

---

## Entwicklung (Vibe Coding)

Dieses Projekt wurde nach den Prinzipien des **Vibe Codings** entwickelt und gepflegt. Die gesamte Anwendung – einschließlich des Express-Server-Backends, des Web-Dashboards, des SQLite-Credential-Stores, der Testsuite und der nativen SwiftUI-iOS-App – wurde in kooperativer Partnerschaft mit einem vollautonomen, agentenbasierten KI-Assistenten entwickelt.

Statt Codezeilen manuell zu editieren, arbeiten Mensch und KI über übergeordnete Funktionsbeschreibungen, automatische Testzyklen, Echtzeit-Protokollanalysen und visuelle Feedbackschleifen zusammen. Die Entwicklung basiert auf reinem "Vibe Coding", bei dem der Agent die Hauptarbeit der Code-Generierung und Validierung übernimmt.