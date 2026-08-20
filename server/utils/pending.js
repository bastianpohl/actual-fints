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

/** Reduces a payee name to a comparable form (lowercase, alphanumeric only). */
const normalizePayee = name =>
   String(name ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]/g, '')
      .slice(0, 24);

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

   const candidates = (bookedRows || []).map((row, index) => ({
      index,
      amount: row.amount,
      date: typeof row.date === 'string' ? row.date : dateIntToIso(row.date),
      payee: row.payee,
   }));

   for (const transaction of pendingTransactions || []) {
      const match = candidates.find(candidate => {
         if (consumed.has(candidate.index)) return false;
         if (candidate.amount !== transaction.amount) return false;
         if (!candidate.date) return false;
         const distance = daysBetween(candidate.date, transaction.date);
         if (distance === null || distance > dayWindow) return false;
         return payeesMatch(candidate.payee, transaction.payee_name);
      });

      if (match) {
         consumed.add(match.index);
         duplicates.push(transaction);
      } else {
         fresh.push(transaction);
      }
   }

   return { fresh, duplicates };
};

module.exports = {
   dateIntToIso,
   daysBetween,
   normalizePayee,
   payeesMatch,
   splitAlreadyBookedPending,
};
