const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function getShanghaiParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get('year')),
    month: Number(map.get('month')),
    day: Number(map.get('day')),
  };
}

export function getBusinessDateParts(date: Date = new Date()) {
  return getShanghaiParts(date);
}

export function getBusinessDate(date: Date = new Date()): string {
  const { year, month, day } = getBusinessDateParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function getBusinessMonth(date: Date = new Date()): string {
  const { year, month } = getBusinessDateParts(date);
  return `${year}-${pad(month)}`;
}

export function getBusinessYear(date: Date = new Date()): string {
  return String(getBusinessDateParts(date).year);
}

export function isSameBusinessDay(left: Date | string, right: Date | string): boolean {
  const l = typeof left === 'string' ? new Date(left) : left;
  const r = typeof right === 'string' ? new Date(right) : right;
  return getBusinessDate(l) === getBusinessDate(r);
}
