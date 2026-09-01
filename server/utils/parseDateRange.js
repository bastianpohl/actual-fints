// Banks do not deliver every booking on the day it is dated. Card fees and foreign
// currency charges in particular are posted a day or two after the purchase, backdated
// to the entry date of the purchase itself. A default range of "today only" therefore
// never sees them again once the day has passed, and the account drifts apart from
// Actual Budget for good. The import looks back a few days on every run instead -
// re-reading a booking is free because Actual Budget deduplicates by imported_id.
const DEFAULT_LOOKBACK_DAYS = 7;

/** Number of days the default import range reaches into the past. */
const getLookbackDays = () => {
   const configured = Number(process.env.SYNC_LOOKBACK_DAYS);
   if (Number.isFinite(configured) && configured >= 0) return Math.floor(configured);
   return DEFAULT_LOOKBACK_DAYS;
};

const parseDateRange = () => {
   const args = process.argv.slice(2);
   const getArg = (...flags) => {
      for (const flag of flags) {
         const index = args.indexOf(flag);
         if (index !== -1) {
            const value = args[index + 1];
            if (value && !value.startsWith('--')) {
               return value;
            }
         }
      }
      return null;
   };

   const startDateStr = getArg('--start', '--from');
   const endDateStr = getArg('--end', '--to');

   const defaultStartDate = new Date();
   defaultStartDate.setDate(defaultStartDate.getDate() - getLookbackDays());

   const startDate = startDateStr ? new Date(startDateStr) : defaultStartDate;
   const endDate = endDateStr ? new Date(endDateStr) : new Date();

   if (endDate < startDate) {
      throw new Error('Enddatum darf nicht vor dem Startdatum liegen.');
   }

   return { startDate, endDate };
};

module.exports = parseDateRange;
module.exports.getLookbackDays = getLookbackDays;
module.exports.DEFAULT_LOOKBACK_DAYS = DEFAULT_LOOKBACK_DAYS;
