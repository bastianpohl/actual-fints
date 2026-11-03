const UID_REGEXES = [
   /^\d+$/,
   /^[0-9a-fA-F]{32}$/,
   /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
];

const isUid = (value) => {
   if (value === null || value === undefined) return false;
   const candidate = String(value).trim();
   return UID_REGEXES.some(regex => regex.test(candidate));
}

// mt940-js hashes the booking without payee/reference, so two bookings with the same amount on the
// same day share one id and Actual drops the second. Occurrences beyond the number already in Actual
// (existing: Map id -> count) get a "-2", "-3" suffix; the rest keep their id and dedupe as before.
// ponytail: depends on stable bank order within a day.
function uniquifyIds(transactions, existing = new Map()) {
   const seen = new Map();
   return transactions.map(t => {
      const n = (seen.get(t.id) ?? 0) + 1;
      seen.set(t.id, n);
      return n <= Math.max(1, existing.get(t.id) ?? 0) ? t : { ...t, id: `${t.id}-${n}` };
   });
}

module.exports = {
   isUid,
   uniquifyIds
};