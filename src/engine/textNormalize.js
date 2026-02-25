export function normalizeCellText(input) {
  const value = typeof input === 'string' ? input : input == null ? '' : String(input);
  const trimmed = value.trim();

  if (trimmed === '' || trimmed.toLowerCase() === 'x') {
    return 'ח';
  }

  return value;
}
