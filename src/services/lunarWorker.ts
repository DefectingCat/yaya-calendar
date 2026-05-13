/**
 * lunarWorker.ts - 农历计算服务
 *
 * Android: 使用原生 LunarModule (Kotlin + SQLite 查表)
 * Web:     回退到主线程同步计算
 *
 * 历史背景：
 * 之前尝试用 Reanimated createWorkletRuntime + runOnRuntime 将 lunarCalc
 * 推到独立线程执行，但 worklet runtime 无法正确序列化 ESM 导出的函数
 * (TypeError: xxx is not a function)，且 require() 在 worklet 中不存在。
 *
 * 最终方案：预计算 1900-2100 年农历数据到 SQLite，Android 原生层查表 +
 * LruCache，毫秒级返回。
 */

import type { Day } from "date-fns";
import { Platform } from "react-native";
import { getLunarInfoBatch, getStatutoryHolidaySetForMonth } from "../domain/lunar";
import type { LunarDayInfo } from "../domain/types";
import {
  getLunarInfoBatchNative,
  getStatutoryHolidaySetNative,
  isNativeModuleAvailable,
} from "./lunarNative";

const isWeb = Platform.OS === "web";

/**
 * 计算整月的农历信息
 * - Android: 原生 SQLite 查表
 * - Web: 主线程同步计算
 */
export const getLunarInfoBatchAsync = (
  year: number,
  month: number,
  weekStartsOn: Day = 1
): Promise<Map<string, LunarDayInfo>> => {
  if (!isWeb && isNativeModuleAvailable()) {
    return getLunarInfoBatchNative(year, month, weekStartsOn);
  }

  const batch = getLunarInfoBatch(year, month);
  return Promise.resolve(batch);
};

/**
 * 计算整月的法定假日日期集合
 * - Android: 原生 SQLite 查表
 * - Web: 主线程同步计算
 */
export const getStatutoryHolidaySetForMonthAsync = (
  year: number,
  month: number
): Promise<Set<string>> => {
  if (!isWeb && isNativeModuleAvailable()) {
    return getStatutoryHolidaySetNative(year, month);
  }

  const holidaySet = getStatutoryHolidaySetForMonth(year, month);
  return Promise.resolve(holidaySet);
};
