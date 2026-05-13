// 核心领域类型定义

// ============================================================================
// 事件类型
// ============================================================================

export interface Event {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO 8601 格式，含时区："2024-03-15T10:00:00+08:00"
  endTime: string; // ISO 8601 格式，含时区
  color: string; // 十六进制颜色码，如 "#6366F1"
  recurrenceRule?: RecurrenceRule;
  recurrenceException?: string[]; // 需要排除的重复日期（ISO 格式）
  timezone?: string; // IANA 时区标识符，如 "Asia/Shanghai"
  createdAt: string; // ISO 8601 格式
  updatedAt: string; // ISO 8601 格式
}

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number; // 间隔周期，如每 2 周
  endDate?: string; // 重复结束日期（ISO 格式）
  count?: number; // 重复次数
  byDay?: number[]; // 周重复：星期几，0=周日，1=周一，...，6=周六
  byMonthDay?: number; // 月重复：每月第几天（1-31）
}

// ============================================================================
// 视图类型
// ============================================================================

export type ViewType = "year" | "month" | "week" | "day" | "events";

export interface ViewState {
  currentView: ViewType;
  selectedDate: string; // ISO 日期格式："2024-03-15"
  focusedEventId?: string;
}

// ============================================================================
// 主题类型
// ============================================================================

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeColors {
  // 基础色
  primary: string;
  primaryLight: string;
  primaryDark: string;
  background: string; // 页面背景色
  surface: string; // 卡片/弹窗背景色
  surfaceVariant: string; // 次级表面色
  text: string; // 主文本色
  textSecondary: string; // 次级文本色
  textTertiary: string; // 三级文本色
  border: string; // 边框色
  error: string; // 错误色
  success: string; // 成功色
  warning: string; // 警告色

  // 日历专用色
  todayBackground: string; // 今日背景色
  todayText: string; // 今日文字色
  selectedBackground: string; // 选中日期背景色
  selectedText: string; // 选中日期文字色
  eventDefault: string; // 默认事件颜色
  weekendText: string; // 周末文字色
  lunarText: string; // 农历文字色
  holidayText: string; // 节日文字色
  solarTermText: string; // 节气文字色
}

export interface Theme {
  mode: "light" | "dark";
  colors: ThemeColors;
  spacing: {
    // 间距系统（单位：dp）
    xs: number; // 4dp
    sm: number; // 8dp
    md: number; // 16dp
    lg: number; // 24dp
    xl: number; // 32dp
  };
  borderRadius: {
    // 圆角系统（单位：dp）
    sm: number; // 4dp
    md: number; // 8dp
    lg: number; // 16dp
    full: number; // 9999dp（完全圆角）
  };
  shadows: {
    // 阴影样式（CSS box-shadow 值）
    sm: string;
    md: string;
    lg: string;
  };
}

// ============================================================================
// 农历类型
// ============================================================================

export interface LunarDate {
  year: number; // 农历年
  month: number; // 农历月（1-12）
  day: number; // 农历日（1-30）
  isLeapMonth: boolean; // 是否为闰月
  monthName: string; // 月份名称，如"正月"、"二月"
  dayName: string; // 日期名称，如"初一"、"十五"
  yearGanZhi: string; // 年干支，如"甲子年"
  monthGanZhi: string; // 月干支
  dayGanZhi: string; // 日干支
  yearShengXiao: string; // 生肖，如"鼠年"
}

export interface SolarTerm {
  name: string; // 节气名称，如"立春"、"雨水"
  date: string; // ISO 日期
  index: number; // 节气序号（0-23），0=小寒，1=大寒，...
}

export interface Holiday {
  name: string; // 节日名称
  date: string; // ISO 日期
  type: "traditional" | "statutory" | "solar_term"; // 传统节日、法定假日、节气
  isHoliday: boolean; // 是否为休息日
  isWorkday?: boolean; // 是否为调休工作日
}

/** 单日农历信息（用于日历单元格显示） */
export interface LunarDayInfo {
  lunarDay: string;
  solarTerm?: string;
  holiday?: string;
  isHoliday: boolean;
  isSolarTerm: boolean;
}

// ============================================================================
// 数据库类型
// ============================================================================

/** 数据库适配器接口，定义跨平台数据库操作 */
export interface DatabaseAdapter {
  init(): Promise<void>;
  createEvent(event: Omit<Event, "id" | "createdAt" | "updatedAt">): Promise<Event>;
  updateEvent(id: string, updates: Partial<Event>): Promise<Event>;
  deleteEvent(id: string): Promise<void>;
  getEventById(id: string): Promise<Event | null>;
  getEventsByDateRange(start: string, end: string): Promise<Event[]>;
  getAllEvents(): Promise<Event[]>;
}

// ============================================================================
// 动画类型
// ============================================================================

export interface AnimationConfig {
  duration: number;
  easing: "linear" | "easeIn" | "easeOut" | "easeInOut";
  useNativeDriver: boolean;
}

/** 预设动画配置 */
export const ANIMATION_PRESETS = {
  fast: { duration: 150, easing: "easeOut" as const, useNativeDriver: true },
  normal: { duration: 250, easing: "easeOut" as const, useNativeDriver: true },
  slow: { duration: 350, easing: "easeInOut" as const, useNativeDriver: true },
  spring: { duration: 400, easing: "easeOut" as const, useNativeDriver: true },
} as const;
