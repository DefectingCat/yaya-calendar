/**
 * lunarNative.ts - Android 原生农历模块桥接
 *
 * 通过 NativeModules 调用 Kotlin LunarModule，使用预计算的 SQLite 数据库查表。
 */

import { NativeModules, Platform } from "react-native";
import type { LunarDayInfo } from "../domain/types";

const { LunarModule } = NativeModules;

export interface NativeLunarInfo {
  year: number;
  month: number;
  day: number;
  lunarYear: number;
  lunarMonth: number;
  lunarDay: number;
  monthCn: string;
  dayCn: string;
  yearGanZhi: string;
  monthGanZhi: string;
  dayGanZhi: string;
  shengXiao: string;
  solarTerm: string | null;
  festivals: string; // JSON 数组字符串
  isHoliday: boolean;
  isSolarTerm: boolean;
}

const parseFestivals = (festivalsJson: string): string[] => {
  try {
    return JSON.parse(festivalsJson) as string[];
  } catch {
    return [];
  }
};

/** 从 festivals JSON 中提取优先级最高的节日显示 */
const getHolidayDisplay = (festivals: string[]): string | undefined => {
  const statutory = ["元旦", "春节", "清明节", "劳动节", "端午节", "中秋节", "国庆节"];
  const traditional = ["春节", "元宵节", "清明节", "端午节", "中秋节", "重阳节", "除夕"];

  // 优先传统/法定节日
  for (const f of festivals) {
    if (traditional.includes(f) || statutory.includes(f)) {
      return f;
    }
  }
  return festivals.length > 0 ? festivals[0] : undefined;
};

/** 是否可用原生模块 */
export const isNativeModuleAvailable = (): boolean => {
  return Platform.OS === "android" && LunarModule != null;
};

/** 批量查询整月农历信息 */
export const getLunarInfoBatchNative = async (
  year: number,
  month: number,
  weekStartsOn: number = 1
): Promise<Map<string, LunarDayInfo>> => {
  if (!LunarModule) {
    throw new Error("LunarModule not available");
  }

  const result = await LunarModule.getLunarInfoBatch(year, month + 1, weekStartsOn);
  const map = new Map<string, LunarDayInfo>();

  for (const [key, value] of Object.entries(result)) {
    const v = value as {
      lunarDay: string;
      solarTerm?: string;
      festivals?: string;
      isHoliday: boolean;
      isSolarTerm: boolean;
    };
    const festivals = v.festivals ? parseFestivals(v.festivals) : [];
    map.set(key, {
      lunarDay: v.lunarDay,
      solarTerm: v.solarTerm ?? undefined,
      holiday: getHolidayDisplay(festivals),
      isHoliday: v.isHoliday,
      isSolarTerm: v.isSolarTerm,
    });
  }

  return map;
};

/** 查询整月法定假日集合 */
export const getStatutoryHolidaySetNative = async (
  year: number,
  month: number
): Promise<Set<string>> => {
  if (!LunarModule) {
    throw new Error("LunarModule not available");
  }

  const result: string[] = await LunarModule.getStatutoryHolidaySet(year, month + 1);
  return new Set(result);
};
