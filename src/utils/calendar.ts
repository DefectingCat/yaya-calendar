// 日历计算工具

import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";

import { HORIZONTAL_MARGIN, ROW_GAP } from "../constants/layout";

/**
 * 计算指定月份在日历网格中的起始和结束日期（周一开头）
 */
function getCalendarBounds(year: number, month: number): { start: Date; end: Date } {
  const monthDate = new Date(year, month, 1);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  return { start: calStart, end: calEnd };
}

/**
 * 计算指定月份的日历行数
 * @param year 年份
 * @param month 月份（0-indexed，0 = 一月）
 * @returns 行数（4-6）
 */
export function getCalendarRowCount(year: number, month: number): number {
  const { start, end } = getCalendarBounds(year, month);
  const diffMs = end.getTime() - start.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.ceil(days / 7);
}

/**
 * 计算日历网格高度
 * @param rowCount 行数
 * @param screenWidth 屏幕宽度
 * @returns 高度（px）
 */
export function calculateGridHeight(rowCount: number, screenWidth: number): number {
  const cellWidth = (screenWidth - HORIZONTAL_MARGIN) / 7;
  const cellHeight = cellWidth; // 宽高比 1:1
  return rowCount * cellHeight + (rowCount - 1) * ROW_GAP;
}

/**
 * 计算单行高度
 * @param screenWidth 屏幕宽度
 * @returns 高度（px）
 */
export function calculateSingleRowHeight(screenWidth: number): number {
  const cellWidth = (screenWidth - HORIZONTAL_MARGIN) / 7;
  return cellWidth + ROW_GAP;
}

/**
 * 计算日期在日历中的行索引（O(1) 数学计算）
 * @param date 目标日期
 * @param year 年份
 * @param month 月份（0-indexed）
 * @returns 行索引（0-5）
 */
export function getRowIndexForDate(date: Date, year: number, month: number): number {
  const { start } = getCalendarBounds(year, month);
  const diffMs = date.getTime() - start.getTime();
  const dayIndex = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (dayIndex < 0) return 0;
  return Math.floor(dayIndex / 7);
}

/**
 * 计算指定行的顶部偏移量
 * @param rowIndex 行索引（0-5）
 * @param screenWidth 屏幕宽度
 * @returns 偏移量（px）
 */
export function calculateRowOffset(rowIndex: number, screenWidth: number): number {
  const singleRowHeight = calculateSingleRowHeight(screenWidth);
  return rowIndex * singleRowHeight;
}
