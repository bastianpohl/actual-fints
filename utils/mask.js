/**
 * Maskiert eine IBAN für Log-Ausgaben (DSGVO-konform).
 * Zeigt nur Länderkennung und die letzten 4 Zeichen.
 * Beispiel: DE89370400440532013000 -> DE***3000
 */
const maskIban = (iban) => {
   if (!iban || typeof iban !== 'string') return '***';
   const trimmed = iban.replace(/\s/g, '');
   if (trimmed.length <= 6) return '***';
   return trimmed.slice(0, 2) + '***' + trimmed.slice(-4);
};

module.exports = { maskIban };
