// ISO 639-1 (2-character codes)
export const ISO1 = {
  AR: 'ar',
  BG: 'bg',
  BN: 'bn',
  CS: 'cs',
  DA: 'da',
  DE: 'de',
  EL: 'el',
  EN: 'en',
  ES: 'es',
  ET: 'et',
  FA: 'fa',
  FI: 'fi',
  FR: 'fr',
  HI: 'hi',
  HR: 'hr',
  HU: 'hu',
  ID: 'id',
  IS: 'is',
  IT: 'it',
  JA: 'ja',
  KO: 'ko',
  LT: 'lt',
  LV: 'lv',
  MT: 'mt',
  NL: 'nl',
  NO: 'no',
  PL: 'pl',
  PT: 'pt',
  RO: 'ro',
  RU: 'ru',
  SK: 'sk',
  SL: 'sl',
  SR: 'sr',
  SV: 'sv',
  TR: 'tr',
  ZH: 'zh',
} as const

// ISO 639-2/T (3-character terminologic codes)
export const ISO2T = {
  ARA: 'ara',
  BEN: 'ben',
  BUL: 'bul',
  CES: 'ces',
  DAN: 'dan',
  DEU: 'deu',
  ELL: 'ell',
  ENG: 'eng',
  EST: 'est',
  FAS: 'fas',
  FIN: 'fin',
  FRA: 'fra',
  HIN: 'hin',
  HRV: 'hrv',
  HUN: 'hun',
  IND: 'ind',
  ISL: 'isl',
  ITA: 'ita',
  JPN: 'jpn',
  KOR: 'kor',
  LAV: 'lav',
  LIT: 'lit',
  MLT: 'mlt',
  NLD: 'nld',
  NOR: 'nor',
  POL: 'pol',
  POR: 'por',
  RON: 'ron',
  RUS: 'rus',
  SLK: 'slk',
  SLV: 'slv',
  SPA: 'spa',
  SRP: 'srp',
  SWE: 'swe',
  TUR: 'tur',
  ZHO: 'zho',
} as const

// ISO 639-2/B (3-character bibliographic codes)
// Only includes languages where B and T codes differ
export const ISO2B = {
  CHI: 'chi',
  CZE: 'cze',
  DUT: 'dut',
  FRE: 'fre',
  GER: 'ger',
  GRE: 'gre',
  ICE: 'ice',
  PER: 'per',
  RUM: 'rum',
  SLO: 'slo',
} as const

// ISO 639-2/B to ISO 639-2/T mapping
export const iso2BToIso2T = {
  [ISO2B.CHI]: ISO2T.ZHO,
  [ISO2B.CZE]: ISO2T.CES,
  [ISO2B.DUT]: ISO2T.NLD,
  [ISO2B.FRE]: ISO2T.FRA,
  [ISO2B.GER]: ISO2T.DEU,
  [ISO2B.GRE]: ISO2T.ELL,
  [ISO2B.ICE]: ISO2T.ISL,
  [ISO2B.PER]: ISO2T.FAS,
  [ISO2B.RUM]: ISO2T.RON,
  [ISO2B.SLO]: ISO2T.SLK,
} as const

export type ISOCode1 = (typeof ISO1)[keyof typeof ISO1]
export type ISOCode2T = (typeof ISO2T)[keyof typeof ISO2T]
export type ISOCode2B =
  | (typeof ISO2B)[keyof typeof ISO2B]
  | Exclude<ISOCode2T, (typeof iso2BToIso2T)[keyof typeof iso2BToIso2T]>

export type ISOCode2 = ISOCode2T | ISOCode2B

// ISO 639-1 to ISO 639-2/T mapping
export const iso1ToIso2T: Record<ISOCode1, ISOCode2T> = {
  [ISO1.AR]: ISO2T.ARA,
  [ISO1.BG]: ISO2T.BUL,
  [ISO1.BN]: ISO2T.BEN,
  [ISO1.CS]: ISO2T.CES,
  [ISO1.DA]: ISO2T.DAN,
  [ISO1.DE]: ISO2T.DEU,
  [ISO1.EL]: ISO2T.ELL,
  [ISO1.EN]: ISO2T.ENG,
  [ISO1.ES]: ISO2T.SPA,
  [ISO1.ET]: ISO2T.EST,
  [ISO1.FA]: ISO2T.FAS,
  [ISO1.FI]: ISO2T.FIN,
  [ISO1.FR]: ISO2T.FRA,
  [ISO1.HI]: ISO2T.HIN,
  [ISO1.HR]: ISO2T.HRV,
  [ISO1.HU]: ISO2T.HUN,
  [ISO1.ID]: ISO2T.IND,
  [ISO1.IS]: ISO2T.ISL,
  [ISO1.IT]: ISO2T.ITA,
  [ISO1.JA]: ISO2T.JPN,
  [ISO1.KO]: ISO2T.KOR,
  [ISO1.LT]: ISO2T.LIT,
  [ISO1.LV]: ISO2T.LAV,
  [ISO1.MT]: ISO2T.MLT,
  [ISO1.NL]: ISO2T.NLD,
  [ISO1.NO]: ISO2T.NOR,
  [ISO1.PL]: ISO2T.POL,
  [ISO1.PT]: ISO2T.POR,
  [ISO1.RO]: ISO2T.RON,
  [ISO1.RU]: ISO2T.RUS,
  [ISO1.SK]: ISO2T.SLK,
  [ISO1.SL]: ISO2T.SLV,
  [ISO1.SR]: ISO2T.SRP,
  [ISO1.SV]: ISO2T.SWE,
  [ISO1.TR]: ISO2T.TUR,
  [ISO1.ZH]: ISO2T.ZHO,
}

