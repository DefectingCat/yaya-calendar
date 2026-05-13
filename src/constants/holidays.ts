/**
 * 传统节日列表
 */
export const TRADITIONAL_HOLIDAYS = [
  "春节",
  "元宵节",
  "清明节",
  "端午节",
  "中秋节",
  "重阳节",
  "除夕",
];

/**
 * 法定假日列表
 */
export const STATUTORY_HOLIDAYS = [
  "元旦",
  "春节",
  "清明节",
  "劳动节",
  "端午节",
  "中秋节",
  "国庆节",
];

/**
 * 判断是否为传统节日
 */
export const isTraditionalHoliday = (name: string): boolean => {
  return TRADITIONAL_HOLIDAYS.includes(name);
};

/**
 * 判断是否为法定假日
 */
export const isStatutoryHoliday = (name: string): boolean => {
  return STATUTORY_HOLIDAYS.includes(name);
};

/**
 * 从节日列表中提取优先级最高的节日显示
 * 优先传统/法定节日，否则返回第一个节日
 */
export const getHolidayDisplay = (festivals: string[]): string | undefined => {
  for (const f of festivals) {
    if (TRADITIONAL_HOLIDAYS.includes(f) || STATUTORY_HOLIDAYS.includes(f)) {
      return f;
    }
  }
  return festivals.length > 0 ? festivals[0] : undefined;
};
