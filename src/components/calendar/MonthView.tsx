// 月视图组件

import { Ionicons } from "@expo/vector-icons";
import {
  addDays,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
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
import { Dimensions, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  EASE_OUT_CUBIC,
  FOLD_DISTANCE_THRESHOLD_RATIO,
  FOLD_VELOCITY_THRESHOLD,
  SPRING_CONFIG,
  SWIPE_DISTANCE_THRESHOLD_RATIO,
  SWIPE_VELOCITY_THRESHOLD,
} from "../../constants/interaction";
import { getLunarInfoBatch } from "../../domain/lunar";
import type { LunarDayInfo } from "../../domain/types";
import { getLunarInfoBatchAsync } from "../../services/lunarWorker";
import { useEventStore, useViewStore } from "../../stores/eventStore";
import { useTheme } from "../../stores/themeStore";
import {
  calculateGridHeight,
  calculateSingleRowHeight,
  getCalendarRowCount,
  getRowIndexForDate,
} from "../../utils/calendar";
import { generateMonthItems, getMonthId, type MonthItem } from "../../utils/monthData";
import { DayInfoPanel } from "./DayInfoPanel";
import MonthGrid from "./MonthGrid";
import MonthList from "./MonthList";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const SWIPE_DISTANCE_THRESHOLD = SCREEN_WIDTH * SWIPE_DISTANCE_THRESHOLD_RATIO;
const FOLD_DISTANCE_THRESHOLD = SCREEN_HEIGHT * FOLD_DISTANCE_THRESHOLD_RATIO;

const EMPTY_LUNAR_MAP: ReadonlyMap<string, never> = new Map<string, never>();
const EMPTY_EVENTS_MAP: ReadonlyMap<string, never> = new Map<string, never>();
type LunarInfoMap = Map<string, LunarDayInfo>;

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export const MonthView: React.FC = () => {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const selectedDate = useViewStore((s) => s.selectedDate);
  const displayMonthStr = useViewStore((s) => s.displayMonth);
  const setDisplayMonth = useViewStore((s) => s.setDisplayMonth);
  const setSelectedDate = useViewStore((s) => s.setSelectedDate);
  const setSelectedDateAndMonth = useViewStore((s) => s.setSelectedDateAndMonth);
  const setHasNavigatedMonth = useViewStore((s) => s.setHasNavigatedMonth);

  const displayMonth = useMemo(() => {
    const date = new Date(displayMonthStr);
    return startOfMonth(date);
  }, [displayMonthStr]);

  // ── FlashList 月份数据（以当前月为中心，前后各 10 年）─────────────────
  const monthItems = useMemo(() => {
    const [year, month] = displayMonthStr.split("-").map(Number);
    return generateMonthItems(year, month - 1, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayMonthStrRef = useRef(displayMonthStr);
  displayMonthStrRef.current = displayMonthStr;

  // FlashList 容器动态高度（跟随当前可见月份）
  const [visibleMonthHeight, setVisibleMonthHeight] = useState(0);

  const handleMonthChange = useCallback(
    (item: MonthItem) => {
      const newMonthStr = `${item.year}-${String(item.month + 1).padStart(2, "0")}-01`;
      if (newMonthStr === displayMonthStrRef.current) return;

      setDisplayMonth(newMonthStr);
      setHasNavigatedMonth(true);

      const today = new Date();
      const newMonth = new Date(item.year, item.month, 1);
      const targetDate = isSameMonth(newMonth, today)
        ? format(today, "yyyy-MM-dd")
        : newMonthStr;
      setSelectedDate(targetDate);
    },
    [setDisplayMonth, setHasNavigatedMonth, setSelectedDate]
  );

  // ── 指示器弹簧动画 ──────────────────────────────────────────────
  const indicatorBounce = useSharedValue(0);

  const triggerIndicatorSpring = useCallback(() => {
    indicatorBounce.value = withSequence(
      withTiming(6, { duration: 60 }),
      withSpring(0, { damping: 14, stiffness: 200 })
    );
  }, [indicatorBounce]);

  const indicatorSpringStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: indicatorBounce.value }],
  }));

  const prevMonthIdRef = useRef<string>("");
  const handleMonthChangeWithSpring = useCallback(
    (item: MonthItem) => {
      if (item.id !== prevMonthIdRef.current) {
        prevMonthIdRef.current = item.id;
        // 同步更新 FlashList 容器高度为当前月份实际高度
        const rowCount = getCalendarRowCount(item.year, item.month);
        const height = calculateGridHeight(rowCount, screenWidth);
        setVisibleMonthHeight(height);
        handleMonthChange(item);
        triggerIndicatorSpring();
      }
    },
    [screenWidth, handleMonthChange, triggerIndicatorSpring]
  );

  // ── 折叠状态 ────────────────────────────────────────────────────
  const [isCollapsed, setIsCollapsed] = useState(false);
  const calendarHeight = useSharedValue(320);
  const dragStartHeight = useSharedValue(320);
  const foldProgress = useSharedValue(0);
  const isCollapsedSV = useSharedValue(false);

  const currentRowCount = useMemo(
    () => getCalendarRowCount(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth]
  );

  const EXPANDED_HEIGHT = useMemo(
    () => calculateGridHeight(currentRowCount, screenWidth),
    [currentRowCount, screenWidth]
  );
  const COLLAPSED_HEIGHT = useMemo(
    () => calculateSingleRowHeight(screenWidth),
    [screenWidth]
  );

  const targetRowIndex = useMemo(() => {
    const targetDateStr = selectedDate || new Date().toISOString().split("T")[0];
    const targetDate = new Date(targetDateStr);
    return getRowIndexForDate(targetDate, displayMonth.getFullYear(), displayMonth.getMonth());
  }, [selectedDate, displayMonth]);

  const currentWeekTargetDate = useMemo(() => {
    const targetDateStr = selectedDate || new Date().toISOString().split("T")[0];
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

  const currentLunarInfoMap = useMemo(() => {
    return getLunarInfoBatch(displayMonth.getFullYear(), displayMonth.getMonth());
  }, [displayMonth]);

  const getEventsForMonth = useEventStore((s) => s.getEventsForMonth);

  const currentEventsMap = useMemo(
    () => getEventsForMonth(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth, getEventsForMonth]
  );

  const [prevWeekLunarInfoMap, setPrevWeekLunarInfoMap] = useState<LunarInfoMap>(
    EMPTY_LUNAR_MAP as any
  );
  const [nextWeekLunarInfoMap, setNextWeekLunarInfoMap] = useState<LunarInfoMap>(
    EMPTY_LUNAR_MAP as any
  );

  useEffect(() => {
    if (!isCollapsed) return;

    let cancelled = false;

    getLunarInfoBatchAsync(prevWeekInfo.month.getFullYear(), prevWeekInfo.month.getMonth()).then(
      (map) => {
        if (!cancelled) setPrevWeekLunarInfoMap(map);
      }
    );

    getLunarInfoBatchAsync(nextWeekInfo.month.getFullYear(), nextWeekInfo.month.getMonth()).then(
      (map) => {
        if (!cancelled) setNextWeekLunarInfoMap(map);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [isCollapsed, prevWeekInfo.month, nextWeekInfo.month]);

  const prevWeekEventsMap = useMemo(
    () =>
      isCollapsed
        ? getEventsForMonth(prevWeekInfo.month.getFullYear(), prevWeekInfo.month.getMonth())
        : (EMPTY_EVENTS_MAP as any),
    [isCollapsed, prevWeekInfo.month, getEventsForMonth]
  );
  const nextWeekEventsMap = useMemo(
    () =>
      isCollapsed
        ? getEventsForMonth(nextWeekInfo.month.getFullYear(), nextWeekInfo.month.getMonth())
        : (EMPTY_EVENTS_MAP as any),
    [isCollapsed, nextWeekInfo.month, getEventsForMonth]
  );

  // 初始化高度
  useLayoutEffect(() => {
    calendarHeight.value = EXPANDED_HEIGHT;
    dragStartHeight.value = EXPANDED_HEIGHT;
  }, [EXPANDED_HEIGHT, calendarHeight, dragStartHeight]);

  // 同步折叠状态到 shared value
  useEffect(() => {
    isCollapsedSV.value = isCollapsed;
  }, [isCollapsed, isCollapsedSV]);

  // 同步当前月份高度到 FlashList 容器（展开状态）
  useLayoutEffect(() => {
    if (isCollapsed) return;
    const rowCount = getCalendarRowCount(displayMonth.getFullYear(), displayMonth.getMonth());
    const height = calculateGridHeight(rowCount, screenWidth);
    setVisibleMonthHeight(height);
  }, [displayMonth, screenWidth, isCollapsed]);

  // 当 selectedDate 月份与 displayMonth 不同步时兜底同步
  const prevDisplayMonthRef = useRef(displayMonthStr);
  useLayoutEffect(() => {
    prevDisplayMonthRef.current = displayMonthStr;
    const selectedMonth = selectedDate.slice(0, 7); // "yyyy-MM"
    const displayMonthSlice = displayMonthStr.slice(0, 7);
    if (selectedMonth === displayMonthSlice) return;
    const monthStartStr = `${selectedMonth}-01`;
    setDisplayMonth(monthStartStr);
  }, [selectedDate, displayMonthStr, setDisplayMonth]);

  // 折叠高度动画
  useLayoutEffect(() => {
    calendarHeight.value = withTiming(isCollapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT, {
      duration: 250,
      easing: EASE_OUT_CUBIC,
    });
    foldProgress.value = withTiming(isCollapsed ? 1 : 0, {
      duration: 250,
      easing: EASE_OUT_CUBIC,
    });
  }, [isCollapsed, EXPANDED_HEIGHT, COLLAPSED_HEIGHT, calendarHeight, foldProgress]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  // ── 折叠状态：三屏周视图滑动 ─────────────────────────────────────
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const isAnimating = useSharedValue(false);

  const goToWeekJS = useCallback(
    (direction: "next" | "prev") => {
      translateX.value = 0;
      const currentDate = new Date(selectedDate);
      const targetWeek = direction === "next" ? addDays(currentDate, 7) : subDays(currentDate, 7);

      const today = new Date();
      const weekStart = startOfWeek(targetWeek, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(targetWeek, { weekStartsOn: 1 });
      const targetDate =
        today >= weekStart && today <= weekEnd
          ? format(today, "yyyy-MM-dd")
          : format(weekStart, "yyyy-MM-dd");

      if (isSameMonth(targetWeek, displayMonth)) {
        setSelectedDate(targetDate);
      } else {
        setSelectedDateAndMonth(targetDate);
      }
    },
    [selectedDate, displayMonth, setSelectedDate, setSelectedDateAndMonth, translateX]
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      if (isAnimating.value) return;
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (isAnimating.value) return;

      const { translationX, velocityX } = event;
      const shouldSwipeLeft =
        translationX < -SWIPE_DISTANCE_THRESHOLD || velocityX < -SWIPE_VELOCITY_THRESHOLD;
      const shouldSwipeRight =
        translationX > SWIPE_DISTANCE_THRESHOLD || velocityX > SWIPE_VELOCITY_THRESHOLD;

      if (shouldSwipeLeft) {
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 150 });
        setTimeout(() => {
          runOnJS(goToWeekJS)("next");
        }, 150);
      } else if (shouldSwipeRight) {
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 150 });
        setTimeout(() => {
          runOnJS(goToWeekJS)("prev");
        }, 150);
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
      }
    });

  // 折叠状态三屏样式
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

  const calendarHeightStyle = useAnimatedStyle(() => ({
    height: calendarHeight.value,
  }));

  // 折叠手势（仅在指示器区域响应）
  const createFoldGesture = useCallback(
    (options: { failOffsetX?: [number, number] }) => {
      const gesture = Gesture.Pan()
        .activeOffsetY([-15, 15])
        .onBegin(() => {
          dragStartHeight.value = calendarHeight.value;
        })
        .onUpdate((event) => {
          const newHeight = Math.max(
            COLLAPSED_HEIGHT,
            Math.min(EXPANDED_HEIGHT, dragStartHeight.value + event.translationY)
          );
          calendarHeight.value = newHeight;
          foldProgress.value =
            1 - (newHeight - COLLAPSED_HEIGHT) / (EXPANDED_HEIGHT - COLLAPSED_HEIGHT);
        })
        .onEnd((event) => {
          const { translationY, velocityY } = event;
          const shouldExpand =
            translationY > FOLD_DISTANCE_THRESHOLD || velocityY > FOLD_VELOCITY_THRESHOLD;
          const shouldFold =
            translationY < -FOLD_DISTANCE_THRESHOLD || velocityY < -FOLD_VELOCITY_THRESHOLD;

          const currentlyCollapsed = isCollapsedSV.value;

          if (shouldFold && !currentlyCollapsed) {
            runOnJS(toggleCollapse)();
          } else if (shouldExpand && currentlyCollapsed) {
            runOnJS(toggleCollapse)();
          } else {
            calendarHeight.value = withTiming(
              currentlyCollapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT,
              { duration: 250, easing: EASE_OUT_CUBIC }
            );
            foldProgress.value = withTiming(currentlyCollapsed ? 1 : 0, {
              duration: 250,
              easing: EASE_OUT_CUBIC,
            });
          }
        });
      if (options.failOffsetX) {
        gesture.failOffsetX(options.failOffsetX);
      }
      return gesture;
    },
    [
      COLLAPSED_HEIGHT,
      EXPANDED_HEIGHT,
      dragStartHeight,
      calendarHeight,
      foldProgress,
      isCollapsedSV,
      toggleCollapse,
    ]
  );

  const indicatorFoldGesture = createFoldGesture({});

  const indicatorTapGesture = Gesture.Tap().onEnd(() => {
    if (isCollapsed) {
      runOnJS(toggleCollapse)();
    }
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Fixed weekday header */}
      <View style={styles.weekdayHeader}>
        {WEEKDAYS.map((day, idx) => (
          <Text
            key={day}
            style={[
              styles.weekdayText,
              {
                color: idx >= 5 ? theme.colors.weekendText : theme.colors.textTertiary,
              },
            ]}
          >
            {day}
          </Text>
        ))}
      </View>

      {/* 折叠状态：三屏周视图 */}
      {isCollapsed && (
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.monthsContainer, calendarHeightStyle]}>
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
          </Animated.View>
        </GestureDetector>
      )}

      {/* 展开状态：FlashList 月份列表 */}
      {!isCollapsed && (
        <View style={[styles.monthListContainer, { height: visibleMonthHeight }]}>
          <MonthList
            data={monthItems}
            initialMonthId={getMonthId(displayMonth.getFullYear(), displayMonth.getMonth())}
            screenWidth={screenWidth}
            onMonthChange={handleMonthChangeWithSpring}
          />
        </View>
      )}

      {/* 指示器区域 - 上下滑动折叠/展开 */}
      <GestureDetector gesture={Gesture.Simultaneous(indicatorFoldGesture, indicatorTapGesture)}>
        <Animated.View style={[styles.collapseIndicatorArea, indicatorSpringStyle]}>
          <View style={styles.collapseIndicator}>
            <Ionicons
              name={isCollapsed ? "chevron-down" : "remove"}
              size={20}
              color={theme.colors.textTertiary}
            />
          </View>

          <DayInfoPanel date={selectedDate} />
        </Animated.View>
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
  monthListContainer: {
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