// ISO 639-2/T to ISO 639-1 reverse mapping
export const iso2ToIso1: Record<ISOCode2, ISOCode1> = {
  [ISO2T.ARA]: ISO1.AR,
  [ISO2T.BUL]: ISO1.BG,
  [ISO2T.BEN]: ISO1.BN,
  [ISO2T.CES]: ISO1.CS,
  [ISO2T.DAN]: ISO1.DA,
  [ISO2T.DEU]: ISO1.DE,
  [ISO2T.ELL]: ISO1.EL,
  [ISO2T.ENG]: ISO1.EN,
  [ISO2T.SPA]: ISO1.ES,
  [ISO2T.EST]: ISO1.ET,
  [ISO2T.FAS]: ISO1.FA,
  [ISO2T.FIN]: ISO1.FI,
  [ISO2T.FRA]: ISO1.FR,
  [ISO2T.HIN]: ISO1.HI,
  [ISO2T.HRV]: ISO1.HR,
  [ISO2T.HUN]: ISO1.HU,
  [ISO2T.IND]: ISO1.ID,
  [ISO2T.ISL]: ISO1.IS,
  [ISO2T.ITA]: ISO1.IT,
  [ISO2T.JPN]: ISO1.JA,
  [ISO2T.KOR]: ISO1.KO,
  [ISO2T.LIT]: ISO1.LT,
  [ISO2T.LAV]: ISO1.LV,
  [ISO2T.MLT]: ISO1.MT,
  [ISO2T.NLD]: ISO1.NL,
  [ISO2T.NOR]: ISO1.NO,
  [ISO2T.POL]: ISO1.PL,
  [ISO2T.POR]: ISO1.PT,
  [ISO2T.RON]: ISO1.RO,
  [ISO2T.RUS]: ISO1.RU,
  [ISO2T.SLK]: ISO1.SK,
  [ISO2T.SLV]: ISO1.SL,
  [ISO2T.SRP]: ISO1.SR,
  [ISO2T.SWE]: ISO1.SV,
  [ISO2T.TUR]: ISO1.TR,
  [ISO2T.ZHO]: ISO1.ZH,
  [ISO2B.CHI]: ISO1.ZH,
  [ISO2B.CZE]: ISO1.CS,
  [ISO2B.DUT]: ISO1.NL,
  [ISO2B.FRE]: ISO1.FR,
  [ISO2B.GER]: ISO1.DE,
  [ISO2B.GRE]: ISO1.EL,
  [ISO2B.ICE]: ISO1.IS,
  [ISO2B.PER]: ISO1.FA,
  [ISO2B.RUM]: ISO1.RO,
  [ISO2B.SLO]: ISO1.SK,
}

// Utility functions
/**
 * Normalize a language code to ISO 639-1 (2-character) format
 * Accepts ISO 639-1, ISO 639-2/B, or ISO 639-2/T codes
 */
export const normalizeToIso1 = (code?: string): string | undefined => {
  if (!code) {
    return undefined
  }

  const lowerCode = code.toLowerCase()

  // If it's already a 2-character code, return it
  if (lowerCode.length === 2 && lowerCode in iso1ToIso2T) {
    return lowerCode
  }

  // If it's a 3-character code, convert it
  if (lowerCode.length === 3 && lowerCode in iso2ToIso1) {
    return iso2ToIso1[lowerCode as ISOCode2]
  }

  return undefined
}

/**
 * Normalize a language code to ISO 639-2/T (3-character terminologic) format
 * Accepts ISO 639-1, ISO 639-2/B, or ISO 639-2/T codes
 */
export const normalizeToIso2T = (code?: string): ISOCode2T | undefined => {
  if (!code) {
    return undefined
  }

  const lowerCode = code.toLowerCase()

  // If it's a 2-character code, convert it
  if (lowerCode.length === 2 && lowerCode in iso1ToIso2T) {
    return iso1ToIso2T[lowerCode as ISOCode1]
  }

  // If it's a 3-character bibliographic code, convert to terminologic
  if (lowerCode.length === 3 && lowerCode in iso2BToIso2T) {
    return iso2BToIso2T[lowerCode as keyof typeof iso2BToIso2T]
  }

  // If it's already a 3-character terminologic code, return it
  if (lowerCode.length === 3 && lowerCode in Object.values(ISO2T)) {
    return lowerCode as ISOCode2T
  }

  return undefined
}

/**
 * Convert ISO 639-1 to ISO 639-2/B (3-character bibliographic) format
 * If no bibliographic variant exists, returns the terminologic code
 * This is useful for setting ffmpeg metadata tags which prefer bibliographic codes
 */
export const iso1ToIso2B = (code: ISOCode1): ISOCode2B => {
  // First convert to terminologic
  const terminologic = iso1ToIso2T[code]

  // Check if there's a bibliographic variant (reverse lookup in iso2BToIso2T)
  const bibliographicEntry = Object.entries(iso2BToIso2T).find(
    ([, iso2t]) => iso2t === terminologic
  )

  // If bibliographic variant exists, return it; otherwise return terminologic
  return bibliographicEntry ? (bibliographicEntry[0] as ISOCode2B) : (terminologic as ISOCode2B)
}
