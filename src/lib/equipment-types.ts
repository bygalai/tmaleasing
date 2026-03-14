/**
 * Title-based equipment / body type inference and normalization.
 *
 * Determines body_type from listing titles when scrapers don't provide it
 * (VTB, AlfaLeasing for speztechnika). Ensures consistent canonical forms
 * for filter chips across all data sources.
 */

type EquipmentPattern = { keywords: string[]; type: string }

/**
 * Keyword → canonical body type.
 * Ordered: multi-word (specific) first, single-word (generic) later.
 * First match wins — longer/more specific patterns take priority.
 */
const EQUIPMENT_PATTERNS: EquipmentPattern[] = [
  // ── Multi-word (high specificity) ──────────────────────────
  { keywords: ['экскаватор-погрузчик', 'экскаватор погрузчик'], type: 'Экскаватор-погрузчик' },
  { keywords: ['фронтальный погрузчик'], type: 'Фронтальный погрузчик' },
  { keywords: ['телескопический погрузчик', 'телескопический манипулятор'], type: 'Телескопический погрузчик' },
  { keywords: ['мини-погрузчик', 'мини погрузчик', 'минипогрузчик'], type: 'Мини-погрузчик' },
  { keywords: ['мини-экскаватор', 'мини экскаватор', 'миниэкскаватор'], type: 'Мини-экскаватор' },
  { keywords: ['седельный тягач'], type: 'Седельный тягач' },
  { keywords: ['буровая установка'], type: 'Буровая установка' },
  { keywords: ['бортовой с кму', 'бортовая с кму'], type: 'Бортовой с КМУ' },
  { keywords: ['бортовой с гп', 'бортовая с гп'], type: 'Бортовой с ГП' },
  { keywords: ['бортовая платформа'], type: 'Бортовая платформа' },
  { keywords: ['автобетоносмеситель', 'бетоносмеситель'], type: 'Бетоносмеситель' },
  { keywords: ['автобетононасос', 'бетононасос'], type: 'Бетононасос' },
  { keywords: ['автотопливозаправщик', 'топливозаправщик'], type: 'Топливозаправщик' },
  { keywords: ['автогидроподъёмник', 'автогидроподъемник', 'автовышка'], type: 'Автовышка' },
  { keywords: ['асфальтоукладчик'], type: 'Асфальтоукладчик' },

  // ── Single-word types (lower specificity) ──────────────────
  { keywords: ['экскаватор'], type: 'Экскаватор' },
  { keywords: ['погрузчик', 'ричтрак', 'штабелёр', 'штабелер', 'электропогрузчик'], type: 'Погрузчик' },
  { keywords: ['бульдозер'], type: 'Бульдозер' },
  { keywords: ['автокран'], type: 'Автокран' },
  { keywords: ['самосвал'], type: 'Самосвал' },
  { keywords: ['мусоровоз'], type: 'Мусоровоз' },
  { keywords: ['рефрижератор'], type: 'Рефрижератор' },
  { keywords: ['цистерна', 'бензовоз'], type: 'Цистерна' },
  { keywords: ['фургон'], type: 'Фургон' },
  { keywords: ['эвакуатор'], type: 'Эвакуатор' },
  { keywords: ['манипулятор', 'кму'], type: 'Манипулятор' },
  { keywords: ['бортовой', 'бортовая'], type: 'Бортовой' },
  { keywords: ['тягач'], type: 'Тягач' },
  { keywords: ['трактор', 'беларус', 'мтз'], type: 'Трактор' },
  { keywords: ['скаут'], type: 'Трактор' },
  { keywords: ['комбайн'], type: 'Комбайн' },
  { keywords: ['каток'], type: 'Каток' },
  { keywords: ['грейдер', 'автогрейдер'], type: 'Грейдер' },
  { keywords: ['контейнеровоз'], type: 'Контейнеровоз' },
  { keywords: ['форвардер'], type: 'Форвардер' },
  { keywords: ['харвестер'], type: 'Харвестер' },
  { keywords: ['автобус'], type: 'Автобус' },
  { keywords: ['тентованный'], type: 'Тентованный' },
  { keywords: ['изотермический'], type: 'Изотермический' },
  { keywords: ['шторный'], type: 'Шторный' },
  { keywords: ['буровая'], type: 'Буровая установка' },
  { keywords: ['кран'], type: 'Автокран' },

  // ── Trailers ───────────────────────────────────────────────
  { keywords: ['полуприцеп'], type: 'Полуприцеп' },
  { keywords: ['прицеп'], type: 'Прицеп' },

  // ── Car body types ─────────────────────────────────────────
  { keywords: ['внедорожник'], type: 'Внедорожник' },
  { keywords: ['кроссовер'], type: 'Кроссовер' },
  { keywords: ['лифтбэк', 'лифтбек'], type: 'Лифтбэк' },
  { keywords: ['хэтчбек', 'хетчбек', 'хэтчбэк'], type: 'Хэтчбек' },
  { keywords: ['минивэн', 'минивен'], type: 'Минивэн' },
  { keywords: ['седан'], type: 'Седан' },
  { keywords: ['универсал'], type: 'Универсал' },
  { keywords: ['купе'], type: 'Купе' },
  { keywords: ['пикап'], type: 'Пикап' },
  { keywords: ['кабриолет'], type: 'Кабриолет' },
  { keywords: ['родстер'], type: 'Родстер' },
  { keywords: ['лимузин'], type: 'Лимузин' },
]

