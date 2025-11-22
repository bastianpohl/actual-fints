const {
  convertAmountForDB,
  decodeText,
  getNotes,
  getPayeeName,
  convertTransaction,
} = require('../index');

describe('convertAmountForDB', () => {
  test('liefert positiven Wert bei Kredit', () => {
    expect(convertAmountForDB(12.345, true)).toBe(1235);
  });

  test('liefert negativen Wert bei Debit', () => {
    expect(convertAmountForDB(99.99, false)).toBe(-9999);
  });
});

describe('decodeText', () => {
  test('dekodiert Latin-1 nach UTF-8', () => {
    expect(decodeText('Ãberweisung')).toBe('Überweisung');
  });

  test('gibt leeren String für Nicht-Strings zurück', () => {
    expect(decodeText(null)).toBe('');
  });
});

describe('getNotes', () => {
  test('baut Notiz aus strukturierten Feldern auf', () => {
    const transaction = {
      descriptionStructured: {
        reference: { text: 'Ãberweisung', endToEndRef: 'E2E123' },
        text: 'Ãberweisung Bonus',
        iban: 'DE44500105175407324931',
        bic: 'COBADEFFXXX',
      },
      customerReference: 'CUST',
      bankReference: 'BANK',
    };

    const notes = getNotes(transaction);

    expect(notes).toBe(
      'Überweisung #Überweisung Bonus IBAN: DE44500105175407324931 BIC: COBADEFFXXX E2E: E2E123 CR: CUST BR: BANK'
    );
  });

  test('verträgt fehlende Felder', () => {
    const transaction = { descriptionStructured: {} };
    expect(getNotes(transaction)).toBe('');
  });
});

describe('getPayeeName', () => {
  test('liefert Namen aus descriptionStructured', () => {
    const transaction = { descriptionStructured: { name: 'Müller GmbH' } };
    expect(getPayeeName(transaction)).toBe('Müller GmbH');
  });

  test('gibt leeren String zurück, wenn kein Name vorhanden', () => {
    expect(getPayeeName({})).toBe('');
  });
});

describe('convertTransaction', () => {
  test('konvertiert Transaktion vollständig', async () => {
    const transaction = {
      amount: 10.5,
      isCredit: true,
      entryDate: '2025-11-22',
      id: 'tx-1',
      descriptionStructured: {
        name: 'Müller GmbH',
        reference: { text: 'Ãberweisung' },
      },
    };

    const result = convertTransaction(transaction, 'account-1');

    expect(result).toMatchObject({
      account: 'account-1',
      amount: 1050,
      date: '2025-11-22',
      imported_id: 'tx-1',
      payee_name: 'Müller GmbH',
    });

    expect(result.notes).toBe('Überweisung');
  });
});