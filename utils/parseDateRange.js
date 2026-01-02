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
   const startDate = startDateStr ? new Date(startDateStr) : new Date();
   const endDate = endDateStr ? new Date(endDateStr) : new Date();

   if (endDate < startDate) {
      throw new Error('Enddatum darf nicht vor dem Startdatum liegen.');
   }  

   return { startDate, endDate };
};

module.exports = parseDateRange;