const util = require('node:util');
util.inspect.defaultOptions.depth = 5;

const { FinTSClient } = require('./lib/fints-api');
const { BudgetClient } = require('./lib/budget-api');
const { CredentialsStore } = require('./lib/credentials-store');
const api = require('@actual-app/api');
const { findReconciledMatches, reconcileAccountIfSynchronized } = require('./utils/reconcile');
const { maskIban } = require('./utils/mask');

const parseDateRange = require('./utils/parseDateRange');
const { sendSuccessNotification, sendFailureNotification, sendWarningNotification } = require('./utils/notifications');

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
   try {
      await budgetClient.loadBudget();
      await budgetClient.getAccounts();
   } catch (err) {
      console.error('Fehler bei der Verbindung zu Actual Budget:', err.message);
      await sendFailureNotification(new Error(`Verbindung zu Actual Budget fehlgeschlagen: ${err.message}`));
      throw err;
   }

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
         await sendFailureNotification(new Error(`Verbindung zur Bank "${bank.name}" fehlgeschlagen: ${err.message}`));
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

            const transactions = await fintsClient.getTransaktions(startDate, endDate) || [];
            const budgetTransactions = transactions.map(t => budgetClient.convert(t));

            let added = 0;
            let updated = 0;
            let txDetails = [];
            let warnings = [];

            if (budgetTransactions.length > 0) {
               const existingIds = await budgetClient.getExistingImportedIds();
               
               const importResult = await budgetClient.importTransactions(budgetTransactions);
               added = importResult?.added?.length ?? 0;
               updated = importResult?.updated?.length ?? 0;

               // Warnungen für neu ignorierte Buchungen, die mit einer abgeglichenen Buchung verwechselt wurden
               const ignoredList = (importResult?.updatedPreview ?? []).filter(p => p.ignored);
               for (const { trans, bestMatch, diffDays } of findReconciledMatches(actualConfig.dataDir, ignoredList, existingIds)) {
                  let payeeName = 'Unbekannt';
                  if (bestMatch.payee) {
                     const payeeRow = await api.aqlQuery(api.q('payees').filter({ id: bestMatch.payee }).select('name'));
                     payeeName = payeeRow?.data?.[0]?.name || bestMatch.payee;
                  }

                  const amountEuro = (Math.abs(trans.amount) / 100).toFixed(2);
                  if (diffDays === 0) {
                     console.warn(`[Deduplizierungs-Info] Buchung über ${amountEuro} € am ${trans.date} (${trans.imported_payee}) wurde ignoriert: Es existiert bereits eine abgeglichene Buchung am selben Tag.`);
                  } else {
                     console.warn(`[WARNUNG - Fehl-Match erkannt] Buchung über ${amountEuro} € vom ${trans.date} (${trans.imported_payee}) wurde ignoriert! Sie wurde fälschlicherweise mit einer Buchung von vor ${diffDays} Tag(en) (${bestMatch.date} - ${payeeName}) abgeglichen.`);
                     warnings.push({
                        account: accountMapping.actualAccountName,
                        amount: trans.amount,
                        bankDate: trans.date,
                        bankPayee: trans.imported_payee || 'Unbekannt',
                        matchDate: bestMatch.date,
                        matchPayee: payeeName,
                        diffDays
                     });
                  }
               }

               txDetails = budgetTransactions.map(bt => {
                  const isExisting = existingIds.has(bt.imported_id);
                  return {
                     date: bt.date,
                     payee: bt.payee_name || 'Unbekannter Empfänger',
                     amount: bt.amount,
                     status: isExisting ? 'ignored' : 'added'
                  };
               });

            }

            const accountChanged = budgetTransactions.length > 0;

            if (accountChanged) {
               const accountResult = {
                  account: accountMapping.actualAccountName,
                  added,
                  updated,
                  ignored: budgetTransactions.length - added,
                  transactions: txDetails
               };

               results.push(accountResult);

               // Nur bei tatsächlich importierten Umsätzen benachrichtigen (Cron läuft stündlich)
               if (added > 0) {
                  try {
                     await sendSuccessNotification([accountResult]);
                  } catch (notificationErr) {
                     console.error('Fehler beim Senden der Erfolgsbenachrichtigung:', notificationErr.message);
                  }

                  if (warnings.length > 0) {
                     try {
                        await sendWarningNotification(warnings);
                     } catch (warningErr) {
                        console.error('Fehler beim Senden der Warnungsbenachrichtigung:', warningErr.message);
                     }
                  }
               }

               // Trigger automatic reconciliation if account balance is synchronized and all transactions are categorized
               try {
                  const bal = await fintsClient.getBalance(matchedFintsAccount);
                  const activeAccountId = budgetClient.getActiveAccountId();
                  
                  await reconcileAccountIfSynchronized(activeAccountId, accountMapping.actualAccountName, bal.bookedBalance);
               } catch (reconcileErr) {
                  console.error(`[Reconciliation-Fehler] Automatische Abstimmung für "${accountMapping.actualAccountName}" fehlgeschlagen:`, reconcileErr.message);
               }
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
      .then(results => {
         console.log(JSON.stringify(results));
      })
      .catch(err => {
         console.error('Unhandled error in main:', err);
         process.exitCode = 1;
      });
}

module.exports = { main };
