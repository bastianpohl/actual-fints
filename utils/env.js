const requireEnv = (keys) => {

   if (!Array.isArray(keys)) {
      throw new Error("Keys must be an array");
   }

   const missing = keys.filter(k => !process.env[k]);
   if (missing.length) throw new Error(`Missing Actual env vars: ${missing.join(', ')}`);

   return Object.fromEntries(keys.map(key => [key, process.env[key]]));
};

module.exports = { requireEnv };