import { describe, expect, it } from 'vitest';
import { convertExcelRows } from '@/lib/excelImport';

describe('Excel import conversion', () => {
  const now = '2026-10-26T00:00:00.000Z';

  it('maps exported Chinese columns back to domain objects', () => {
    const result = convertExcelRows({
      accounts: [{ 账户ID: 'a1', 账户名称: '证券账户', 类型: '证券', 余额: 1000, 币种: 'CNY', 创建时间: now, 更新时间: now }],
      positions: [{ 持仓ID: 'p1', 持仓名称: '贵州茅台', 代码: '600519', 类型: 'stock', 数量: 2, 成本价: 100, 当前价: 110, 所属账户ID: 'a1', 创建时间: now, 更新时间: now }],
      trades: [{ 交易ID: 't1', 持仓ID: 'p1', 时间: now, 类型: '买入', 资产类型: 'stock', 名称: '贵州茅台', 代码: '600519', 数量: 2, 价格: 100, 总额: 200, 手续费: 1, 账户ID: 'a1', 创建时间: now }],
      transfers: [{ 转账ID: 'x1', 时间: now, 转出账户ID: 'external', 转入账户ID: 'a1', 金额: 1000, 币种: 'CNY' }],
      snapshots: [{ 快照ID: 's1', 日期: '2026-10-26', 总价值: 1220, 现金: 1000, 投资: 220, 日变化: 20, 日变化率: '1.67%', 累计变化: 20, 累计变化率: '1.67%', 创建时间: now }],
    }, now);

    expect(result.accounts[0]).toMatchObject({ id: 'a1', type: 'securities', balance: 1000 });
    expect(result.positions[0]).toMatchObject({ id: 'p1', accountId: 'a1', symbol: '600519' });
    expect(result.trades[0]).toMatchObject({ id: 't1', positionId: 'p1', type: 'buy' });
    expect(result.transfers[0]).toMatchObject({ fromAccountId: 'external', toAccountId: 'a1' });
    expect(result.snapshots[0]).toMatchObject({ id: 's1', dailyChangePercent: 1.67 });
  });

  it('rejects orphaned position references before replacing user data', () => {
    expect(() => convertExcelRows({
      accounts: [],
      positions: [{ 持仓名称: '孤儿持仓', 代码: 'X', 所属账户ID: 'missing' }],
      trades: [], transfers: [], snapshots: [],
    }, now)).toThrow('引用了不存在的账户');
  });
});
