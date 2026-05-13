// 月视图组件

import { Ionicons } from "@expo/vector-icons";
import {
  addDays,
  addMonths,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { getLunarInfoBatch } from "../../domain/lunar";
import {
  getLunarInfoBatchAsync,
  type SerializableLunarInfo,
} from "../../services/lunarWorker";
import { useEventStore, useViewStore } from "../../stores/eventStore";
import { useTheme } from "../../stores/themeStore";
import {
  calculateGridHeight,
  calculateSingleRowHeight,
  getCalendarRowCount,
  getRowIndexForDate,
} from "../../utils/calendar";
import { DayInfoPanel } from "./DayInfoPanel";
import MonthGrid from "./MonthGrid";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const SWIPE_VELOCITY_THRESHOLD = 500; // 滑动速度阈值（px/s）
const SWIPE_DISTANCE_THRESHOLD = SCREEN_WIDTH * 0.3; // 滑动距离阈值
const SPRING_CONFIG = { damping: 20, stiffness: 100 };

const EMPTY_LUNAR_MAP: ReadonlyMap<string, never> = new Map<string, never>();
const EMPTY_EVENTS_MAP: ReadonlyMap<string, never> = new Map<string, never>();
// 异步加载的农历信息类型（来自 lunarWorker）
type LunarInfoMap = Map<string, SerializableLunarInfo>;

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const FOLD_VELOCITY_THRESHOLD = 300; // 折叠速度阈值
const FOLD_DISTANCE_THRESHOLD = SCREEN_HEIGHT * 0.05; // 折叠距离阈值

/** Slot-based 三屏面板数据 */
interface SlotData {
  year: number;  // 公历年
  month: number; // 0-indexed 月份
}

/** 从 displayMonthStr 初始化三个 slot [prev, current, next] */
function initSlots(displayMonthStr: string): [SlotData, SlotData, SlotData] {
  const d = new Date(displayMonthStr);
  const curr = startOfMonth(d);
  const prev = subMonths(curr, 1);
  const next = addMonths(curr, 1);
  return [
    { year: prev.getFullYear(), month: prev.getMonth() },
    { year: curr.getFullYear(), month: curr.getMonth() },
    { year: next.getFullYear(), month: next.getMonth() },
  ];
}

export const MonthView: React.FC = () => {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const selectedDate = useViewStore((s) => s.selectedDate);
  const displayMonthStr = useViewStore((s) => s.displayMonth);
  const setDisplayMonth = useViewStore((s) => s.setDisplayMonth);
  const setSelectedDate = useViewStore((s) => s.setSelectedDate);
  const setSelectedDateAndMonth = useViewStore(
    (s) => s.setSelectedDateAndMonth
  );
  const setHasNavigatedMonth = useViewStore((s) => s.setHasNavigatedMonth);

  // 从全局状态获取 displayMonth，转换为 Date 对象
  const displayMonth = useMemo(() => {
    const date = new Date(displayMonthStr);
    return startOfMonth(date);
  }, [displayMonthStr]);

  // ── Slot-based 三屏面板 ──────────────────────────────────────
  // 三个固定 slot (prev/current/next)，commit 时轮转数据而非重建组件
  const [slots, setSlots] = useState<[SlotData, SlotData, SlotData]>(() =>
    initSlots(displayMonthStr)
  );
  // 每个 slot 的屏幕偏移量：-1=左屏(prev), 0=中屏(current), 1=右屏(next)
  const slotOffsets = useSharedValue([-1, 0, 1]);

  // 大跨度跳转或程序化月份变更时重置 slots
  useEffect(() => {
    if (skipSlotResetRef.current) {
      skipSlotResetRef.current = false;
      return;
    }
    setSlots(initSlots(displayMonthStr));
    slotOffsets.value = [-1, 0, 1];
  }, [displayMonthStr, slotOffsets]);

  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const isAnimating = useSharedValue(false);
  const prevDisplayMonthRef = useRef(displayMonthStr);
  // 标记本次 displayMonth 变化是由用户横向滑动触发，
  // useLayoutEffect 据此做 panel "角色重映射"，避免视觉跳变
  const swipeDirectionRef = useRef<"next" | "prev" | null>(null);
  // 滑动期间允许 selectedDate 月份 与 displayMonth 临时不同步：
  // Header 立即响应（selectedDate 先更新），panel 动画结束后再写 displayMonth。
  // 兜底 sync useLayoutEffect 在此期间需跳过。
  const isSwipingRef = useRef(false);
  // 滑动 commit 时跳过 useEffect 对 slots 的重置（slots 已通过轮转更新）
  const skipSlotResetRef = useRef(false);

  const [isCollapsed, setIsCollapsed] = useState(false);
  // 默认不渲染前后月份，rAF 后再恢复，减少初始 commit 工作量
  const [showAdjacent, setShowAdjacent] = useState(false);
  // 首屏先渲染当前月份，下一帧再挂 prev/next 以减少初始 commit 工作量
  useEffect(() => {
    const id = requestAnimationFrame(() => setShowAdjacent(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // 在渲染阶段直接判断大跨度跳转，避免第一次渲染就渲染前后月份
  const isLargeJump = useMemo(() => {
    const prev = prevDisplayMonthRef.current;
    if (!prev || !displayMonthStr) return false;
    const [prevYear, prevMonthNum] = prev.split("-").map(Number);
    const [currYear, currMonthNum] = displayMonthStr.split("-").map(Number);
    return (
      Math.abs((currYear - prevYear) * 12 + (currMonthNum - prevMonthNum)) > 1
    );
  }, [displayMonthStr]);

  const calendarHeight = useSharedValue(320); // 初始值，会在 useLayoutEffect 中更新
  const dragStartHeight = useSharedValue(320);

  // 折叠进度 shared value（0=展开, 1=折叠）
  const foldProgress = useSharedValue(0);

  // 三屏高度 shared values（用于动态高度计算）
  const currentHeight = useSharedValue(0);
  const prevHeight = useSharedValue(0);
  const nextHeight = useSharedValue(0);
  // 折叠状态同步为 shared value（用于 worklet 中访问）
  const isCollapsedSV = useSharedValue(false);

  const prevMonth = useMemo(() => subMonths(displayMonth, 1), [displayMonth]);
  const nextMonth = useMemo(() => addMonths(displayMonth, 1), [displayMonth]);

  // 预计算三屏行数
  const prevRowCount = useMemo(
    () => getCalendarRowCount(prevMonth.getFullYear(), prevMonth.getMonth()),
    [prevMonth]
  );
  const currentRowCount = useMemo(
    () =>
      getCalendarRowCount(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth]
  );
  const nextRowCount = useMemo(
    () => getCalendarRowCount(nextMonth.getFullYear(), nextMonth.getMonth()),
    [nextMonth]
  );

  // 展开高度 = 当月高度（用于折叠动画）
  const EXPANDED_HEIGHT = useMemo(
    () => calculateGridHeight(currentRowCount, screenWidth),
    [currentRowCount, screenWidth]
  );

  // 折叠高度 = 单行高度
  const COLLAPSED_HEIGHT = useMemo(
    () => calculateSingleRowHeight(screenWidth),
    [screenWidth]
  );

  // 计算目标行索引（优先选中日期，否则用今天）
  const targetRowIndex = useMemo(() => {
    const targetDateStr =
      selectedDate || new Date().toISOString().split("T")[0];
    const targetDate = new Date(targetDateStr);
    return getRowIndexForDate(
      targetDate,
      displayMonth.getFullYear(),
      displayMonth.getMonth()
    );
  }, [selectedDate, displayMonth]);

  // 折叠状态下：计算上一周/下一周所在的月份和行索引（用于三屏预渲染）
  const currentWeekTargetDate = useMemo(() => {
    const targetDateStr =
      selectedDate || new Date().toISOString().split("T")[0];
    return new Date(targetDateStr);
  }, [selectedDate]);

  const prevWeekInfo = useMemo(() => {
    const prevWeekDate = subDays(currentWeekTargetDate, 7);
    const prevWeekMonth = startOfMonth(prevWeekDate);
    const rowIndex = getRowIndexForDate(
      prevWeekDate,
      prevWeekMonth.getFullYear(),
      prevWeekMonth.getMonth()
    );
    return { month: prevWeekMonth, rowIndex, date: prevWeekDate };
  }, [currentWeekTargetDate]);

  const nextWeekInfo = useMemo(() => {
    const nextWeekDate = addDays(currentWeekTargetDate, 7);
    const nextWeekMonth = startOfMonth(nextWeekDate);
    const rowIndex = getRowIndexForDate(
      nextWeekDate,
      nextWeekMonth.getFullYear(),
      nextWeekMonth.getMonth()
    );
    return { month: nextWeekMonth, rowIndex, date: nextWeekDate };
  }, [currentWeekTargetDate]);

  // 预计算当前月农历信息（折叠状态中心面板使用）
  const currentLunarInfoMap = useMemo(() => {
    return getLunarInfoBatch(
      displayMonth.getFullYear(),
      displayMonth.getMonth()
    );
  }, [displayMonth]);

  const getEventsForMonth = useEventStore((s) => s.getEventsForMonth);

  // 预计算当前月事件数据（折叠状态中心面板使用）
  const currentEventsMap = useMemo(
    () => getEventsForMonth(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth, getEventsForMonth]
  );

  // Ref-based cache：同月份返回同一 Map 引用，让 React.memo 跳过重渲染
  const lunarCacheRef = useRef(new Map<string, Map<string, SerializableLunarInfo>>());
  const eventsCacheRef = useRef(new Map<string, ReturnType<typeof getEventsForMonth>>());

  // 展开状态：每个 slot 的农历和事件（带缓存）
  const slotLunarMaps = useMemo(() => {
    return slots.map((slot) => {
      const key = `${slot.year}-${slot.month}`;
      if (!lunarCacheRef.current.has(key)) {
        lunarCacheRef.current.set(key, getLunarInfoBatch(slot.year, slot.month));
      }
      return lunarCacheRef.current.get(key)!;
    });
  }, [slots]);

  const slotEventsMaps = useMemo(() => {
    return slots.map((slot) => {
      const key = `${slot.year}-${slot.month}`;
      if (!eventsCacheRef.current.has(key)) {
        eventsCacheRef.current.set(key, getEventsForMonth(slot.year, slot.month));
      }
      return eventsCacheRef.current.get(key)!;
    });
  }, [slots, getEventsForMonth]);

  // 折叠状态下的农历和事件预计算
  // prevWeek/nextWeek 使用异步计算（worklet 线程）
  const [prevWeekLunarInfoMap, setPrevWeekLunarInfoMap] =
    useState<LunarInfoMap>(EMPTY_LUNAR_MAP as any);
  const [nextWeekLunarInfoMap, setNextWeekLunarInfoMap] =
    useState<LunarInfoMap>(EMPTY_LUNAR_MAP as any);

  useEffect(() => {
    if (!isCollapsed) return;

    let cancelled = false;

    getLunarInfoBatchAsync(
      prevWeekInfo.month.getFullYear(),
      prevWeekInfo.month.getMonth()
    ).then((map) => {
      if (!cancelled) setPrevWeekLunarInfoMap(map);
    });

    getLunarInfoBatchAsync(
      nextWeekInfo.month.getFullYear(),
      nextWeekInfo.month.getMonth()
    ).then((map) => {
      if (!cancelled) setNextWeekLunarInfoMap(map);
    });

    return () => {
      cancelled = true;
    };
  }, [isCollapsed, prevWeekInfo.month, nextWeekInfo.month]);
  const prevWeekEventsMap = useMemo(
    () =>
      isCollapsed
        ? getEventsForMonth(
            prevWeekInfo.month.getFullYear(),
            prevWeekInfo.month.getMonth()
          )
        : (EMPTY_EVENTS_MAP as any),
    [isCollapsed, prevWeekInfo.month, getEventsForMonth]
  );
  const nextWeekEventsMap = useMemo(
    () =>
      isCollapsed
        ? getEventsForMonth(
            nextWeekInfo.month.getFullYear(),
            nextWeekInfo.month.getMonth()
          )
        : (EMPTY_EVENTS_MAP as any),
    [isCollapsed, nextWeekInfo.month, getEventsForMonth]
  );

  // 初始化三屏高度
  useLayoutEffect(() => {
    currentHeight.value = calculateGridHeight(currentRowCount, screenWidth);
    prevHeight.value = calculateGridHeight(prevRowCount, screenWidth);
    nextHeight.value = calculateGridHeight(nextRowCount, screenWidth);
    // 初始化 calendarHeight
    if (calendarHeight.value === 320) {
      calendarHeight.value = currentHeight.value;
      dragStartHeight.value = currentHeight.value;
    }
  }, [
    currentRowCount,
    prevRowCount,
    nextRowCount,
    screenWidth,
    currentHeight,
    prevHeight,
    nextHeight,
    calendarHeight,
    dragStartHeight,
  ]);

  // 同步折叠状态到 shared value
  useEffect(() => {
    isCollapsedSV.value = isCollapsed;
  }, [isCollapsed, isCollapsedSV]);

  // 当 selectedDate 月份与 displayMonth 不同步时兜底同步
  //（正常路径 setSelectedDateAndMonth 已经同时写入，此 effect 永不触发；
  //   滑动场景下 isSwipingRef = true，故意让 selectedDate 先于 displayMonth 更新，
  //   panel 动画完成后才 setDisplayMonth；此时需跳过兜底 sync）
  useLayoutEffect(() => {
    if (isSwipingRef.current) return;
    const selectedMonth = selectedDate.slice(0, 7); // "yyyy-MM"
    const displayMonthSlice = displayMonthStr.slice(0, 7);
    if (selectedMonth === displayMonthSlice) return;
    const monthStartStr = `${selectedMonth}-01`;
    setDisplayMonth(monthStartStr);
  }, [selectedDate, displayMonthStr, setDisplayMonth]);

  // 用户横向滑动 → 两阶段更新（Header 立即响应，MonthGrid 延迟到动画完成）：
  //   阶段 1（onEnd 立即）：只更新 selectedDate，Header / 高亮立即响应
  //     - 中间状态：selectedDate 在新月，displayMonth 在旧月，
  //       由 isSwipingRef 让兜底 sync effect 跳过
  //     - 新月份内容已在旧 next/prev panel 中渲染，用户看到的"切到下一月"
  //       由 panel 滑动动画完成（旧 next panel 滑到屏幕中心）
  //   阶段 2（panel 动画完成 callback）：写 displayMonth，触发 useLayoutEffect
  //     的 swipe 重映射分支，把 translateX 重置为 0
  const startSwipeNext = useCallback(() => {
    isSwipingRef.current = true;
    const [year, month] = displayMonthStr.split("-").map(Number);
    const currentDisplayMonth = new Date(year, month - 1, 1);
    const newMonth = addMonths(currentDisplayMonth, 1);
    const newMonthStr = `${newMonth.getFullYear()}-${String(newMonth.getMonth() + 1).padStart(2, "0")}-01`;
    setHasNavigatedMonth(true);
    const today = new Date();
    const targetDate = isSameMonth(newMonth, today)
      ? today.toISOString().split("T")[0]
      : newMonthStr;
    setSelectedDate(targetDate);
  }, [displayMonthStr, setHasNavigatedMonth, setSelectedDate]);

  const startSwipePrev = useCallback(() => {
    isSwipingRef.current = true;
    const [year, month] = displayMonthStr.split("-").map(Number);
    const currentDisplayMonth = new Date(year, month - 1, 1);
    const newMonth = subMonths(currentDisplayMonth, 1);
    const newMonthStr = `${newMonth.getFullYear()}-${String(newMonth.getMonth() + 1).padStart(2, "0")}-01`;
    setHasNavigatedMonth(true);
    const today = new Date();
    const targetDate = isSameMonth(newMonth, today)
      ? today.toISOString().split("T")[0]
      : newMonthStr;
    setSelectedDate(targetDate);
  }, [displayMonthStr, setHasNavigatedMonth, setSelectedDate]);

  const commitSwipeNext = useCallback(() => {
    const [year, month] = displayMonthStr.split("-").map(Number);
    const currentDisplayMonth = new Date(year, month - 1, 1);
    const newMonth = addMonths(currentDisplayMonth, 1);
    const newMonthStr = `${newMonth.getFullYear()}-${String(newMonth.getMonth() + 1).padStart(2, "0")}-01`;

    skipSlotResetRef.current = true;
    setSlots((prev) => {
      const oldNext = prev[2];
      const newNextDate = addMonths(new Date(oldNext.year, oldNext.month, 1), 1);
      return [prev[1], prev[2], { year: newNextDate.getFullYear(), month: newNextDate.getMonth() }];
    });

    swipeDirectionRef.current = "next";
    setDisplayMonth(newMonthStr);
  }, [displayMonthStr, setDisplayMonth]);

  const commitSwipePrev = useCallback(() => {
    const [year, month] = displayMonthStr.split("-").map(Number);
    const currentDisplayMonth = new Date(year, month - 1, 1);
    const newMonth = subMonths(currentDisplayMonth, 1);
    const newMonthStr = `${newMonth.getFullYear()}-${String(newMonth.getMonth() + 1).padStart(2, "0")}-01`;

    skipSlotResetRef.current = true;
    setSlots((prev) => {
      const oldPrev = prev[0];
      const newPrevDate = subMonths(new Date(oldPrev.year, oldPrev.month, 1), 1);
      return [{ year: newPrevDate.getFullYear(), month: newPrevDate.getMonth() }, prev[0], prev[1]];
    });

    swipeDirectionRef.current = "prev";
    setDisplayMonth(newMonthStr);
  }, [displayMonthStr, setDisplayMonth]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  // 当 displayMonth 更新后，使用 useLayoutEffect 同步重置 translateX
  // 这确保在浏览器绘制之前完成重置，避免闪烁
  // 同时处理大跨度跳转的淡入淡出动画
  useLayoutEffect(() => {
    const prevMonth = prevDisplayMonthRef.current;
    prevDisplayMonthRef.current = displayMonthStr;

    // 用户横向滑动触发的更新（commitSwipe 调用时，panel 动画已完成）：
    //   panel 当前位置 = ±SCREEN_WIDTH，旧 next/prev panel 在屏幕中心
    //   commit 后 panel 角色重映射：旧 next/prev → 新 current
    //   将 translateX 重置为 0，新 current panel（同一内容）回到屏幕中心
    //   视觉无跳变（内容相同，位置相同）
    if (swipeDirectionRef.current) {
      swipeDirectionRef.current = null;
      isSwipingRef.current = false;

      cancelAnimation(translateX);
      cancelAnimation(calendarHeight);
      translateX.value = 0;
      isAnimating.value = false;

      if (isCollapsedSV.value) {
        calendarHeight.value = COLLAPSED_HEIGHT;
        foldProgress.value = 1;
      } else {
        calendarHeight.value = currentHeight.value;
      }
      return;
    }

    if (prevMonth && displayMonthStr) {
      const [prevYear, prevMonthNum] = prevMonth.split("-").map(Number);
      const [currYear, currMonthNum] = displayMonthStr.split("-").map(Number);
      const monthDiff =
        (currYear - prevYear) * 12 + (currMonthNum - prevMonthNum);

      if (Math.abs(monthDiff) > 1) {
        // 大跨度跳转：直接显示，避免淡入淡出导致的闪烁
        translateX.value = 0;
        isAnimating.value = false;
        // 重置高度到当月高度或折叠高度
        if (isCollapsedSV.value) {
          calendarHeight.value = COLLAPSED_HEIGHT;
          foldProgress.value = 1;
        } else {
          calendarHeight.value = currentHeight.value;
          foldProgress.value = 0;
        }
        // 大跨度跳转时（年→月），只渲染当前月份，rAF 后再恢复前后月份
        setShowAdjacent(false);
        const id = requestAnimationFrame(() => setShowAdjacent(true));
        return () => cancelAnimationFrame(id);
      } else {
        // 程序化（非滑动）跳转，相邻月：重置位置
        translateX.value = 0;
        isAnimating.value = false;
        // 折叠状态下保持折叠高度
        if (isCollapsedSV.value) {
          calendarHeight.value = COLLAPSED_HEIGHT;
          foldProgress.value = 1;
        }
      }
    } else {
      translateX.value = 0;
      isAnimating.value = false;
    }
  }, [
    displayMonthStr,
    translateX,
    isAnimating,
    calendarHeight,
    currentHeight,
    isCollapsedSV,
    COLLAPSED_HEIGHT,
    foldProgress,
  ]);

  // 折叠高度动画
  useLayoutEffect(() => {
    calendarHeight.value = withTiming(
      isCollapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT,
      {
        duration: 250,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }
    );
    foldProgress.value = withTiming(isCollapsed ? 1 : 0, {
      duration: 250,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [
    isCollapsed,
    EXPANDED_HEIGHT,
    COLLAPSED_HEIGHT,
    calendarHeight,
    foldProgress,
  ]);

  // 切换周的回调（折叠状态下使用）
  const goToNextWeekJS = useCallback(() => {
    translateX.value = 0;
    const currentDate = new Date(selectedDate);
    const nextWeek = addDays(currentDate, 7);

    // 切换周时同步选中日期：如果新周包含今天则选中今天，否则选中周一
    const today = new Date();
    const weekStart = startOfWeek(nextWeek, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(nextWeek, { weekStartsOn: 1 });
    const targetDate =
      today >= weekStart && today <= weekEnd
        ? format(today, "yyyy-MM-dd")
        : format(weekStart, "yyyy-MM-dd");

    if (isSameMonth(nextWeek, displayMonth)) {
      // 同月：只改 selectedDate（displayMonth 不变）
      setSelectedDate(targetDate);
    } else {
      // 跨月：一次性改 selectedDate + displayMonth
      setSelectedDateAndMonth(targetDate);
    }
  }, [
    selectedDate,
    displayMonth,
    setSelectedDate,
    setSelectedDateAndMonth,
    translateX,
  ]);

  const goToPrevWeekJS = useCallback(() => {
    translateX.value = 0;
    const currentDate = new Date(selectedDate);
    const prevWeek = subDays(currentDate, 7);

    // 切换周时同步选中日期：如果新周包含今天则选中今天，否则选中周一
    const today = new Date();
    const weekStart = startOfWeek(prevWeek, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(prevWeek, { weekStartsOn: 1 });
    const targetDate =
      today >= weekStart && today <= weekEnd
        ? format(today, "yyyy-MM-dd")
        : format(weekStart, "yyyy-MM-dd");

    if (isSameMonth(prevWeek, displayMonth)) {
      setSelectedDate(targetDate);
    } else {
      setSelectedDateAndMonth(targetDate);
    }
  }, [
    selectedDate,
    displayMonth,
    setSelectedDate,
    setSelectedDateAndMonth,
    translateX,
  ]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      if (isAnimating.value) return;
      translateX.value = event.translationX;

      // 折叠状态下不动态调整高度
      if (isCollapsedSV.value) return;

      // 动态高度计算（clamp progress 到 [0, 1]）
      const progress = Math.min(
        1,
        Math.max(0, Math.abs(event.translationX) / SCREEN_WIDTH)
      );
      if (event.translationX < 0) {
        // 向左滑 → 下月
        calendarHeight.value =
          currentHeight.value +
          (nextHeight.value - currentHeight.value) * progress;
      } else {
        // 向右滑 → 上月
        calendarHeight.value =
          currentHeight.value +
          (prevHeight.value - currentHeight.value) * progress;
      }
    })
    .onEnd((event) => {
      if (isAnimating.value) return;

      const { translationX, velocityX } = event;
      const shouldSwipeLeft =
        translationX < -SWIPE_DISTANCE_THRESHOLD ||
        velocityX < -SWIPE_VELOCITY_THRESHOLD;
      const shouldSwipeRight =
        translationX > SWIPE_DISTANCE_THRESHOLD ||
        velocityX > SWIPE_VELOCITY_THRESHOLD;

      // 折叠状态：切换周
      if (isCollapsedSV.value) {
        if (shouldSwipeLeft) {
          translateX.value = withTiming(-SCREEN_WIDTH, { duration: 150 });
          setTimeout(() => {
            runOnJS(goToNextWeekJS)();
          }, 150);
        } else if (shouldSwipeRight) {
          translateX.value = withTiming(SCREEN_WIDTH, { duration: 150 });
          setTimeout(() => {
            runOnJS(goToPrevWeekJS)();
          }, 150);
        } else {
          // 取消滑动：回弹到当前位置
          translateX.value = withSpring(0, SPRING_CONFIG);
        }
        return;
      }

      // 展开状态：切换月份
      // 阶段 1（立即）：runOnJS startSwipe → setSelectedDate
      //   - Header / 高亮立即响应（不依赖 MonthGrid 重渲染）
      //   - 兜底 sync effect 被 isSwipingRef 跳过，displayMonth 暂时不变
      // 阶段 2（动画完成 callback）：runOnJS commitSwipe → setDisplayMonth
      //   - 触发 useLayoutEffect 的 swipe 重映射分支
      //   - 此时 panel 已视觉滑到位（旧 next/prev panel 在屏幕中心），
      //     用户看到的内容连续；MonthGrid 重渲染开销不影响用户感知
      if (shouldSwipeLeft) {
        isAnimating.value = true;
        runOnJS(startSwipeNext)();
        calendarHeight.value = withTiming(nextHeight.value, {
          duration: 200,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        });
        translateX.value = withTiming(
          -SCREEN_WIDTH,
          {
            duration: 200,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          },
          (finished) => {
            "worklet";
            if (finished) runOnJS(commitSwipeNext)();
          }
        );
      } else if (shouldSwipeRight) {
        isAnimating.value = true;
        runOnJS(startSwipePrev)();
        calendarHeight.value = withTiming(prevHeight.value, {
          duration: 200,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        });
        translateX.value = withTiming(
          SCREEN_WIDTH,
          {
            duration: 200,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          },
          (finished) => {
            "worklet";
            if (finished) runOnJS(commitSwipePrev)();
          }
        );
      } else {
        // 取消滑动：回弹到当前位置
        translateX.value = withSpring(0, SPRING_CONFIG);
        // 高度回弹到当月高度
        calendarHeight.value = withTiming(currentHeight.value, {
          duration: 200,
        });
      }
    });

  // 折叠状态用的三个 panel style
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const prevMonthStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value - SCREEN_WIDTH }],
  }));

  const nextMonthStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + SCREEN_WIDTH }],
  }));

  // 展开状态：三个 slot 各自的 animated style（基于 slotOffsets + translateX）
  const slot0Style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + slotOffsets.value[0] * SCREEN_WIDTH }],
  }));
  const slot1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + slotOffsets.value[1] * SCREEN_WIDTH }],
  }));
  const slot2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + slotOffsets.value[2] * SCREEN_WIDTH }],
  }));
  const slotStyles = [slot0Style, slot1Style, slot2Style];

  const calendarHeightStyle = useAnimatedStyle(() => ({
    height: calendarHeight.value,
  }));

  // 折叠手势（垂直滑动）- 用于月份网格区域，与水平滑动共存
  const foldGesture = Gesture.Pan()
    .activeOffsetY([-15, 15])
    .failOffsetX([-20, 20])
    .onBegin(() => {
      dragStartHeight.value = calendarHeight.value;
    })
    .onUpdate((event) => {
      const newHeight = Math.max(
        COLLAPSED_HEIGHT,
        Math.min(EXPANDED_HEIGHT, dragStartHeight.value + event.translationY)
      );
      calendarHeight.value = newHeight;
      // 同步更新折叠进度
      foldProgress.value =
        1 -
        (newHeight - COLLAPSED_HEIGHT) / (EXPANDED_HEIGHT - COLLAPSED_HEIGHT);
    })
    .onEnd((event) => {
      const { translationY, velocityY } = event;
      const shouldExpand =
        translationY > FOLD_DISTANCE_THRESHOLD ||
        velocityY > FOLD_VELOCITY_THRESHOLD;
      const shouldFold =
        translationY < -FOLD_DISTANCE_THRESHOLD ||
        velocityY < -FOLD_VELOCITY_THRESHOLD;

      const currentlyCollapsed = isCollapsedSV.value;

      if (shouldFold && !currentlyCollapsed) {
        runOnJS(toggleCollapse)();
      } else if (shouldExpand && currentlyCollapsed) {
        runOnJS(toggleCollapse)();
      } else {
        calendarHeight.value = withTiming(
          currentlyCollapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT,
          {
            duration: 250,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          }
        );
        foldProgress.value = withTiming(currentlyCollapsed ? 1 : 0, {
          duration: 250,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        });
      }
    });

  // 折叠指示器专用手势 - 仅响应垂直滑动，不限制水平偏移
  const indicatorFoldGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onBegin(() => {
      dragStartHeight.value = calendarHeight.value;
    })
    .onUpdate((event) => {
      const newHeight = Math.max(
        COLLAPSED_HEIGHT,
        Math.min(EXPANDED_HEIGHT, dragStartHeight.value + event.translationY)
      );
      calendarHeight.value = newHeight;
      // 同步更新折叠进度
      foldProgress.value =
        1 -
        (newHeight - COLLAPSED_HEIGHT) / (EXPANDED_HEIGHT - COLLAPSED_HEIGHT);
    })
    .onEnd((event) => {
      const { translationY, velocityY } = event;
      const shouldExpand =
        translationY > FOLD_DISTANCE_THRESHOLD ||
        velocityY > FOLD_VELOCITY_THRESHOLD;
      const shouldFold =
        translationY < -FOLD_DISTANCE_THRESHOLD ||
        velocityY < -FOLD_VELOCITY_THRESHOLD;

      const currentlyCollapsed = isCollapsedSV.value;

      if (shouldFold && !currentlyCollapsed) {
        runOnJS(toggleCollapse)();
      } else if (shouldExpand && currentlyCollapsed) {
        runOnJS(toggleCollapse)();
      } else {
        calendarHeight.value = withTiming(
          currentlyCollapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT,
          {
            duration: 250,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          }
        );
        foldProgress.value = withTiming(currentlyCollapsed ? 1 : 0, {
          duration: 250,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        });
      }
    });

  // 折叠指示器点击手势 - 仅在折叠状态下响应点击展开
  const indicatorTapGesture = Gesture.Tap().onEnd(() => {
    if (isCollapsed) {
      runOnJS(toggleCollapse);
    }
  });

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Fixed weekday header */}
      <View style={styles.weekdayHeader}>
        {WEEKDAYS.map((day, idx) => (
          <Text
            key={day}
            style={[
              styles.weekdayText,
              {
                color:
                  idx >= 5
                    ? theme.colors.weekendText
                    : theme.colors.textTertiary,
              },
            ]}
          >
            {day}
          </Text>
        ))}
      </View>

      {/* Swipeable month grids with fold gesture */}
      <GestureDetector gesture={Gesture.Simultaneous(panGesture, foldGesture)}>
        <Animated.View style={[styles.monthsContainer, calendarHeightStyle]}>
          {isCollapsed ? (
            // 折叠状态：周级别三屏渲染
            <>
              <Animated.View style={[styles.monthPanel, prevMonthStyle]}>
                <MonthGrid
                  year={prevWeekInfo.month.getFullYear()}
                  month={prevWeekInfo.month.getMonth()}
                  fidelity="full"
                  targetRowIndex={prevWeekInfo.rowIndex}
                  foldProgress={foldProgress}
                  screenWidth={screenWidth}
                  lunarInfoMap={prevWeekLunarInfoMap}
                  eventsMap={prevWeekEventsMap}
                />
              </Animated.View>

              <Animated.View style={[styles.monthPanel, animatedStyle]}>
                <MonthGrid
                  year={displayMonth.getFullYear()}
                  month={displayMonth.getMonth()}
                  fidelity="full"
                  targetRowIndex={targetRowIndex}
                  foldProgress={foldProgress}
                  screenWidth={screenWidth}
                  lunarInfoMap={currentLunarInfoMap}
                  eventsMap={currentEventsMap}
                />
              </Animated.View>

              <Animated.View style={[styles.monthPanel, nextMonthStyle]}>
                <MonthGrid
                  year={nextWeekInfo.month.getFullYear()}
                  month={nextWeekInfo.month.getMonth()}
                  fidelity="full"
                  targetRowIndex={nextWeekInfo.rowIndex}
                  foldProgress={foldProgress}
                  screenWidth={screenWidth}
                  lunarInfoMap={nextWeekLunarInfoMap}
                  eventsMap={nextWeekEventsMap}
                />
              </Animated.View>
            </>
          ) : (
            // 展开状态：slot-based 三屏渲染（固定 key，commit 时轮转数据）
            <>
              {slots.map((slot, i) => {
                // slot[1] = current 始终渲染，slot[0]/[2] = prev/next 受 showAdjacent 控制
                const isCurrent = i === 1;
                if (!isCurrent && (!showAdjacent || isLargeJump)) return null;
                return (
                  <Animated.View key={i} style={[styles.monthPanel, slotStyles[i]]}>
                    <MonthGrid
                      year={slot.year}
                      month={slot.month}
                      fidelity="full"
                      lunarInfoMap={slotLunarMaps[i]}
                      eventsMap={slotEventsMaps[i]}
                    />
                  </Animated.View>
                );
              })}
            </>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Collapse indicator area - includes indicator and space below it */}
      <GestureDetector
        gesture={Gesture.Simultaneous(
          indicatorFoldGesture,
          indicatorTapGesture
        )}
      >
        <View style={styles.collapseIndicatorArea}>
          <View style={styles.collapseIndicator}>
            <Ionicons
              name={isCollapsed ? "chevron-down" : "remove"}
              size={20}
              color={theme.colors.textTertiary}
            />
          </View>

          <DayInfoPanel date={selectedDate} />
        </View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  weekdayHeader: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    marginLeft: 16,
    marginRight: 16,
  },
  weekdayText: {
    fontSize: 12,
    textAlign: "center",
    width: "14.28%",
  },
  monthsContainer: {
    overflow: "hidden",
    marginTop: 16,
  },
  monthPanel: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    bottom: 100,
  },
  collapseIndicatorArea: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  collapseIndicator: {
    alignItems: "center",
    paddingVertical: 4,
  },
  collapseText: {
    fontSize: 16,
  },
});

export default MonthView;
