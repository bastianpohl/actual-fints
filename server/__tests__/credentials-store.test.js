const test = require('node:test');
const assert = require('assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CredentialsStore } = require('../lib/credentials-store');

const TEST_DB = path.join(__dirname, 'test-credentials.db');
const MASTER_KEY = 'test-master-key-for-unit-tests';

// Clean up test DB before/after each test
const cleanup = () => {
   try { fs.unlinkSync(TEST_DB); } catch {}
};

test('CredentialsStore throws without master key', () => {
   assert.throws(() => new CredentialsStore('', TEST_DB), /MASTER_KEY is required/);
   assert.throws(() => new CredentialsStore(null, TEST_DB), /MASTER_KEY is required/);
});

test('CredentialsStore can add and retrieve a bank', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   const bankId = store.addBank({
      name: 'TestBank',
      url: 'https://fints.testbank.de/fints',
      blz: '12345678',
      login: 'testuser',
      pin: 'secret-pin-123',
      accounts: [
         { iban: 'DE89370400440532013000', actualAccountName: 'Girokonto' },
         { iban: 'DE27100777770209299700', actualAccountName: 'Tagesgeld' },
      ],
   });

   assert.ok(bankId > 0);

   const bank = store.getBank('TestBank');
   assert.equal(bank.name, 'TestBank');
   assert.equal(bank.fints.url, 'https://fints.testbank.de/fints');
   assert.equal(bank.fints.blz, '12345678');
   assert.equal(bank.fints.login, 'testuser');
   assert.equal(bank.fints.pin, 'secret-pin-123');
   assert.equal(bank.accounts.length, 2);

   const girokonto = bank.accounts.find(a => a.iban === 'DE89370400440532013000');
   assert.ok(girokonto, 'Girokonto account should exist');
   assert.equal(girokonto.actualAccountName, 'Girokonto');

   const tagesgeld = bank.accounts.find(a => a.iban === 'DE27100777770209299700');
   assert.ok(tagesgeld, 'Tagesgeld account should exist');
   assert.equal(tagesgeld.actualAccountName, 'Tagesgeld');

   store.close();
});

test('CredentialsStore encrypts data on disk', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   store.addBank({
      name: 'SecretBank',
      url: 'https://secret.example.com',
      blz: '99887766',
      login: 'top-secret-login',
      pin: 'ultra-secret-pin',
      accounts: [],
   });

   store.close();

   // Read raw DB file and verify credentials are NOT in plaintext
   const rawContent = fs.readFileSync(TEST_DB, 'utf8');
   assert.ok(!rawContent.includes('ultra-secret-pin'), 'PIN should not appear in plaintext');
   assert.ok(!rawContent.includes('top-secret-login'), 'Login should not appear in plaintext');
   assert.ok(!rawContent.includes('https://secret.example.com'), 'URL should not appear in plaintext');
});

test('CredentialsStore cannot decrypt with wrong master key', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   store.addBank({
      name: 'LockedBank',
      url: 'https://locked.example.com',
      blz: '11223344',
      login: 'locked-login',
      pin: 'locked-pin',
      accounts: [],
   });

   store.close();

   // Open with different key – decryption should fail
   const wrongStore = new CredentialsStore('wrong-master-key', TEST_DB);
   assert.throws(() => wrongStore.getAllBanks(), /Unsupported state/);
   wrongStore.close();
});

test('CredentialsStore getAllBanks returns all banks', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   store.addBank({ name: 'Bank A', url: 'https://a.de', blz: '11111111', login: 'a', pin: 'a', accounts: [] });
   store.addBank({ name: 'Bank B', url: 'https://b.de', blz: '22222222', login: 'b', pin: 'b', accounts: [] });

   const banks = store.getAllBanks();
   assert.equal(banks.length, 2);
   assert.equal(banks[0].name, 'Bank A');
   assert.equal(banks[1].name, 'Bank B');

   store.close();
});

