// 月份数据生成器 - 为 FlashList 提供月份列表数据

/**
 * 月份项数据结构
 */
export interface MonthItem {
  id: string; // "yyyy-MM" 格式，用于 key
  year: number;
  month: number; // 0-indexed（0 = 一月）
}

/**
 * 从年月生成月份 ID
 */
export function getMonthId(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * 从月份 ID 解析年月
 */
export function parseMonthId(id: string): { year: number; month: number } {
  const [year, monthStr] = id.split("-");
  return { year: Number(year), month: Number(monthStr) - 1 };
}

/**
 * 生成以指定月份为中心的月份数组
 * @param centerYear 中心年份
 * @param centerMonth 中心月份（0-indexed）
 * @param range 前后各生成多少个月（默认 120 = 10 年）
 */
export function generateMonthItems(
  centerYear: number,
  centerMonth: number,
  range: number = 120
): MonthItem[] {
  const items: MonthItem[] = [];
  const centerDate = new Date(centerYear, centerMonth, 1);

  for (let i = -range; i <= range; i++) {
    const date = new Date(centerDate);
    date.setMonth(date.getMonth() + i);
    const year = date.getFullYear();
    const month = date.getMonth();
    items.push({ id: getMonthId(year, month), year, month });
  }

  return items;
}

/**
 * 在月份数组头部扩展更早的月份
 * @param items 现有月份数组
 * @param count 扩展数量
 */
export function extendBackward(items: MonthItem[], count: number): MonthItem[] {
  if (items.length === 0) return items;
  const first = items[0];
  const newItems: MonthItem[] = [];
  const startDate = new Date(first.year, first.month, 1);

  for (let i = count; i > 0; i--) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() - i);
    const year = date.getFullYear();
    const month = date.getMonth();
    newItems.push({ id: getMonthId(year, month), year, month });
  }

  return [...newItems, ...items];
}

/**
 * 在月份数组尾部扩展更晚的月份
 * @param items 现有月份数组
 * @param count 扩展数量
 */
export function extendForward(items: MonthItem[], count: number): MonthItem[] {
  if (items.length === 0) return items;
  const last = items[items.length - 1];
  const newItems: MonthItem[] = [];
  const startDate = new Date(last.year, last.month, 1);

  for (let i = 1; i <= count; i++) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + i);
    const year = date.getFullYear();
    const month = date.getMonth();
    newItems.push({ id: getMonthId(year, month), year, month });
  }

  return [...items, ...newItems];
}

/**
 * 查找指定月份在数组中的索引
 */
export function findMonthIndex(items: MonthItem[], year: number, month: number): number {
  const id = getMonthId(year, month);
  return items.findIndex((item) => item.id === id);
}

/**
 * 获取默认的月份范围（以今天为中心，前后各 10 年）
 */
export function getDefaultMonthItems(): MonthItem[] {
  const today = new Date();
  return generateMonthItems(today.getFullYear(), today.getMonth(), 120);
}
