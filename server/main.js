const util = require('node:util');
util.inspect.defaultOptions.depth = 5;

const { FinTSClient } = require('./lib/fints-api');
const { BudgetClient } = require('./lib/budget-api');
const { CredentialsStore } = require('./lib/credentials-store');
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

               // Detect mismatch warnings for ignored transactions
               if (importResult?.updatedPreview) {
                  const api = require('@actual-app/api');
                  const ignoredList = importResult.updatedPreview.filter(p => p.ignored);
                  for (const ignored of ignoredList) {
                     const trans = ignored.transaction;
                     
                     // Skip if this transaction was already imported in a previous sync run
                     if (existingIds.has(trans.imported_id)) {
                        continue;
                     }

                     // It's a new bank transaction that was ignored during import!
                     // Find the matching reconciled transaction in the database.
                     const { getDatabasePath } = require('./utils/reconcile');
                     const Database = require('better-sqlite3');
                     const dbPath = getDatabasePath(actualConfig.dataDir);
                     let candidates = [];
                     if (dbPath) {
                        const db = new Database(dbPath);
                        try {
                           candidates = db.prepare(`
                              SELECT id, date, description AS payee, notes FROM transactions
                              WHERE acct = ? AND amount = ? AND reconciled = 1 AND financial_id IS NULL AND tombstone = 0 AND isChild = 0
                           `).all(trans.account, trans.amount);
                        } finally {
                           db.close();
                        }
                     }
                     if (candidates && candidates.length > 0) {
                        const targetDate = new Date(trans.date);
                        const matches = candidates.filter(c => {
                           const cDate = new Date(c.date);
                           const diffTime = Math.abs(targetDate - cDate);
                           const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                           return diffDays <= 7;
                        });
                        
                        if (matches.length > 0) {
                           // Sort closest date first
                           matches.sort((a, b) => Math.abs(targetDate - new Date(a.date)) - Math.abs(targetDate - new Date(b.date)));
                           const bestMatch = matches[0];
                           
                           const diffTime = Math.abs(targetDate - new Date(bestMatch.date));
                           const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                           
                           // Query payee name
                           let payeeName = 'Unbekannt';
                           if (bestMatch.payee) {
                              const payeeRow = await api.aqlQuery(api.q('payees').filter({ id: bestMatch.payee }).select('name'));
                              payeeName = payeeRow?.data?.[0]?.name || bestMatch.payee;
                           }
                           
                           if (diffDays === 0) {
                              console.warn(`[Deduplizierungs-Info] Buchung über ${(Math.abs(trans.amount)/100).toFixed(2)} € am ${trans.date} (${trans.imported_payee}) wurde ignoriert: Es existiert bereits eine abgeglichene Buchung am selben Tag.`);
                           } else {
                              console.warn(`[WARNUNG - Fehl-Match erkannt] Buchung über ${(Math.abs(trans.amount)/100).toFixed(2)} € vom ${trans.date} (${trans.imported_payee}) wurde ignoriert! Sie wurde fälschlicherweise mit einer Buchung von vor ${diffDays} Tag(en) (${bestMatch.date} - ${payeeName}) abgeglichen.`);
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
                     }
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

               if (added > 0) {
                  try {
                     await sendSuccessNotification([accountResult]);
                  } catch (notificationErr) {
                     console.error('Fehler beim Senden der Erfolgsbenachrichtigung:', notificationErr.message);
                  }
               }

               if (warnings.length > 0) {
                  try {
                     await sendWarningNotification(warnings);
                  } catch (warningErr) {
                     console.error('Fehler beim Senden der Warnungsbenachrichtigung:', warningErr.message);
                  }
               }

               // Trigger automatic reconciliation if account balance is synchronized and all transactions are categorized
               try {
                  const bal = await fintsClient.getBalance(matchedFintsAccount);
                  const activeAccountId = budgetClient.getActiveAccountId();
                  const { reconcileAccountIfSynchronized } = require('./utils/reconcile');
                  
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
