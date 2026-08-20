const { decodeText } = require('./decodeText');

// Prefix for the imported_id of pending (vorgemerkte) transactions. Every transaction
// carrying this prefix was created by this importer as a preliminary booking and is
// removed again at the beginning of the next import run.
const PENDING_ID_PREFIX = 'pending-';
const PENDING_NOTE_PREFIX = '⏳ Vorgemerkt';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const convertAmount = (amount, isCredit) => {
   const factor = isCredit ? 1 : -1;
   return Math.round(amount * 100 * factor);
};

/**
 * Normalizes a FinTS date (string or Date) into YYYY-MM-DD, or null if unusable.
 */
const normalizeDate = value => {
   if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const yyyy = value.getFullYear();
      const mm = String(value.getMonth() + 1).padStart(2, '0');
      const dd = String(value.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
   }
   if (typeof value === 'string' && DATE_PATTERN.test(value.slice(0, 10))) {
      return value.slice(0, 10);
   }
   return null;
};

const getNotes = transaction => {
   const descriptionStructured = transaction.descriptionStructured || {};
   const {
      reference = {},
      iban = descriptionStructured.iban || '',
      bic = '',
      text = '',
   } = descriptionStructured;

   const parts = [];

   if (text) parts.push(`#${decodeText(text).trim()}`);
   if (reference?.text) parts.push(decodeText(reference.text));
   if (iban) parts.push(`IBAN: ${iban}`);
   if (bic) parts.push(`BIC: ${bic}`);

   if (reference?.endToEndRef) parts.push(`E2E: ${reference.endToEndRef}`);
   if (reference?.mandateRef) parts.push(`MD: ${reference.mandateRef}`);
   if (reference?.creditorId) parts.push(`CID: ${reference.creditorId}`);

   if (transaction.customerReference) parts.push(`CR: ${transaction.customerReference}`);
   if (transaction.bankReference) parts.push(`BR: ${transaction.bankReference}`);

   const notes = parts.join(' ').replace(/\s+/g, ' ');
   return notes.slice(0, 2000);
};

const getPayeeName = transaction =>
   transaction?.descriptionStructured?.name || '';

const assertConvertible = transaction => {
   if (!transaction || typeof transaction !== 'object') throw new Error('Invalid transaction object');
   if (typeof transaction.amount !== 'number' || typeof transaction.isCredit !== 'boolean') {
      throw new Error('Transaction must have numeric amount and boolean isCredit');
   }
   if (!transaction.id) throw new Error('Transaction must have an id');
};

const convertTransaction = (transaction, accountId) => {
   if (!accountId) throw new Error('No account ID provided for transaction conversion');
   assertConvertible(transaction);
   if (typeof transaction.entryDate !== 'string' || !DATE_PATTERN.test(transaction.entryDate)) {
      throw new Error('Transaction must have a valid entryDate in YYYY-MM-DD format');
   }

   return {
      account: accountId,
      amount: convertAmount(transaction.amount, transaction.isCredit),
      date: transaction.entryDate,
      imported_id: transaction.id,
      payee_name: getPayeeName(transaction),
      notes: getNotes(transaction),
   };
};

/**
 * Converts a pending (vorgemerkter) bank transaction into an Actual Budget transaction.
 * Pending bookings are imported as *uncleared* and carry a prefixed imported_id so they
 * can be identified and removed again before the next import run.
 */
const convertPendingTransaction = (transaction, accountId) => {
   if (!accountId) throw new Error('No account ID provided for transaction conversion');
   assertConvertible(transaction);

   // Pending bookings often carry the fetch date as entryDate, the value date is closer
   // to the date the booked transaction will eventually receive.
   const date = normalizeDate(transaction.valueDate) || normalizeDate(transaction.entryDate);
   if (!date) throw new Error('Pending transaction must have a valid valueDate or entryDate');

   const notes = getNotes(transaction);

   return {
      account: accountId,
      amount: convertAmount(transaction.amount, transaction.isCredit),
      date,
      imported_id: `${PENDING_ID_PREFIX}${transaction.id}`,
      payee_name: getPayeeName(transaction),
      notes: notes ? `${PENDING_NOTE_PREFIX} ${notes}`.slice(0, 2000) : PENDING_NOTE_PREFIX,
      cleared: false,
   };
};

module.exports = {
   convertAmount,
   normalizeDate,
   getNotes,
   getPayeeName,
   convertTransaction,
   convertPendingTransaction,
   PENDING_ID_PREFIX,
   PENDING_NOTE_PREFIX,
};
