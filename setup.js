#!/usr/bin/env node

const readline = require('node:readline');
const { CredentialsStore } = require('./lib/credentials-store');

// ── Helpers ──────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ask = (question) =>
   new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));

const askRequired = async (question) => {
   let answer = '';
   while (!answer) {
      answer = await ask(question);
      if (!answer) console.log('  ⚠  Eingabe darf nicht leer sein.');
   }
   return answer;
};

const askPin = (question) => ask(`${question}(Eingabe sichtbar) `);

const confirm = async (question) => {
   const answer = await ask(`${question} (j/n): `);
   return answer.toLowerCase() === 'j' || answer.toLowerCase() === 'y';
};

const maskPin = (pin) => pin ? '●'.repeat(pin.length) : '';
const maskIban = (iban) => iban ? iban.slice(0, 4) + '····' + iban.slice(-4) : '';

const getStore = () => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) {
      console.error('❌ MASTER_KEY nicht gesetzt. Bitte in .env definieren oder als Umgebungsvariable setzen.');
      process.exit(1);
   }
   return new CredentialsStore(masterKey);
};

// ── Commands ─────────────────────────────────────────────────────────

const addBank = async () => {
   const store = getStore();

   try {
      console.log('\n🏦 Neue Bank hinzufügen\n');

      const name = await askRequired('  Bankname (z.B. ING, Sparkasse): ');
      const url = await askRequired('  FinTS-URL: ');
      const blz = await askRequired('  BLZ (8 Ziffern): ');
      const login = await askRequired('  Online-Banking Login: ');
      const pin = await askPin('  Online-Banking PIN: ');

      if (!pin) {
         console.log('  ⚠  PIN darf nicht leer sein.');
         return;
      }

      // Collect accounts
      const accounts = [];
      console.log('\n  Konten hinzufügen (Enter ohne Eingabe zum Beenden):\n');

      let addMore = true;
      while (addMore) {
         const iban = await ask('    IBAN: ');
         if (!iban) break;

         const actualAccountName = await askRequired('    Actual Budget Kontoname: ');
         accounts.push({ iban: iban.replace(/\s/g, '').toUpperCase(), actualAccountName });
         console.log(`    ✓ ${maskIban(iban)} → ${actualAccountName}\n`);
      }

      store.addBank({ name, url, blz, login, pin, accounts });
      console.log(`\n✅ Bank "${name}" mit ${accounts.length} Konto(en) gespeichert.\n`);

   } finally {
      store.close();
   }
};

const listBanks = () => {
   const store = getStore();

   try {
      const banks = store.getAllBanks();

      if (banks.length === 0) {
         console.log('\n📭 Keine Banken konfiguriert. Nutze "node setup.js add-bank" zum Hinzufügen.\n');
         return;
      }

      console.log(`\n🏦 ${banks.length} Bank(en) konfiguriert:\n`);

      for (const bank of banks) {
         console.log(`  ┌─ ${bank.name}`);
         console.log(`  │  URL:   ${bank.fints.url}`);
         console.log(`  │  BLZ:   ${bank.fints.blz}`);
         console.log(`  │  Login: ${bank.fints.login}`);
         console.log(`  │  PIN:   ${maskPin(bank.fints.pin)}`);

         if (bank.accounts.length > 0) {
            console.log(`  │  Konten:`);
            for (const acc of bank.accounts) {
               console.log(`  │    ${maskIban(acc.iban)} → ${acc.actualAccountName}`);
            }
         } else {
            console.log(`  │  Keine Konten konfiguriert.`);
         }
         console.log(`  └──────────────────\n`);
      }
   } finally {
      store.close();
   }
};

