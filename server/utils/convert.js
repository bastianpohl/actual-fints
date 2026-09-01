const { decodeText } = require('./decodeText');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const convertAmount = (amount, isCredit) => {
   const factor = isCredit ? 1 : -1;
   return Math.round(amount * 100 * factor);
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

module.exports = {
   convertAmount,
   getNotes,
   getPayeeName,
   convertTransaction,
};
