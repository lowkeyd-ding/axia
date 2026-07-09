/**
 * 价格颜色配置
 * 根据市场习惯设置涨跌颜色
 * A股：红涨绿跌
 * 美股：绿涨红跌
 */

export const PRICE_COLORS = {
  // A股习惯（红涨绿跌）
  aShare: {
    rise: 'text-red-500',
    fall: 'text-green-600',
    bgRise: 'bg-red-100 text-red-600',
    bgFall: 'bg-green-100 text-green-600',
  },
  // 美股习惯（绿涨红跌）
  usShare: {
    rise: 'text-green-600',
    fall: 'text-red-500',
    bgRise: 'bg-green-100 text-green-600',
    bgFall: 'bg-red-100 text-red-600',
  },
} as const;

// 默认使用 A 股习惯
export const DEFAULT_PRICE_COLORS = PRICE_COLORS.aShare;

// 涨跌提示文字
export const PRICE_LABELS = {
  rise: '+',
  fall: '-',
} as const;
