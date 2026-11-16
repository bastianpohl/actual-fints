// Zahlweg-Tags (Bankbuchungstext + Actual-Regeln). Alle anderen #Tags (Kategorie, Person, Urlaub …) bleiben vorne.
const PAYMENT_TAGS = new Set([
   'ApplePay', 'Paypal', 'Lastschrifteinzug', 'Entgelt', 'Gutschrift', 'GutschriftausDauerauftrag',
   'Echtzeitüberweisung', 'Dauerauftrag/Terminueberweisung', 'Gehalt/Rente', 'Überweisung',
]);

const LEAD_RE = /^(?:#[^\s#]+\s*)+/;
const TAIL_RE = /(?:\s+#[^\s#]+)+$/;

// Zahlweg-Tags stehen hinten: erst Buchungstext (#Lastschrifteinzug), dann Bezahlart (#ApplePay, #Paypal).
const LAST = new Set(['ApplePay', 'Paypal']);
const isPay = t => PAYMENT_TAGS.has(t.slice(1));

// Verschiebt führende Zahlweg-Tags ans Ende der Notiz und ordnet die End-Tags (historische Buchungen). Idempotent.
const moveTagsToEnd = notes => {
   if (!notes) return notes;
   const lead = notes.match(LEAD_RE)?.[0] ?? '';
   const leadTags = lead.match(/#[^\s#]+/g) || [];
   const moved = leadTags.filter(isPay);
   const keep = leadTags.filter(t => !isPay(t));
   let rest = notes.slice(lead.length).trim();

   // "#Gutschrift aus Dauerauftrag": der Buchungstext hat Leerzeichen, der Rest gehört zum Tag
   if (moved.length && /^aus Dauerauftrag\b/.test(rest) && moved.at(-1) === '#Gutschrift') {
      moved[moved.length - 1] += ' aus Dauerauftrag';
      rest = rest.slice('aus Dauerauftrag'.length).trim();
   }

   // bereits angehängte Zahlweg-Tags am Ende übernehmen, nicht doppeln
   const tail = [];
   for (let m; (m = rest.match(/(?:^|\s)(#[^\s#]+)$/)) && isPay(m[1]);) {
      tail.unshift(m[1]);
      rest = rest.slice(0, m.index).trim();
   }

   const all = [...moved, ...tail].filter((t, i, a) => a.findIndex(x => x.split(' ')[0] === t.split(' ')[0]) === i);
   if (!all.length) return notes;
   all.sort((a, b) => LAST.has(a.slice(1)) - LAST.has(b.slice(1)));
   return [keep.join(' '), rest, all.join(' ')].filter(Boolean).join(' ');
};

module.exports = { moveTagsToEnd, PAYMENT_TAGS };
