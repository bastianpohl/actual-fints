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
   defaultStartDate.setDate(defaultStartDate.getDate() - 14); // Default to 14 days ago to capture recent/weekend/deleted transactions
   
   const startDate = startDateStr ? new Date(startDateStr) : defaultStartDate;
   const endDate = endDateStr ? new Date(endDateStr) : new Date();

   if (endDate < startDate) {
      throw new Error('Enddatum darf nicht vor dem Startdatum liegen.');
   }  

   return { startDate, endDate };
};

module.exports = parseDateRange;