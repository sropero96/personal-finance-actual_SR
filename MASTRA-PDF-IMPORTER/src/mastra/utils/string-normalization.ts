// Basic string normalization utilities for Sprint 2 Data Curator
// Keeps implementation deliberately minimal; can be extended later.

// Lightweight accent stripping without external dependency
const accentMap: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a', ã: 'a', Á: 'a', À: 'a', Ä: 'a', Â: 'a', Ã: 'a',
  é: 'e', è: 'e', ë: 'e', ê: 'e', É: 'e', È: 'e', Ë: 'e', Ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i', Í: 'i', Ì: 'i', Ï: 'i', Î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o', õ: 'o', Ó: 'o', Ò: 'o', Ö: 'o', Ô: 'o', Õ: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u', Ú: 'u', Ù: 'u', Ü: 'u', Û: 'u',
  ñ: 'n', Ñ: 'n'
};

function removeAccentsLocal(value: string): string {
  return value.split('').map(c => accentMap[c] || c).join('');
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function toLower(value: string): string {
  return value.toLowerCase();
}

export function stripAccents(value: string): string {
  return removeAccentsLocal(value);
}

export function removeReferenceNumbers(value: string): string {
  // Remove long numeric sequences (>=6) or alphanumeric codes typical of references
  return value.replace(/\b[0-9A-Z]{6,}\b/g, '').replace(/\s+/g, ' ').trim();
}

export function baseNormalizedKey(description: string): string {
  return normalizeWhitespace(stripAccents(toLower(removeReferenceNumbers(description))));
}
