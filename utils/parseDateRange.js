const parseDateRange = () => {
   const args = process.argv.slice(2);
   const getArg = (flag) => {
      const index = args.indexOf(flag);
      return (index !== -1 && args[index + 1]) ? args[index + 1] : null;
   };

   const startDateStr = getArg('--start');
   const endDateStr = getArg('--end');
   const startDate = startDateStr ? new Date(startDateStr) : new Date();
   const endDate = endDateStr ? new Date(endDateStr) : new Date();

   if (endDate < startDate) {
      throw new Error('Enddatum darf nicht vor dem Startdatum liegen.');
   }  

   return { startDate, endDate };
};

module.exports = parseDateRange;