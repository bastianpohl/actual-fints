class AsyncLock {
   constructor() {
      this.promise = Promise.resolve();
   }

   acquire() {
      let release;
      const nextPromise = new Promise(resolve => {
         release = resolve;
      });
      const currentPromise = this.promise;
      this.promise = currentPromise.then(() => nextPromise);
      return currentPromise.then(() => release);
   }
}

const actualApiLock = new AsyncLock();

module.exports = { actualApiLock };
