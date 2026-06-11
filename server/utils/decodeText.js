const decodeText = text => {
   if (typeof text !== 'string') return '';
   const decoded = Buffer.from(text, 'latin1').toString('utf8');
   return decoded.includes('\uFFFD') ? text : decoded;
};

module.exports = { decodeText };