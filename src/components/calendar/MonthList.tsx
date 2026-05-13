// FlashList 月份列表 - 水平分页滚动浏览多个月份

import { FlashList } from "@shopify/flash-list";
import { memo, useCallback, useMemo, useRef } from "react";
import { Dimensions, View } from "react-native";
import { getLunarInfoBatch } from "../../domain/lunar";
import type { LunarDayInfo } from "../../domain/types";
import { useEventStore } from "../../stores/eventStore";
import type { MonthItem } from "../../utils/monthData";
import MonthGrid from "./MonthGrid";

const SCREEN_WIDTH = Dimensions.get("window").width;

type LunarInfoMap = Map<string, LunarDayInfo>;

interface MonthListProps {
  data: MonthItem[];
  initialMonthId: string;
  screenWidth: number;
  onMonthChange: (item: MonthItem) => void;
}

const MonthList = memo(function MonthList({
  data,
  initialMonthId,
  screenWidth,
  onMonthChange,
}: MonthListProps) {
  const getEventsForMonth = useEventStore((s) => s.getEventsForMonth);

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
      return (
        <View style={{ width: screenWidth }}>
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
    ({ viewableItems }: { viewableItems: Array<{ item: MonthItem }> }) => {
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

  return (
    <FlashList
      data={data}
      renderItem={renderItem}
      horizontal
      pagingEnabled
      estimatedItemSize={SCREEN_WIDTH}
      viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
      initialScrollIndex={initialIndex >= 0 ? initialIndex : 0}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      decelerationRate="fast"
      snapToInterval={screenWidth}
      disableIntervalMomentum
    />
  );
});

export default MonthList;
