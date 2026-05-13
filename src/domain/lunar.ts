import { eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";

import {
  isStatutoryHoliday as _isStatutoryHoliday,
  isTraditionalHoliday as _isTraditionalHoliday,
  STATUTORY_HOLIDAYS,
} from "../constants/holidays";
import type { Holiday, LunarDate, LunarDayInfo, SolarTerm } from "../domain/types";
import { formatDateKey } from "../utils/dateFormat";
import {
  getSolarMonthDays,
  lunarFromSolar,
  lunarFromYmd,
  type SolarDate,
  solarFestivals,
  solarFromDate,
} from "./lunarCalc";

// ============================================================================
// Lunar Calendar Cache
// ============================================================================

/** 月级缓存，key 为 "yyyy-MM"，value 为日期到农历信息的映射 */
const lunarMonthCache = new Map<string, Map<string, LunarDayInfo>>();

/** 法定假日月级缓存，key 为 "yyyy-MM" (weekStartsOn:0)，value 为日期字符串 Set */
const holidayMonthCache = new Map<string, Set<string>>();

/** 最大缓存月份数 */
const MAX_CACHE_SIZE = 12;

/**
 * 清除农历缓存（事件变更时调用）
 */
export const clearLunarCache = () => {
  lunarMonthCache.clear();
  holidayMonthCache.clear();
};

// ============================================================================
// 内部 helper
// ============================================================================

const solarToDate = (s: SolarDate): Date =>
  new Date(s.year, s.month - 1, s.day, s.hour, s.minute, s.second);

/** 单次 solarFromDate + lunarFromSolar 计算，提取所有农历信息 */
const _getLunarInfoRaw = (
  date: Date
): {
  lunarDay: string;
  solarTerm: string | null;
  holiday: string | null;
  isHoliday: boolean;
  isSolarTerm: boolean;
} => {
  const solar = solarFromDate(date);
  const lunar = lunarFromSolar(solar);

  const lunarDay = lunar.day === 1 ? lunar.monthInChinese : lunar.dayInChinese;

  // holiday display: prioritize festivals over solar term
  let holiday: string | null = null;
  for (const festival of lunar.festivals) {
    if (_isTraditionalHoliday(festival)) {
      holiday = festival;
      break;
    }
  }
  if (!holiday) {
    for (const festival of solarFestivals(solar)) {
      if (_isStatutoryHoliday(festival)) {
        holiday = festival;
        break;
      }
    }
  }
  if (!holiday) {
    if (lunar.festivals.length > 0) {
      holiday = lunar.festivals[0];
    } else {
      const solarFs = solarFestivals(solar);
      if (solarFs.length > 0) holiday = solarFs[0];
    }
  }

  const isHolidayDay =
    lunar.festivals.some(_isTraditionalHoliday) || solarFestivals(solar).some(_isStatutoryHoliday);

  return {
    lunarDay,
    solarTerm: lunar.jieQi,
    holiday,
    isHoliday: isHolidayDay,
    isSolarTerm: lunar.jieQi !== null,
  };
};

// ============================================================================
// Lunar Calendar Service
// ============================================================================

/**
 * Convert a Gregorian date to Chinese lunar date
 */
export const toLunarDate = (date: Date): LunarDate => {
  const solar = solarFromDate(date);
  const lunar = lunarFromSolar(solar);

  return {
    year: lunar.year,
    month: lunar.month,
    day: lunar.day,
    isLeapMonth: lunar.month < 0, // Negative month indicates leap month
    monthName: lunar.monthInChinese,
    dayName: lunar.dayInChinese,
    yearGanZhi: lunar.yearGanZhi,
    monthGanZhi: lunar.monthGanZhi,
    dayGanZhi: lunar.dayGanZhi,
    yearShengXiao: lunar.shengXiao,
  };
};

/**
 * Convert a Chinese lunar date to Gregorian date
 */
export const toSolarDate = (
  lunarYear: number,
  lunarMonth: number,
  lunarDay: number,
  isLeapMonth = false
): Date => {
  const lunar = lunarFromYmd(lunarYear, isLeapMonth ? -lunarMonth : lunarMonth, lunarDay);
  return solarToDate(lunar.solar);
};

/**
 * Get lunar day display text for calendar view
 * - First day of month: show month name (e.g., "正月")
 * - Other days: show day name (e.g., "初二", "十五")
 */
export const getLunarDayDisplay = (date: Date): string => {
  const lunar = toLunarDate(date);
  if (lunar.day === 1) {
    return lunar.monthName;
  }
  return lunar.dayName;
};

// ============================================================================
// Solar Terms (二十四节气)
// ============================================================================

// Solar terms in order (二十四节气)
const SOLAR_TERMS = [
  "小寒",
  "大寒",
  "立春",
  "雨水",
  "惊蛰",
  "春分",
  "清明",
  "谷雨",
  "立夏",
  "小满",
  "芒种",
  "夏至",
  "小暑",
  "大暑",
  "立秋",
  "处暑",
  "白露",
  "秋分",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
  "冬至",
];

/**
 * Get the solar term for a specific date (if any)
 */
export const getSolarTerm = (date: Date): SolarTerm | null => {
  const solar = solarFromDate(date);
  const lunar = lunarFromSolar(solar);
  const jieQi = lunar.jieQi;

  if (jieQi) {
    return {
      name: jieQi,
      date: formatDateKey(date),
      index: SOLAR_TERMS.indexOf(jieQi),
    };
  }
  return null;
};

/**
 * Get all solar terms for a year
 */
export const getSolarTermsForYear = (year: number): SolarTerm[] => {
  const terms: SolarTerm[] = [];

  // Iterate through the year to find solar terms
  for (let month = 1; month <= 12; month++) {
    const days = getSolarMonthDays(year, month);
    for (const day of days) {
      const lunar = lunarFromSolar(day);
      const jieQi = lunar.jieQi;
      if (jieQi) {
        terms.push({
          name: jieQi,
          date: solarToIsoDate(day),
          index: SOLAR_TERMS.indexOf(jieQi),
        });
      }
    }
  }

  return terms.sort((a, b) => a.index - b.index);
};

const solarToIsoDate = (s: SolarDate): string =>
  `${String(s.year).padStart(4, "0")}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`;

// ============================================================================
// Holidays and Festivals
// ============================================================================

/**
 * Get holidays/festivals for a specific date
 */
export const getHolidays = (date: Date): Holiday[] => {
  const solar = solarFromDate(date);
  const lunar = lunarFromSolar(solar);
  const holidays: Holiday[] = [];
  const dateStr = formatDateKey(date);

  // Check lunar festivals (traditional Chinese holidays)
  for (const festival of lunar.festivals) {
    holidays.push({
      name: festival,
      date: dateStr,
      type: "traditional",
      isHoliday: _isTraditionalHoliday(festival),
    });
  }

  // Check solar festivals
  for (const festival of solarFestivals(solar)) {
    holidays.push({
      name: festival,
      date: dateStr,
      type: "statutory",
      isHoliday: _isStatutoryHoliday(festival),
    });
  }

  // Check solar term
  if (lunar.jieQi) {
    holidays.push({
      name: lunar.jieQi,
      date: dateStr,
      type: "solar_term",
      isHoliday: false,
    });
  }

  return holidays;
};

/**
 * Check if a date is a holiday (day off)
 */
export const isHoliday = (date: Date): boolean => {
  const holidays = getHolidays(date);
  return holidays.some((h) => h.isHoliday);
};

/**
 * Check if a date is a solar term
 */
export const isSolarTermDay = (date: Date): boolean => {
  const solar = solarFromDate(date);
  const lunar = lunarFromSolar(solar);
  return lunar.jieQi !== null;
};

/** 从 festivals 中提取优先级最高的节日显示 */
const _getHolidayDisplay = (lunarFestivals: string[], solarFs: string[]): string | null => {
  for (const f of lunarFestivals) {
    if (_isTraditionalHoliday(f)) return f;
  }
  for (const f of solarFs) {
    if (_isStatutoryHoliday(f)) return f;
  }
  if (lunarFestivals.length > 0) return lunarFestivals[0];
  if (solarFs.length > 0) return solarFs[0];
  return null;
};

/**
 * Get the primary holiday/festival name for display
 */
export const getHolidayDisplay = (date: Date): string | null => {
  const solar = solarFromDate(date);
  const lunar = lunarFromSolar(solar);
  return _getHolidayDisplay(lunar.festivals, solarFestivals(solar));
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get comprehensive lunar info for a date (for calendar cell display)
 */
export const getLunarInfo = (date: Date): LunarDayInfo => {
  const raw = _getLunarInfoRaw(date);
  return {
    lunarDay: raw.lunarDay,
    solarTerm: raw.solarTerm ?? undefined,
    holiday: raw.holiday ?? undefined,
    isHoliday: raw.isHoliday,
    isSolarTerm: raw.isSolarTerm,
  };
};

/**
 * 批量获取整月的农历信息（带缓存）
 * @param year 年份
 * @param month 月份（0-indexed，0 = 一月）
 * @returns 日期字符串到农历信息的映射
 */
export const getLunarInfoBatch = (year: number, month: number): Map<string, LunarDayInfo> => {
  const cacheKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  // 检查缓存
  if (lunarMonthCache.has(cacheKey)) {
    return lunarMonthCache.get(cacheKey)!;
  }

  // LRU 淘汰：缓存超过上限时清除最早的
  if (lunarMonthCache.size >= MAX_CACHE_SIZE) {
    const firstKey = lunarMonthCache.keys().next().value;
    if (firstKey) {
      lunarMonthCache.delete(firstKey);
    }
  }

  // 计算整月的农历信息
  const result = new Map<string, LunarDayInfo>();
  const monthDate = new Date(year, month, 1);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  for (const day of days) {
    const raw = _getLunarInfoRaw(day);
    result.set(formatDateKey(day), {
      lunarDay: raw.lunarDay,
      solarTerm: raw.solarTerm ?? undefined,
      holiday: raw.holiday ?? undefined,
      isHoliday: raw.isHoliday,
      isSolarTerm: raw.isSolarTerm,
    });
  }

  // 存入缓存
  lunarMonthCache.set(cacheKey, result);
  return result;
};

/**
 * 批量获取月历范围内的法定假日日期 Set（带缓存）
 * 用于 YearView 的 MiniMonthGrid 快速判断节假日,避免逐日调用 getHolidays 触发大量农历计算
 * 注意：使用 weekStartsOn: 0（周日开始），与 YearView.tsx 中的 MiniMonthGrid 一致
 * @param year 年份
 * @param month 月份（0-indexed，0 = 一月）
 * @returns 日期字符串 (yyyy-MM-dd) 的 Set,包含的日期为法定假日
 */
export const getStatutoryHolidaySetForMonth = (year: number, month: number): Set<string> => {
  const cacheKey = `holiday-${year}-${String(month + 1).padStart(2, "0")}`;

  if (holidayMonthCache.has(cacheKey)) {
    return holidayMonthCache.get(cacheKey)!;
  }

  if (holidayMonthCache.size >= MAX_CACHE_SIZE) {
    const firstKey = holidayMonthCache.keys().next().value;
    if (firstKey) {
      holidayMonthCache.delete(firstKey);
    }
  }

  const result = new Set<string>();
  const monthDate = new Date(year, month, 1);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  for (const day of days) {
    const holidays = getHolidays(day);
    if (holidays.some((h) => STATUTORY_HOLIDAYS.includes(h.name))) {
      result.add(formatDateKey(day));
    }
  }

  holidayMonthCache.set(cacheKey, result);
  return result;
};

/**
 * Get Gan-Zhi (干支) representation for a date
 */
export const getGanZhi = (date: Date): { year: string; month: string; day: string } => {
  const lunar = toLunarDate(date);
  return {
    year: lunar.yearGanZhi,
    month: lunar.monthGanZhi,
    day: lunar.dayGanZhi,
  };
};

/**
 * Get ShengXiao (生肖) for a year
 */
export const getShengXiao = (year: number): string => {
  const lunar = lunarFromYmd(year, 1, 1);
  return lunar.shengXiao;
};

export default {
  toLunarDate,
  toSolarDate,
  getLunarDayDisplay,
  getSolarTerm,
  getSolarTermsForYear,
  getHolidays,
  isHoliday,
  isSolarTermDay,
  getHolidayDisplay,
  getLunarInfo,
  getLunarInfoBatch,
  getStatutoryHolidaySetForMonth,
  clearLunarCache,
  getGanZhi,
  getShengXiao,
};
