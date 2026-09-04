// Shared CSV cell escaping (formula-injection + structure protection).
// A single home so every CSV export quotes exactly the same way.

const escapeCsvCell = (val) => {
  const str = String(val ?? '');
  // Block formula-injection prefixes and characters that break CSV structure
  if (
    str.includes('"') ||
    str.includes(',') ||
    str.includes('\n') ||
    str.includes('\r') ||
    str.startsWith('=') ||
    str.startsWith('+') ||
    str.startsWith('-') ||
    str.startsWith('@') ||
    str.startsWith('\t') ||
    str.startsWith('http') ||
    str.startsWith('HTTP')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

module.exports = { escapeCsvCell };
