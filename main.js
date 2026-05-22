const { FinTSClient } = require('./lib/fints-api');
const { BudgetClient } = require('./lib/budget-api');
const { CredentialsStore } = require('./lib/credentials-store');
const { maskIban } = require('./utils/mask');

const parseDateRange = require('./utils/parseDateRange');
const { sendSuccessNotification, sendFailureNotification } = require('./utils/notifications');

const main = async () => {

   let startDate, endDate;
   try {
      ({ startDate, endDate } = parseDateRange());
   } catch (error) {
      console.error('Fehler beim Parsen des Datumsbereichs:', error.message);
      return [];
   }

   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) {
      console.error('MASTER_KEY nicht gesetzt. Bitte in .env definieren.');
      return [];
   }

   let store;
   let banks;
   let actualConfig = {};
   try {
      store = new CredentialsStore(masterKey);
      // Automatic migration of Actual Budget credentials from .env to SQLite if not already migrated
      const dbUrl = store.getConfig('actual_server_url');
      if (!dbUrl && process.env.AB_URL && process.env.AB_PASS && process.env.AB_SYNC_DB) {
         console.error('🔄 [Migration] Migriere Actual Budget Verbindungsdaten aus .env in die SQLite-Datenbank...');
         store.setConfig('actual_server_url', process.env.AB_URL.trim());
         store.setConfig('actual_sync_db', process.env.AB_SYNC_DB.trim());
         store.setEncryptedConfig('actual_password', process.env.AB_PASS.trim());
         if (process.env.AB_PATH) {
            store.setConfig('actual_data_dir', process.env.AB_PATH.trim());
         }
         console.error('✅ [Migration] Actual Budget Verbindungsdaten erfolgreich und verschlüsselt in SQLite importiert!');
      }

      banks = store.getAllBanks();
      actualConfig = {
         serverUrl: store.getConfig('actual_server_url') || process.env.AB_URL,
         password: store.getEncryptedConfig('actual_password') || process.env.AB_PASS,
         syncDb: store.getConfig('actual_sync_db') || process.env.AB_SYNC_DB,
         dataDir: store.getConfig('actual_data_dir') || process.env.AB_PATH || './actual-budget/'
      };
   } catch (err) {
      console.error('Error opening credentials store or retrieving config:', err.message);
   } finally {
      if (store) store.close();
   }

   if (!banks || banks.length === 0) {
      console.error('Keine Banken konfiguriert. Nutze "node setup.js add-bank" zum Einrichten.');
      return [];
   }

   const budgetClient = new BudgetClient(actualConfig);
   await budgetClient.loadBudget();
   await budgetClient.getAccounts();

   const results = [];

   for (const bank of banks) {
      console.error(`\n── Bank: ${bank.name} ──`);

      let fintsClient;
      try {
         fintsClient = new FinTSClient(bank.fints);
         await fintsClient.initiateClient();
         await fintsClient.loadAccounts();
      } catch (err) {
         console.error(`Fehler bei Bank "${bank.name}":`, err.message);
         continue;
      }

      const fintsAccounts = fintsClient.getAccounts();
      if (!fintsAccounts || fintsAccounts.length === 0) {
         console.error(`Keine FinTS-Konten für Bank "${bank.name}" verfügbar.`);
         continue;
      }

      for (const accountMapping of bank.accounts) {
         try {
            const matchedFintsAccount = fintsAccounts.find(a => a.iban === accountMapping.iban);
            if (!matchedFintsAccount) {
               console.warn("Kein FinTS-Konto für IBAN:", maskIban(accountMapping.iban));
               continue;
            }

            fintsClient.setAccount(accountMapping.iban);
            await budgetClient.setActiveAccount(accountMapping.actualAccountName);

            console.error('Verarbeite Konto:', maskIban(accountMapping.iban), '->', accountMapping.actualAccountName);
            const transactions = await fintsClient.getTransaktions(startDate, endDate);

            if (!transactions || transactions.length === 0) {
               continue;
            }

            const budgetTransactions = transactions.map(t => budgetClient.convert(t));

            if (budgetTransactions.length > 0) {
               const existingIds = await budgetClient.getExistingImportedIds();
               
               const importResult = await budgetClient.importTransactions(budgetTransactions);
               const added = importResult?.added?.length ?? 0;
               const updated = importResult?.updated?.length ?? 0;

               const txDetails = budgetTransactions.map(bt => {
                  const isExisting = existingIds.has(bt.imported_id);
                  return {
                     date: bt.date,
                     payee: bt.payee_name || 'Unbekannter Empfänger',
                     amount: bt.amount,
                     status: isExisting ? 'ignored' : 'added'
                  };
               });

               results.push({
                  account: accountMapping.actualAccountName,
                  added,
                  updated,
                  ignored: budgetTransactions.length - added,
                  transactions: txDetails
               });
            }
         } catch (err) {
            console.error('Fehler beim Verarbeiten von Konto', maskIban(accountMapping.iban), err.message);
         }
      }
   }

   await budgetClient.close();
   return results;
}

if (require.main === module) {
   main()
      .then(async results => {
         console.log(JSON.stringify(results));
         const masterKey = process.env.MASTER_KEY;
         let ntfyTopic = '';
         let ntfyServer = 'https://ntfy.sh';
         if (masterKey) {
            const store = new CredentialsStore(masterKey);
            try {
               ntfyTopic = store.getConfig('ntfy_topic');
               ntfyServer = store.getConfig('ntfy_server') || 'https://ntfy.sh';
            } catch (e) {
               console.error('Fehler beim Laden der Notification-Config aus DB:', e.message);
            } finally {
               store.close();
            }
         }
         await sendSuccessNotification(results, ntfyTopic, ntfyServer);
      })
      .catch(async err => {
         console.error('Unhandled error in main:', err);
         const masterKey = process.env.MASTER_KEY;
         let ntfyTopic = '';
         let ntfyServer = 'https://ntfy.sh';
         if (masterKey) {
            const store = new CredentialsStore(masterKey);
            try {
               ntfyTopic = store.getConfig('ntfy_topic');
               ntfyServer = store.getConfig('ntfy_server') || 'https://ntfy.sh';
            } catch (e) {
               console.error('Fehler beim Laden der Notification-Config aus DB:', e.message);
            } finally {
               store.close();
            }
         }
         await sendFailureNotification(err, ntfyTopic, ntfyServer);
         process.exitCode = 1;
      });
}

module.exports = { main };
