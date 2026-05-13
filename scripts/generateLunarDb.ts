/**
 * 预计算 1900-2100 年农历数据，生成 SQLite 数据库
 * 供 Android 原生模块查表使用
 *
 * 运行: npx tsx scripts/generateLunarDb.ts
 */

import * as path from "node:path";
import Database from "better-sqlite3";
import { lunarFromSolar, solarFestivals, solarFromDate } from "../src/domain/lunarCalc";

const START_YEAR = 1900;
const END_YEAR = 2100;
const OUTPUT_PATH = path.resolve(__dirname, "../android/app/src/main/assets/lunar_calendar.db");

// 法定假日列表
const STATUTORY_HOLIDAYS = ["元旦", "春节", "清明节", "劳动节", "端午节", "中秋节", "国庆节"];

// 传统节日（放假日）
const TRADITIONAL_HOLIDAYS = ["春节", "元宵节", "清明节", "端午节", "中秋节", "重阳节", "除夕"];

interface DayRecord {
  year: number;
  month: number;
  day: number;
  lunar_year: number;
  lunar_month: number;
  lunar_day: number;
  month_cn: string;
  day_cn: string;
  year_ganzhi: string;
  month_ganzhi: string;
  day_ganzhi: string;
  shengxiao: string;
  solar_term: string | null;
  festivals: string;
  is_holiday: number;
  is_solar_term: number;
}

function main() {
  console.log(`开始预计算 ${START_YEAR}-${END_YEAR} 年农历数据...`);

  const db = new Database(OUTPUT_PATH);

  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS lunar_days (
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      lunar_year INTEGER NOT NULL,
      lunar_month INTEGER NOT NULL,
      lunar_day INTEGER NOT NULL,
      month_cn TEXT NOT NULL,
      day_cn TEXT NOT NULL,
      year_ganzhi TEXT NOT NULL,
      month_ganzhi TEXT NOT NULL,
      day_ganzhi TEXT NOT NULL,
      shengxiao TEXT NOT NULL,
      solar_term TEXT,
      festivals TEXT NOT NULL,
      is_holiday INTEGER NOT NULL,
      is_solar_term INTEGER NOT NULL,
      PRIMARY KEY (year, month, day)
    );
    CREATE INDEX idx_ym ON lunar_days(year, month);
  `);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO lunar_days
    (year, month, day, lunar_year, lunar_month, lunar_day, month_cn, day_cn,
     year_ganzhi, month_ganzhi, day_ganzhi, shengxiao, solar_term, festivals,
     is_holiday, is_solar_term)
    VALUES (@year, @month, @day, @lunar_year, @lunar_month, @lunar_day, @month_cn, @day_cn,
            @year_ganzhi, @month_ganzhi, @day_ganzhi, @shengxiao, @solar_term, @festivals,
            @is_holiday, @is_solar_term)
  `);

  const totalDays = (END_YEAR - START_YEAR + 1) * 366;
  let processed = 0;
  let lastPercent = -1;

  db.transaction(() => {
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      for (let month = 1; month <= 12; month++) {
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month - 1, day);
          const solar = solarFromDate(date);
          const lunar = lunarFromSolar(solar);
          const solarFest = solarFestivals(solar);

          // 合并所有节日
          const allFestivals: string[] = [...lunar.festivals, ...solarFest];

          // 判断是否假日
          let isHoliday = 0;
          for (const f of lunar.festivals) {
            if (TRADITIONAL_HOLIDAYS.includes(f)) {
              isHoliday = 1;
              break;
            }
          }
          if (isHoliday === 0) {
            for (const f of solarFest) {
              if (STATUTORY_HOLIDAYS.includes(f)) {
                isHoliday = 1;
                break;
              }
            }
          }

          const record: DayRecord = {
            year,
            month,
            day,
            lunar_year: lunar.year,
            lunar_month: lunar.month,
            lunar_day: lunar.day,
            month_cn: lunar.monthInChinese,
            day_cn: lunar.dayInChinese,
            year_ganzhi: lunar.yearGanZhi,
            month_ganzhi: lunar.monthGanZhi,
            day_ganzhi: lunar.dayGanZhi,
            shengxiao: lunar.shengXiao,
            solar_term: lunar.jieQi,
            festivals: JSON.stringify(allFestivals),
            is_holiday: isHoliday,
            is_solar_term: lunar.jieQi ? 1 : 0,
          };

          insert.run(record);

          processed++;
          const percent = Math.floor((processed / totalDays) * 100);
          if (percent !== lastPercent && percent % 10 === 0) {
            console.log(`进度: ${percent}% (${processed}/${totalDays})`);
            lastPercent = percent;
          }
        }
      }
    }
  })();

  // 验证数据
  const count = db.prepare("SELECT COUNT(*) as cnt FROM lunar_days").get() as { cnt: number };
  console.log(`\n预计算完成！共 ${count.cnt} 条记录`);
  console.log(`数据库文件: ${OUTPUT_PATH}`);
  console.log(
    `文件大小: ${(db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as { size: number }).size / 1024 / 1024} MB`
  );

  db.close();
}

main();
