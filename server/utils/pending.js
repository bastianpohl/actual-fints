/**
 * Helpers to keep imported pending (vorgemerkte) bookings free of duplicates.
 *
 * A pending booking usually turns into a booked transaction a few days later, with a
 * different bank id and a slightly different date. As long as both are delivered by the
 * bank at the same time, the pending copy must not be imported a second time.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Converts Actual's integer date representation (20260610) into YYYY-MM-DD. */
const dateIntToIso = value => {
   const str = String(value ?? '');
   if (!/^\d{8}$/.test(str)) return null;
   return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
};

/** Absolute difference in days between two YYYY-MM-DD dates, or null if unparsable. */
const daysBetween = (isoA, isoB) => {
   const a = Date.parse(`${isoA}T00:00:00Z`);
   const b = Date.parse(`${isoB}T00:00:00Z`);
   if (Number.isNaN(a) || Number.isNaN(b)) return null;
   return Math.abs(a - b) / MS_PER_DAY;
};

// Card payments arrive with a scheme prefix once they are booked ("Visa Easypark Gmbh"),
// while the pending list carries the plain merchant name including its location
// ("Easypark Gmbh Easypark.De"). Stripping the prefix makes both comparable.
const CARD_PREFIXES = [
   'kartenzahlung',
   'mastercard',
   'kreditkarte',
   'debitkarte',
   'girocard',
   'maestro',
   'master',
   'visa',
   'vpay',
];

/**
 * Reduces a payee name to a comparable form: lowercase, alphanumeric only and without a
 * leading card scheme prefix.
 */
const normalizePayee = name => {
   let value = String(name ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]/g, '');

   for (const prefix of CARD_PREFIXES) {
      if (value.startsWith(prefix) && value.length - prefix.length >= 3) {
         value = value.slice(prefix.length);
         break;
      }
   }

   return value.slice(0, 24);
};

const payeesMatch = (a, b) => {
   const left = normalizePayee(a);
   const right = normalizePayee(b);
   if (!left || !right) return false;
   if (left === right) return true;
   if (left.length >= 5 && right.length >= 5) {
      return left.startsWith(right) || right.startsWith(left);
   }
   return false;
};

/**
 * Prepares booked transactions for matching: normalizes the date and keeps the original
 * row so callers can access ids, categories and everything else they selected.
 */
const buildBookedCandidates = bookedRows =>
   (bookedRows || []).map((row, index) => ({
      index,
      row,
      amount: row.amount,
      date: typeof row.date === 'string' ? row.date : dateIntToIso(row.date),
      payee: row.payee,
   }));

// Card payments in a foreign currency are booked with a slightly different euro amount
// than the pending list announced, because the exchange rate is applied at booking time
// (e.g. pending -30,43 EUR becomes -30,32 EUR plus a separate fee booking).
const AMOUNT_TOLERANCE_PERCENT = 0.02;
const AMOUNT_TOLERANCE_CAP = 500; // cents

/** Same amount, or close enough for a converted foreign currency booking. */
const amountsMatch = (bookedAmount, pendingAmount, exact) => {
   if (bookedAmount === pendingAmount) return true;
   if (exact) return false;
   if (!bookedAmount || !pendingAmount) return false;
   if (Math.sign(bookedAmount) !== Math.sign(pendingAmount)) return false;

   const tolerance = Math.min(Math.abs(pendingAmount) * AMOUNT_TOLERANCE_PERCENT, AMOUNT_TOLERANCE_CAP);
   return Math.abs(bookedAmount - pendingAmount) <= tolerance;
};

/**
 * Finds the booked transaction that corresponds to a pending booking: matching amount, a
 * date within the given window and a matching payee. Each booked transaction is matched
 * once. An exactly matching amount always wins over one that is only within tolerance.
 */
const findBookedCandidate = (candidates, consumed, pending, dayWindow) => {
   const search = exact => candidates.find(candidate => {
      if (consumed.has(candidate.index)) return false;
      if (!amountsMatch(candidate.amount, pending.amount, exact)) return false;
      if (!candidate.date || !pending.date) return false;
      const distance = daysBetween(candidate.date, pending.date);
      if (distance === null || distance > dayWindow) return false;
      return payeesMatch(candidate.payee, pending.payee ?? pending.payee_name);
   });

   return search(true) || search(false);
};

/**
 * Splits converted pending transactions into those that should be imported and those
 * that already exist as a booked transaction in Actual Budget.
 *
 * @param {Array<{amount:number,date:string,payee_name:string}>} pendingTransactions Converted pending transactions.
 * @param {Array<{amount:number,date:number|string,payee:string}>} bookedRows Booked transactions of the same account.
 * @param {{dayWindow?: number}} [options]
 * @returns {{fresh: Array, duplicates: Array}}
 */
const splitAlreadyBookedPending = (pendingTransactions, bookedRows, options = {}) => {
   const dayWindow = options.dayWindow ?? 4;
   const fresh = [];
   const duplicates = [];
   const consumed = new Set();
   const candidates = buildBookedCandidates(bookedRows);

   for (const transaction of pendingTransactions || []) {
      const match = findBookedCandidate(candidates, consumed, transaction, dayWindow);

      if (match) {
         consumed.add(match.index);
         duplicates.push(transaction);
      } else {
         fresh.push(transaction);
      }
   }

   return { fresh, duplicates };
};

/**
 * Pairs pending imports that are about to be deleted with the booked transaction they
 * turned into, so a category assigned to the pending booking can be carried over.
 *
 * Only pairs where the pending booking actually carries a category and the booked
 * transaction has none are returned - an existing category is never overwritten.
 *
 * @param {Array<{id:string,amount:number,date:number|string,payee:string,category:string|null}>} pendingRows
 * @param {Array<{id:string,amount:number,date:number|string,payee:string,category:string|null}>} bookedRows
 * @param {{dayWindow?: number}} [options]
 * @returns {Array<{pending: object, booked: object}>}
 */
const matchPendingToBooked = (pendingRows, bookedRows, options = {}) => {
   const dayWindow = options.dayWindow ?? 7;
   const consumed = new Set();
   const candidates = buildBookedCandidates(bookedRows).filter(candidate => !candidate.row.category);
   const pairs = [];

   for (const row of pendingRows || []) {
      if (!row.category) continue;
      const pending = { ...row, date: typeof row.date === 'string' ? row.date : dateIntToIso(row.date) };
      const match = findBookedCandidate(candidates, consumed, pending, dayWindow);
      if (!match) continue;
      consumed.add(match.index);
      pairs.push({ pending: row, booked: match.row });
   }

   return pairs;
};

/**
 * Selects the previously imported pending transactions that the bank no longer reports as
 * pending and that therefore have to be removed from Actual Budget.
 *
 * @param {Array<{id:string, imported_id:string}>} existingRows Pending imports in Actual Budget.
 * @param {Set<string>|Array<string>} stillPendingIds imported_ids the bank still reports as pending.
 * @returns {Array<{id:string, imported_id:string}>}
 */
const selectObsoletePendingImports = (existingRows, stillPendingIds) => {
   const keep = stillPendingIds instanceof Set ? stillPendingIds : new Set(stillPendingIds || []);
   return (existingRows || []).filter(row => !keep.has(row.imported_id));
};

module.exports = {
   amountsMatch,
   dateIntToIso,
   daysBetween,
   normalizePayee,
   payeesMatch,
   splitAlreadyBookedPending,
   matchPendingToBooked,
   selectObsoletePendingImports,
};
