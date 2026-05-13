export const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getTodayString = (): string => formatDateKey(new Date());

export const getMonthStartString = (): string => {
  const today = new Date();
  return formatDateKey(new Date(today.getFullYear(), today.getMonth(), 1));
};