test('CredentialsStore updateBank updates credentials', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   store.addBank({ name: 'UpdateMe', url: 'https://old.de', blz: '33333333', login: 'old', pin: 'old', accounts: [] });
   store.updateBank('UpdateMe', { url: 'https://new.de', pin: 'new-pin' });

   const updated = store.getBank('UpdateMe');
   assert.equal(updated.fints.url, 'https://new.de');
   assert.equal(updated.fints.pin, 'new-pin');
   assert.equal(updated.fints.login, 'old'); // unchanged

   store.close();
});

test('CredentialsStore updateBank replaces accounts', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   store.addBank({
      name: 'AccBank',
      url: 'https://acc.de',
      blz: '44444444',
      login: 'x',
      pin: 'x',
      accounts: [{ iban: 'DE11111111111111111111', actualAccountName: 'Old Account' }],
   });

   store.updateBank('AccBank', {
      accounts: [{ iban: 'DE22222222222222222222', actualAccountName: 'New Account' }],
   });

   const bank = store.getBank('AccBank');
   assert.equal(bank.accounts.length, 1);
   assert.equal(bank.accounts[0].iban, 'DE22222222222222222222');

   store.close();
});

test('CredentialsStore removeBank deletes bank and accounts', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   store.addBank({
      name: 'DeleteMe',
      url: 'https://del.de',
      blz: '55555555',
      login: 'del',
      pin: 'del',
      accounts: [{ iban: 'DE99999999999999999999', actualAccountName: 'Gone' }],
   });

   const deleted = store.removeBank('DeleteMe');
   assert.equal(deleted, true);

   const bank = store.getBank('DeleteMe');
   assert.equal(bank, null);

   const notFound = store.removeBank('DeleteMe');
   assert.equal(notFound, false);

   store.close();
});

test('CredentialsStore addBank rejects missing fields', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   assert.throws(
      () => store.addBank({ name: 'Incomplete', url: '', blz: '', login: '', pin: '' }),
      /All bank fields/
   );

   store.close();
});

test('CredentialsStore addBank rejects duplicate bank name', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   store.addBank({ name: 'Unique', url: 'https://u.de', blz: '66666666', login: 'u', pin: 'u', accounts: [] });

   assert.throws(
      () => store.addBank({ name: 'Unique', url: 'https://u2.de', blz: '77777777', login: 'u2', pin: 'u2', accounts: [] }),
      /UNIQUE constraint failed/
   );

   store.close();
});

test('CredentialsStore listBanks returns names and counts', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   store.addBank({
      name: 'ListBank',
      url: 'https://list.de',
      blz: '88888888',
      login: 'l',
      pin: 'l',
      accounts: [
         { iban: 'DE11111111111111111111', actualAccountName: 'Acc1' },
         { iban: 'DE22222222222222222222', actualAccountName: 'Acc2' },
      ],
   });

   const list = store.listBanks();
   assert.equal(list.length, 1);
   assert.equal(list[0].name, 'ListBank');
   assert.equal(list[0].accountCount, 2);

   store.close();
});

test('CredentialsStore can set, get, encrypt, decrypt and delete config values', (t) => {
   t.after(cleanup);
   const store = new CredentialsStore(MASTER_KEY, TEST_DB);

   // Test plaintext config
   store.setConfig('test_plain_key', 'plain_value');
   assert.equal(store.getConfig('test_plain_key'), 'plain_value');

   // Test encrypted config
   store.setEncryptedConfig('test_encrypted_key', 'super_secret_value');
   assert.equal(store.getEncryptedConfig('test_encrypted_key'), 'super_secret_value');

   // Verify it is encrypted on disk
   const rawConfig = store.getConfig('test_encrypted_key');
   assert.notEqual(rawConfig, 'super_secret_value');
   assert.ok(rawConfig.includes(':')); // Part of IV:TAG:CIPHERTEXT format

   // Test delete config
   store.deleteConfig('test_plain_key');
   assert.equal(store.getConfig('test_plain_key'), null);

   store.deleteConfig('test_encrypted_key');
   assert.equal(store.getEncryptedConfig('test_encrypted_key'), null);

   store.close();
});