// ── Model-number patterns (speztechnika / gruzovye) ─────────
// Match brand+model conventions for equipment where titles lack a Russian type word.
// Applied only for speztechnika/gruzovye categories to avoid false positives on cars.

type ModelPattern = { regex: RegExp; type: string }

const MODEL_PATTERNS: ModelPattern[] = [
  // ── Экскаваторы ────────────────────────────────────────────
  { regex: /\bHX\d{2,3}/i, type: 'Экскаватор' },           // Hyundai HX220, HX330
  { regex: /\bR\d{3}(?:LC)?/i, type: 'Экскаватор' },       // Hyundai R220LC, R380
  { regex: /\bXE\d{2,4}/i, type: 'Экскаватор' },           // XCMG XE215, XE335
  { regex: /\bSY\d{2,3}C?\b/i, type: 'Экскаватор' },       // SANY SY215C, SY365
  { regex: /\bZX\d{3}/i, type: 'Экскаватор' },             // Hitachi ZX200, ZX350
  { regex: /\bPC\d{3}/i, type: 'Экскаватор' },             // Komatsu PC200, PC450
  { regex: /\bEC\d{3}/i, type: 'Экскаватор' },             // Volvo EC210, EC480
  { regex: /\bDX\d{3}/i, type: 'Экскаватор' },             // Doosan DX225, DX340
  { regex: /\bJS\d{3}/i, type: 'Экскаватор' },             // JCB JS220, JS330
  { regex: /\bCLG9\d{2}/i, type: 'Экскаватор' },           // LiuGong CLG922, CLG9035
  { regex: /\bCX\d{3}/i, type: 'Экскаватор' },             // Case CX210, CX370
  { regex: /\bSK\d{3}/i, type: 'Экскаватор' },             // Kobelco SK200, SK350
  { regex: /\bCDM6\d{2,3}/i, type: 'Экскаватор' },         // Lonking CDM6065, CDM6225, CDM6266
  { regex: /\bE6\d{3}/i, type: 'Экскаватор' },             // LGCE E6255F, E6210FLC
  { regex: /\bSE\d{3}/i, type: 'Экскаватор' },             // Shantui SE265LC, SE215
  { regex: /\bZE\d{3}/i, type: 'Экскаватор' },             // Zoomlion ZE245E, ZE215
  { regex: /\bFR\d{3}/i, type: 'Экскаватор' },             // Lovol FR220D2, FR150D

  // ── Экскаваторы-погрузчики ─────────────────────────────────
  { regex: /\b[345]CX\b/i, type: 'Экскаватор-погрузчик' }, // JCB 3CX, 4CX, 5CX
  { regex: /\b[345]SX\b/i, type: 'Экскаватор-погрузчик' }, // BULL 3SX, 4SX
  { regex: /\bB1\d{2}[A-Z]?\b/i, type: 'Экскаватор-погрузчик' }, // New Holland B115B
  { regex: /\bB8\d{2}/i, type: 'Экскаватор-погрузчик' },   // LGCE B877F

  // ── Фронтальные погрузчики ─────────────────────────────────
  { regex: /\bCDM8\d{2}/i, type: 'Фронтальный погрузчик' },  // Lonking CDM853, CDM856
  { regex: /\bLW\d{3}/i, type: 'Фронтальный погрузчик' },    // XCMG LW500, LW800
  { regex: /\bZL\d{2}/i, type: 'Фронтальный погрузчик' },    // XCMG ZL50, ZL30
  { regex: /\bCLG8\d{2}/i, type: 'Фронтальный погрузчик' },  // LiuGong CLG856, CLG862
  { regex: /\bLG9\d{2}/i, type: 'Фронтальный погрузчик' },   // SDLG LG956, LG958
  { regex: /\bL9\d{2}/i, type: 'Фронтальный погрузчик' },    // SDLG/LGCE L956F, L958F
  { regex: /\bDL\d{3}/i, type: 'Фронтальный погрузчик' },    // Doosan DL250, DL450
  { regex: /\bSL\d{2}W?\b/i, type: 'Фронтальный погрузчик' },// Shantui SL50W

  // ── Бульдозеры ─────────────────────────────────────────────
  { regex: /\bSD\d{2}/i, type: 'Бульдозер' },           // Shantui SD22, SD17B3
  { regex: /\bDH\d{2}/i, type: 'Бульдозер' },           // Shantui DH13, DH17
  { regex: /\bTY\d{3}/i, type: 'Бульдозер' },           // XCMG TY160, TY320

  // ── Автокраны ──────────────────────────────────────────────
  { regex: /\bSTC\d{3,4}/i, type: 'Автокран' },          // SANY STC250, STC750
  { regex: /\bSAC\d{3,4}/i, type: 'Автокран' },          // SANY SAC1100
  { regex: /\bQY\d{2}/i, type: 'Автокран' },             // XCMG QY25, QY70
  { regex: /\bXCT\d{2}/i, type: 'Автокран' },            // XCMG XCT25, XCT75
  { regex: /\bXCA\d{2,3}/i, type: 'Автокран' },          // XCMG XCA60, XCA100
  { regex: /\bZTC\d{3,4}/i, type: 'Автокран' },          // Zoomlion ZTC250, ZTC800
  { regex: /\bLTM\s?\d/i, type: 'Автокран' },            // Liebherr LTM1100

  // ── Грейдеры ───────────────────────────────────────────────
  { regex: /\bGR\d{3}/i, type: 'Грейдер' },              // XCMG GR215
  { regex: /\bSMG\d/i, type: 'Грейдер' },                // SANY SMG200

  // ── Катки ──────────────────────────────────────────────────
  { regex: /\bBW\d{3}/i, type: 'Каток' },                // Bomag BW212
  { regex: /\bXS\d{3}/i, type: 'Каток' },                // XCMG XS263
  { regex: /\bXMR\d{2}/i, type: 'Каток' },               // XCMG XMR30

  // ── Мини-погрузчики ────────────────────────────────────────
  { regex: /\bCDM3\d{2}/i, type: 'Мини-погрузчик' },     // Lonking CDM312
]

