// FlashList 月份列表 - 水平分页滚动浏览多个月份

import type { FlashListRef } from "@shopify/flash-list";
import { FlashList } from "@shopify/flash-list";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { getLunarInfoBatch } from "../../domain/lunar";
import type { LunarDayInfo } from "../../domain/types";
import { useEventStore } from "../../stores/eventStore";
import { calculateGridHeight, getCalendarRowCount } from "../../utils/calendar";
import type { MonthItem } from "../../utils/monthData";
import MonthGrid from "./MonthGrid";

type LunarInfoMap = Map<string, LunarDayInfo>;

/** 计算月份项的精确高度 */
function getMonthItemHeight(year: number, month: number, screenWidth: number): number {
  const rowCount = getCalendarRowCount(year, month);
  return calculateGridHeight(rowCount, screenWidth);
}

interface MonthListProps {
  data: MonthItem[];
  initialMonthId: string;
  screenWidth: number;
  onMonthChange: (item: MonthItem) => void;
}

const PROGRAMMATIC_SCROLL_DEBOUNCE_MS = 300;

const MonthList = memo(function MonthList({
  data,
  initialMonthId,
  screenWidth,
  onMonthChange,
}: MonthListProps) {
  const flashListRef = useRef<FlashListRef<MonthItem>>(null);
  const getEventsForMonth = useEventStore((s) => s.getEventsForMonth);

  // 标记是否处于程序化滚动中（scrollToIndex 期间禁用 onViewableItemsChanged）
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 缓存农历和事件数据，避免重复计算
  const lunarCacheRef = useRef(new Map<string, LunarInfoMap>());
  const eventsCacheRef = useRef(new Map<string, ReturnType<typeof getEventsForMonth>>());

  const getLunarMap = useCallback(
    (year: number, month: number) => {
      const key = `${year}-${month}`;
      if (!lunarCacheRef.current.has(key)) {
        lunarCacheRef.current.set(key, getLunarInfoBatch(year, month));
      }
      return lunarCacheRef.current.get(key)!;
    },
    []
  );

  const getEventsMap = useCallback(
    (year: number, month: number) => {
      const key = `${year}-${month}`;
      if (!eventsCacheRef.current.has(key)) {
        eventsCacheRef.current.set(key, getEventsForMonth(year, month));
      }
      return eventsCacheRef.current.get(key)!;
    },
    [getEventsForMonth]
  );

  const renderItem = useCallback(
    ({ item }: { item: MonthItem }) => {
      const lunarMap = getLunarMap(item.year, item.month);
      const eventsMap = getEventsMap(item.year, item.month);
      const itemHeight = getMonthItemHeight(item.year, item.month, screenWidth);
      return (
        <View style={{ width: screenWidth, height: itemHeight }}>
          <MonthGrid
            year={item.year}
            month={item.month}
            fidelity="full"
            lunarInfoMap={lunarMap}
            eventsMap={eventsMap}
          />
        </View>
      );
    },
    [screenWidth, getLunarMap, getEventsMap]
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 150,
  });

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { item: MonthItem }[] }) => {
      // 忽略程序化滚动期间的可见性回调
      if (isProgrammaticScrollRef.current) return;
      if (viewableItems.length > 0 && viewableItems[0].item) {
        onMonthChange(viewableItems[0].item);
      }
    },
    [onMonthChange]
  );

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: viewabilityConfig.current,
      onViewableItemsChanged,
    },
  ]);

  const initialIndex = useMemo(
    () => data.findIndex((item) => item.id === initialMonthId),
    [data, initialMonthId]
  );

  /** 程序化滚动到指定索引，期间禁用 viewability 回调 */
  const scrollToIndexProgrammatic = useCallback(
    (index: number) => {
      if (!flashListRef.current) return;

      // 清除之前的 timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      isProgrammaticScrollRef.current = true;
      flashListRef.current.scrollToIndex({ index, animated: false });

      // 滚动完成后恢复 viewability 回调
      scrollTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, PROGRAMMATIC_SCROLL_DEBOUNCE_MS);
    },
    []
  );

  // 当 initialMonthId 变化时（年/月选择器跳转），滚动到对应月份
  useEffect(() => {
    const index = data.findIndex((item) => item.id === initialMonthId);
    if (index >= 0) {
      scrollToIndexProgrammatic(index);
    }
  }, [initialMonthId, data, scrollToIndexProgrammatic]);

  // 清理 timeout
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <FlashList
      ref={flashListRef}
      data={data}
      renderItem={renderItem}
      horizontal
      pagingEnabled
      viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
      initialScrollIndex={initialIndex >= 0 ? initialIndex : 0}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      decelerationRate="fast"
      disableIntervalMomentum
    />
  );
});

export default MonthList;