const editBank = async (bankName) => {
   if (!bankName) {
      console.error('❌ Bankname erforderlich: node setup.js edit-bank <Bankname>');
      process.exit(1);
   }

   const store = getStore();

   try {
      const bank = store.getBank(bankName);
      if (!bank) {
         console.error(`❌ Bank "${bankName}" nicht gefunden.`);
         return;
      }

      console.log(`\n✏️  Bank "${bankName}" bearbeiten`);
      console.log('  (Enter drücken, um den aktuellen Wert beizubehalten)\n');

      const url = await ask(`  FinTS-URL [${bank.fints.url}]: `);
      const blz = await ask(`  BLZ [${bank.fints.blz}]: `);
      const login = await ask(`  Login [${bank.fints.login}]: `);
      const pin = await askPin(`  PIN [${maskPin(bank.fints.pin)}]: `);
      const newName = await ask(`  Bankname [${bank.name}]: `);

      const updates = {};
      if (url) updates.url = url;
      if (blz) updates.blz = blz;
      if (login) updates.login = login;
      if (pin) updates.pin = pin;
      if (newName) updates.name = newName;

      // Ask if accounts should be re-entered
      if (await confirm('\n  Konten neu eingeben?')) {
         const accounts = [];
         console.log('  Konten hinzufügen (Enter ohne Eingabe zum Beenden):\n');

         while (true) {
            const iban = await ask('    IBAN: ');
            if (!iban) break;
            const actualAccountName = await askRequired('    Actual Budget Kontoname: ');
            accounts.push({ iban: iban.replace(/\s/g, '').toUpperCase(), actualAccountName });
            console.log(`    ✓ ${maskIban(iban)} → ${actualAccountName}\n`);
         }
         updates.accounts = accounts;
      }

      if (Object.keys(updates).length === 0) {
         console.log('\n⏭  Keine Änderungen vorgenommen.\n');
         return;
      }

      store.updateBank(bankName, updates);
      console.log(`\n✅ Bank "${newName || bankName}" aktualisiert.\n`);

   } finally {
      store.close();
   }
};

const removeBank = async (bankName) => {
   if (!bankName) {
      console.error('❌ Bankname erforderlich: node setup.js remove-bank <Bankname>');
      process.exit(1);
   }

   const store = getStore();

   try {
      const bank = store.getBank(bankName);
      if (!bank) {
         console.error(`❌ Bank "${bankName}" nicht gefunden.`);
         return;
      }

      console.log(`\n🗑  Bank "${bankName}" mit ${bank.accounts.length} Konto(en) löschen?`);
      if (await confirm('  Wirklich löschen?')) {
         store.removeBank(bankName);
         console.log(`✅ Bank "${bankName}" gelöscht.\n`);
      } else {
         console.log('⏭  Abgebrochen.\n');
      }
   } finally {
      store.close();
   }
};

const showHelp = () => {
   console.log(`
Actual-FinTS Setup CLI

Verwendung:
  node setup.js <command> [options]

Befehle:
  add-bank              Neue Bank interaktiv hinzufügen
  list                  Alle Banken und Konten anzeigen
  edit-bank <name>      Bank bearbeiten
  remove-bank <name>    Bank und zugehörige Konten löschen
  help                  Diese Hilfe anzeigen

Umgebung:
  MASTER_KEY            Erforderlich. Master-Passwort für die Verschlüsselung.
`);
};

// ── Main ─────────────────────────────────────────────────────────────

const main = async () => {
   const [command, ...args] = process.argv.slice(2);

   switch (command) {
      case 'add-bank':
         await addBank();
         break;
      case 'list':
         listBanks();
         break;
      case 'edit-bank':
         await editBank(args.join(' '));
         break;
      case 'remove-bank':
         await removeBank(args.join(' '));
         break;
      case 'help':
      case '--help':
      case '-h':
         showHelp();
         break;
      default:
         if (command) console.error(`Unbekannter Befehl: ${command}\n`);
         showHelp();
         break;
   }

   rl.close();
};

main().catch((err) => {
   console.error('Fehler:', err.message);
   process.exit(1);
});
