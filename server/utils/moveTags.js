// Zahlweg-Tags (Bankbuchungstext + Actual-Regeln). Alle anderen #Tags (Kategorie, Person, Urlaub …) bleiben vorne.
const PAYMENT_TAGS = new Set([
   'ApplePay', 'Paypal', 'Lastschrifteinzug', 'Entgelt', 'Gutschrift', 'GutschriftausDauerauftrag',
   'Echtzeitüberweisung', 'Dauerauftrag/Terminueberweisung', 'Gehalt/Rente', 'Überweisung',
]);

const LEAD_RE = /^(?:#[^\s#]+\s*)+/;
const TAIL_RE = /(?:\s+#[^\s#]+)+$/;

// Verschiebt führende Zahlweg-Tags ans Ende der Notiz (historische Buchungen). Idempotent.
const moveTagsToEnd = notes => {
   if (!notes) return notes;
   const lead = notes.match(LEAD_RE)?.[0] ?? '';
   const leadTags = lead.match(/#[^\s#]+/g) || [];
   const moved = leadTags.filter(t => PAYMENT_TAGS.has(t.slice(1)));
   if (!moved.length) return notes;

   const keep = leadTags.filter(t => !PAYMENT_TAGS.has(t.slice(1)));
   let rest = notes.slice(lead.length).trim();

   // "#Gutschrift aus Dauerauftrag": der Buchungstext hat Leerzeichen, der Rest gehört zum Tag
   const text = /^aus Dauerauftrag\b/.test(rest) && moved.at(-1) === '#Gutschrift' ? ' aus Dauerauftrag' : '';
   if (text) rest = rest.slice(text.length).trim();
   moved[moved.length - 1] += text;

   // bereits angehängte Zahlweg-Tags am Ende übernehmen, nicht doppeln
   const tail = rest.match(TAIL_RE)?.[0] ?? '';
   const tailTags = (tail.match(/#[^\s#]+/g) || []);
   const tailPayment = tailTags.filter(t => PAYMENT_TAGS.has(t.slice(1)));
   if (tailPayment.length === tailTags.length && tailPayment.length) rest = rest.slice(0, rest.length - tail.length).trim();
   else tailPayment.length = 0;

   const tags = [...moved, ...tailPayment.filter(t => !moved.some(m => m.split(' ')[0] === t))];
   return [keep.join(' '), rest, tags.join(' ')].filter(Boolean).join(' ');
};

module.exports = { moveTagsToEnd, PAYMENT_TAGS };
