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

module.exports = {
   isUid
};