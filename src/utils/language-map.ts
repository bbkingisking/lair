// ISO 639-3 → ISO 15924 script code
// Source: IANA language subtag registry / CLDR
const languageToScript: Record<string, string> = {
  // Latin script
  eng: 'Latn',
  fra: 'Latn',
  spa: 'Latn',
  ita: 'Latn',
  deu: 'Latn',
  por: 'Latn',
  lat: 'Latn',
  // Cyrillic
  bul: 'Cyrl',
  rus: 'Cyrl',
  srp: 'Cyrl',
  ukr: 'Cyrl',
  bel: 'Cyrl',
  // Arabic / Persian
  fas: 'Arab',
  ara: 'Arab',
  pes: 'Arab',
  // CJK
  lzh: 'Hant',
  zho: 'Hant',
  'zho-Hans': 'Hans',
  'zho-Hant': 'Hant',
  jpn: 'Jpan',
  // Bengali
  ben: 'Beng',
  // Korean
  kor: 'Hang',
  okm: 'Hang',
  // Add more as your collection grows
};

// ISO 15924 → CSS class
const scriptToClass: Record<string, string> = {
  Latn: 'script-latin',
  Cyrl: 'script-cyrillic',
  Arab: 'script-arabic',
  Hans: 'script-hans',
  Hant: 'script-hant',
  Jpan: 'script-japanese',
  Hang: 'script-hangul',
  Beng: 'script-bengali',
};

export function getScriptClass(language: string): string {
  const script = languageToScript[language] || 'Latn';
  return scriptToClass[script] || 'script-latin';
}

export function getScript(language: string): string {
  return languageToScript[language] || 'Latn';
}
