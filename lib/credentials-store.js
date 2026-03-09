const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const path = require('node:path');

const DB_FILE = path.join(__dirname, '..', 'credentials.db');
const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

class CredentialsStore {
   #db;
   #key;

   /**
    * @param {string} masterKey – Master password for encryption/decryption
    * @param {string} [dbPath] – Optional path to the database file
    */
   constructor(masterKey, dbPath) {
      if (!masterKey || typeof masterKey !== 'string') {
         throw new Error('MASTER_KEY is required to access the credentials store.');
      }

      this.#db = new Database(dbPath || DB_FILE);
      this.#db.pragma('journal_mode = WAL');
      this.#db.pragma('foreign_keys = ON');

      this.#initSchema();
      this.#key = this.#deriveKey(masterKey);
   }

   #initSchema() {
      this.#db.exec(`
         CREATE TABLE IF NOT EXISTS config (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
         );

         CREATE TABLE IF NOT EXISTS banks (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT UNIQUE NOT NULL,
            fints_url  TEXT NOT NULL,
            fints_blz  TEXT NOT NULL,
            fints_login TEXT NOT NULL,
            fints_pin  TEXT NOT NULL
         );

         CREATE TABLE IF NOT EXISTS accounts (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_id             INTEGER NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
            iban                TEXT NOT NULL,
            actual_account_name TEXT NOT NULL,
            UNIQUE(bank_id, iban)
         );
      `);
   }

   /**
    * Derives a 256-bit key from the master password using scrypt.
    * The salt is stored in the config table and generated once.
    */
   #deriveKey(masterKey) {
      let saltHex = this.#db.prepare('SELECT value FROM config WHERE key = ?').get('salt')?.value;

      if (!saltHex) {
         const salt = crypto.randomBytes(SALT_LENGTH);
         saltHex = salt.toString('hex');
         this.#db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('salt', saltHex);
      }

      return crypto.scryptSync(masterKey, Buffer.from(saltHex, 'hex'), 32);
   }

   #encrypt(plaintext) {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.#key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const tag = cipher.getAuthTag();
      // Store as iv:tag:ciphertext
      return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
   }

   #decrypt(stored) {
      const parts = stored.split(':');
      if (parts.length !== 3) {
         throw new Error('Invalid encrypted data format');
      }
      const [ivHex, tagHex, ciphertext] = parts;
      const decipher = crypto.createDecipheriv(ALGORITHM, this.#key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
   }

   /**
    * Add a new bank with its FinTS credentials and accounts.
    * @param {{ name: string, url: string, blz: string, login: string, pin: string, accounts: Array<{iban: string, actualAccountName: string}> }} data
    */
   addBank(data) {
      const { name, url, blz, login, pin, accounts } = data;

      if (!name || !url || !blz || !login || !pin) {
         throw new Error('All bank fields (name, url, blz, login, pin) are required.');
      }

      const insertBank = this.#db.prepare(`
         INSERT INTO banks (name, fints_url, fints_blz, fints_login, fints_pin)
         VALUES (?, ?, ?, ?, ?)
      `);

      const insertAccount = this.#db.prepare(`
         INSERT INTO accounts (bank_id, iban, actual_account_name)
         VALUES (?, ?, ?)
      `);

      const transaction = this.#db.transaction(() => {
         const result = insertBank.run(
            name,
            this.#encrypt(url),
            this.#encrypt(blz),
            this.#encrypt(login),
            this.#encrypt(pin)
         );
         const bankId = result.lastInsertRowid;

         if (accounts && accounts.length > 0) {
            for (const acc of accounts) {
               insertAccount.run(bankId, acc.iban, acc.actualAccountName);
            }
         }

         return bankId;
      });

      return transaction();
   }

   /**
    * Get all banks with their decrypted credentials and accounts.
    * @returns {Array<{id: number, name: string, fints: {url: string, blz: string, login: string, pin: string}, accounts: Array<{iban: string, actualAccountName: string}>}>}
    */
   getAllBanks() {
      const banks = this.#db.prepare('SELECT * FROM banks').all();
      const getAccounts = this.#db.prepare('SELECT * FROM accounts WHERE bank_id = ?');

      return banks.map(bank => ({
         id: bank.id,
         name: bank.name,
         fints: {
            url: this.#decrypt(bank.fints_url),
            blz: this.#decrypt(bank.fints_blz),
            login: this.#decrypt(bank.fints_login),
            pin: this.#decrypt(bank.fints_pin),
         },
         accounts: getAccounts.all(bank.id).map(acc => ({
            iban: acc.iban,
            actualAccountName: acc.actual_account_name,
         })),
      }));
   }

   /**
    * Update an existing bank's credentials and/or accounts.
    * Only provided fields will be updated.
    * @param {string} bankName
    * @param {{ url?: string, blz?: string, login?: string, pin?: string, accounts?: Array<{iban: string, actualAccountName: string}> }} data
    */
   updateBank(bankName, data) {
      const bank = this.#db.prepare('SELECT id FROM banks WHERE name = ?').get(bankName);
      if (!bank) throw new Error(`Bank "${bankName}" not found.`);

      const transaction = this.#db.transaction(() => {
         // Update credential fields if provided
         const fields = [];
         const values = [];

         if (data.url) { fields.push('fints_url = ?'); values.push(this.#encrypt(data.url)); }
         if (data.blz) { fields.push('fints_blz = ?'); values.push(this.#encrypt(data.blz)); }
         if (data.login) { fields.push('fints_login = ?'); values.push(this.#encrypt(data.login)); }
         if (data.pin) { fields.push('fints_pin = ?'); values.push(this.#encrypt(data.pin)); }
         if (data.name) { fields.push('name = ?'); values.push(data.name); }

         if (fields.length > 0) {
            values.push(bank.id);
            this.#db.prepare(`UPDATE banks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
         }

         // Replace accounts if provided
         if (data.accounts) {
            this.#db.prepare('DELETE FROM accounts WHERE bank_id = ?').run(bank.id);
            const insertAccount = this.#db.prepare(
               'INSERT INTO accounts (bank_id, iban, actual_account_name) VALUES (?, ?, ?)'
            );
            for (const acc of data.accounts) {
               insertAccount.run(bank.id, acc.iban, acc.actualAccountName);
            }
         }
      });

      transaction();
   }

   /**
    * Remove a bank and all its accounts.
    * @param {string} bankName
    * @returns {boolean} true if deleted, false if not found
    */
   removeBank(bankName) {
      const result = this.#db.prepare('DELETE FROM banks WHERE name = ?').run(bankName);
      return result.changes > 0;
   }

   /**
    * Get a single bank by name with decrypted credentials.
    * @param {string} bankName
    */
   getBank(bankName) {
      const bank = this.#db.prepare('SELECT * FROM banks WHERE name = ?').get(bankName);
      if (!bank) return null;

      const accounts = this.#db.prepare('SELECT * FROM accounts WHERE bank_id = ?').all(bank.id);

      return {
         id: bank.id,
         name: bank.name,
         fints: {
            url: this.#decrypt(bank.fints_url),
            blz: this.#decrypt(bank.fints_blz),
            login: this.#decrypt(bank.fints_login),
            pin: this.#decrypt(bank.fints_pin),
         },
         accounts: accounts.map(acc => ({
            iban: acc.iban,
            actualAccountName: acc.actual_account_name,
         })),
      };
   }

   /**
    * List bank names (without credentials).
    * @returns {Array<{name: string, accountCount: number}>}
    */
   listBanks() {
      return this.#db.prepare(`
         SELECT b.name, COUNT(a.id) as accountCount
         FROM banks b
         LEFT JOIN accounts a ON a.bank_id = b.id
         GROUP BY b.id
      `).all();
   }

   close() {
      this.#db.close();
   }
}

module.exports = { CredentialsStore, DB_FILE };