// ── Brand defaults (speztechnika only) ───────────────────────
// Brands that predominantly make one type of equipment.
// Applied as last resort when keyword and model matching fail.

const BRAND_EQUIPMENT_DEFAULTS: [string, string][] = [
  ['sdlg', 'Фронтальный погрузчик'],
  ['shantui', 'Бульдозер'],
  ['шантуй', 'Бульдозер'],
  ['bomag', 'Каток'],
  ['бомаг', 'Каток'],
  ['hamm', 'Каток'],
  ['хамм', 'Каток'],
]

/**
 * Determines equipment/body type from listing title.
 *
 * Three-pass inference:
 *   1. Keyword matching (all categories) — e.g. "Экскаватор XCMG XE215"
 *   2. Model-number patterns (speztechnika/gruzovye) — e.g. "XCMG XE215C"
 *   3. Brand-default fallback (speztechnika only) — e.g. "Lonking CDM3XXN"
 */
export function inferEquipmentType(title: string, category?: string | null): string | null {
  if (!title) return null
  const lower = title.toLowerCase()

  // Pass 1: keyword matching (works for all categories)
  for (const { keywords, type } of EQUIPMENT_PATTERNS) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) return type
    }
  }

  // Pass 2: model-number regex (speztechnika / gruzovye only)
  if (category === 'speztechnika' || category === 'gruzovye') {
    for (const { regex, type } of MODEL_PATTERNS) {
      if (regex.test(title)) return type
    }
  }

  // Pass 3: brand-default fallback (speztechnika only)
  if (category === 'speztechnika') {
    for (const [brand, type] of BRAND_EQUIPMENT_DEFAULTS) {
      if (lower.includes(brand)) return type
    }
  }

  return null
}

// ── Normalization ────────────────────────────────────────────

/** Maps non-canonical / truncated DB forms → canonical display name. */
const BODY_TYPE_ALIASES: Record<string, string> = {
  'фронтальный': 'Фронтальный погрузчик',
  'седельный': 'Седельный тягач',
  'бортовой с гп': 'Бортовой с ГП',
  'бортовой с кму': 'Бортовой с КМУ',
  'бортовая с гп': 'Бортовой с ГП',
  'бортовая с кму': 'Бортовой с КМУ',
  'изотермический/рефрижератор': 'Рефрижератор',
  'рефрижератор/изотермический': 'Рефрижератор',
  'автогрейдер': 'Грейдер',
  'электропогрузчик': 'Погрузчик',
  'экскаватор погрузчик': 'Экскаватор-погрузчик',
  'рефризератор': 'Рефрижератор',
  'рефрежератор': 'Рефрижератор',
}

/**
 * Normalizes body type string to canonical display form.
 * Handles aliases, truncated forms from scrapers, and casing.
 */
export function normalizeBodyType(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()
  const alias = BODY_TYPE_ALIASES[lower]
  if (alias) return alias

  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
