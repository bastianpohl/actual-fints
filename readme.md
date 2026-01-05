# Actual‑FinTS Connector

## Short Overview
- This script connects a German bank account via FinTS with the ActualBudget app.
- Goal: fetch balances and transactions from FinTS and prepare them so that [ActualBudget](https://actualbudget.org) can assign them to an existing account.

## Dependencies
The script uses the NPM package [Fints](https://www.npmjs.com/package/fints) to retrieve transactions via the bank’s FinTS/HBCI interface.

> 2025-11-15: this package is quite old and was last updated 5 years ago. Banks are currently migrating to the XML-based Camt format. Breaking changes are theoretically possible.

For communication with an ActualBudget server, the official [API](https://actualbudget.org/docs/api/) provided by ActualBudget is used.

## Limitation
The FinTS package used returns pending bookings.

The current version of the script supports only a single FinTS account.

## Configuration
### FinTS Access
Via environment variables or a local configuration file (e.g., `.env`).

**FINTS_URL:**  
URL of the bank’s FinTS server

**FINTS_LOGIN:**  
User/login for online banking

**FINTS_PIN:**  
Password/PIN for online banking

**FINTS_BLZ:**  
Bank code (BLZ)

### ActualBudget
**AB_URL:**  
URL of the ActualBudget server

**AB_PASS:**  
Password of the ActualBudget server

**AB_SYNC_DB:**  
Sync ID of the file

**AB_PATH:**  
Path of the folder where the SQLite DB is stored

**Mapping file:**  
Mapping file to match bank accounts from online banking to ActualBudget accounts

### Mapping (important)
- Purpose: The script needs mappings between IBANs (bank accounts) and the account names that exist in ActualBudget.
- File: `mapping-data.json`
- Format (example):
```json
[
   {
      "iban": "DE12500105170648489890",
      "actualBudgetAccount": "Girokonto / Bank X"
   },
   {
      "iban": "DE44500105175412345678",
      "actualBudgetAccount": "Sparkonto / Bank X"
   }
]
```

**Rules:**
- IBANs must be normalized (no spaces, uppercase). Example: "DE12500105170648489890".
- `actualBudgetAccount` must exactly match the account name in ActualBudget. Matching is done via string comparison.
- If no matching mapping entry is found, the dataset is either discarded or written to an error file (depending on script configuration).

### Error Handling / Notes
- First verify that the `actualBudgetAccount` names exactly match the accounts in ActualBudget (including special characters).
- IBAN formatting is critical: during matching, spaces are removed and uppercase is expected.
- For accounts with multiple subaccounts or split account names: create a mapping entry for each actual account.
- Check logs: missing mappings, rejected transactions, or connection issues are logged there.

## Note: Node.js Implementation
- This project is implemented in Node.js.

### Requirements
- Node.js 16+ (or LTS, e.g., 18).
- Dependencies listed in `package.json`.

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

Test bla