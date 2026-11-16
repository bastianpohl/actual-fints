// Einmalig: Zahlweg-Tags (#ApplePay, #Lastschrifteinzug …) historischer Buchungen ans Ende der Notiz setzen.
// Standard ist Trockenlauf; mit --apply wird über die Actual-API geschrieben (sync-sicher, kein direktes SQLite-UPDATE).
// Nicht parallel zum Sync-Cron laufen lassen.
const { BudgetClient } = require('./lib/budget-api');
const { CredentialsStore } = require('./lib/credentials-store');
const { getDatabasePath } = require('./utils/reconcile');
const { moveTagsToEnd } = require('./utils/moveTags');
const api = require('@actual-app/api');
const Database = require('better-sqlite3');

(async () => {
   const apply = process.argv.includes('--apply');
   const store = new CredentialsStore(process.env.MASTER_KEY);
   const cfg = {
      serverUrl: store.getConfig('actual_server_url') || process.env.AB_URL,
      password: store.getEncryptedConfig('actual_password') || process.env.AB_PASS,
      syncDb: store.getConfig('actual_sync_db') || process.env.AB_SYNC_DB,
      dataDir: store.getConfig('actual_data_dir') || process.env.AB_PATH || './actual-budget/',
   };
   store.close();

   const client = new BudgetClient(cfg);
   await client.loadBudget();

   const db = new Database(getDatabasePath(cfg.dataDir), { readonly: true });
   const rows = db.prepare("SELECT id, notes FROM transactions WHERE tombstone = 0 AND notes LIKE '%#%'").all();
   db.close();

   const changes = rows.map(r => ({ ...r, next: moveTagsToEnd(r.notes) })).filter(r => r.next !== r.notes);
   console.log(`${rows.length} Buchungen mit Tag, ${changes.length} werden umgestellt${apply ? '' : ' (Trockenlauf, --apply zum Schreiben)'}`);
   for (const c of changes.slice(0, 15)) console.log(`  - ${c.notes.slice(0, 90)}\n  + ${c.next.slice(0, 90)}`);

   if (apply) {
      for (const c of changes) await api.updateTransaction(c.id, { notes: c.next });
      console.log(`${changes.length} Buchungen aktualisiert.`);
   }
   await client.close();
})().catch(e => { console.error(e); process.exit(1); });
