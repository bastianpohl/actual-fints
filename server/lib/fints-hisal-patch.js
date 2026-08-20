/**
 * Safe monkey-patch for the HISAL (Saldenrückmeldung) segment of the fints library.
 *
 * The library destructures seven field groups out of the HISAL segment. Banks that omit
 * the optional groups (pending balance, credit limit, available balance) make that
 * destructuring throw "undefined is not iterable", which breaks every balance request -
 * and with it the automatic reconciliation.
 *
 * The patch pads the missing groups and treats absent values as 0.
 */

let applied = false;

const applyHisalPatch = () => {
   if (applied) return true;

   try {
      const { HISAL } = require('fints/dist/segments/hisal');
      const { Parse } = require('fints/dist/parse');

      HISAL.prototype.deserialize = function (input) {
         while (input.length < 7) {
            input.push([]);
         }
         const [
            [accountNumber, subAccount, _country, blz],
            [productName],
            [currency],
            [_cb, booked],
            [_cp, pending],
            [dispo],
            [available]
         ] = input;
         this.account = { accountNumber, subAccount, blz, iban: null, bic: null };
         this.productName = productName;
         this.currency = currency;
         this.bookedBalance = booked ? Parse.num(booked) : 0.0;
         this.pendingBalance = pending ? Parse.num(pending) : 0.0;
         this.creditLimit = dispo ? Parse.num(dispo) : 0.0;
         this.availableBalance = available ? Parse.num(available) : 0.0;
      };

      applied = true;
      return true;
   } catch (patchErr) {
      console.error('Failed to apply HISAL patch:', patchErr.message);
      return false;
   }
};

module.exports = { applyHisalPatch };
