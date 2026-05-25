import { describe, it, expect } from 'vitest';
import { isFundSymbol } from '@/lib/priceApi';
import { ASSET_TYPE_CONFIG } from '@/types';
import type {
  Account,
  Position,
  Snapshot,
  Trade,
  AssetType,
  AssetAllocation,
  AccountValue,
  PositionValue,
  TradeExecutionResult,
  TargetAllocation,
  AllocationTarget,
  ActionResult,
} from '@/types';

describe('priceApi - isFundSymbol', () => {
  it('should return true for ETF fund symbols', () => {
    expect(isFundSymbol('510050')).toBe(true);
    expect(isFundSymbol('510300')).toBe(true);
    expect(isFundSymbol('159919')).toBe(true);
  });

  it('should return true for equity fund symbols', () => {
    expect(isFundSymbol('161725')).toBe(true);
    expect(isFundSymbol('110011')).toBe(true);
    expect(isFundSymbol('006327')).toBe(true);
  });

  it('should return true for bond fund symbols', () => {
    expect(isFundSymbol('470058')).toBe(true);
    expect(isFundSymbol('485105')).toBe(true);
  });

  it('should return true for money market fund symbols', () => {
    expect(isFundSymbol('000009')).toBe(true);
    expect(isFundSymbol('000538')).toBe(true);
  });

  it('should return false for stock symbols', () => {
    expect(isFundSymbol('600519')).toBe(false);
    expect(isFundSymbol('000001')).toBe(false);
    expect(isFundSymbol('688111')).toBe(false);
  });

  it('should return false for non-6-digit strings', () => {
    expect(isFundSymbol('AAPL')).toBe(false);
    expect(isFundSymbol('00700')).toBe(false);
    expect(isFundSymbol('123')).toBe(false);
    expect(isFundSymbol('')).toBe(false);
  });
});

describe('types - ASSET_TYPE_CONFIG', () => {
  it('should have config for all asset types', () => {
    const assetTypes: AssetType[] = ['stock', 'fund', 'bank_wealth_management', 'bank_cash'];
    assetTypes.forEach((type) => {
      expect(ASSET_TYPE_CONFIG[type]).toBeDefined();
      expect(ASSET_TYPE_CONFIG[type].label).toBeDefined();
      expect(ASSET_TYPE_CONFIG[type].icon).toBeDefined();
      expect(ASSET_TYPE_CONFIG[type].color).toBeDefined();
    });
  });

  it('should have correct labels', () => {
    expect(ASSET_TYPE_CONFIG.stock.label).toBe('股票');
    expect(ASSET_TYPE_CONFIG.fund.label).toBe('基金');
    expect(ASSET_TYPE_CONFIG.bank_wealth_management.label).toBe('银行理财');
    expect(ASSET_TYPE_CONFIG.bank_cash.label).toBe('现金');
  });

  it('should have Chinese labels for UI', () => {
    Object.values(ASSET_TYPE_CONFIG).forEach((config) => {
      expect(config.label.length).toBeGreaterThan(0);
    });
  });
});

describe('types - Interface Structures', () => {
  it('should allow creating valid Account objects', () => {
    const account: Account = {
      id: 'test-id',
      name: '测试账户',
      type: 'brokerage',
      institution: '招商证券',
      holder: '张三',
      balance: 100000,
      currency: 'CNY',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    expect(account.type).toBe('brokerage');
    expect(account.currency).toBe('CNY');
  });

  it('should allow creating valid Position objects', () => {
    const position: Position = {
      id: 'pos-1',
      accountId: 'acc-1',
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      quantity: 100,
      avgCost: 1500,
      currentPrice: 1600,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    expect(position.assetType).toBe('stock');
    expect(position.symbol).toBe('600519');
  });

  it('should allow creating valid Trade objects', () => {
    const trade: Trade = {
      id: 'trade-1',
      accountId: 'acc-1',
      assetType: 'fund',
      symbol: '510050',
      name: '华夏上证50ETF',
      type: 'buy',
      quantity: 1000,
      price: 2.5,
      total: 2500,
      fees: 5,
      executedAt: '2024-01-01T10:00:00.000Z',
      createdAt: '2024-01-01T10:00:00.000Z',
    };
    expect(trade.type).toBe('buy');
    expect(trade.fees).toBe(5);
  });

  it('should allow creating valid Snapshot objects', () => {
    const snapshot: Snapshot = {
      id: 'snap-1',
      date: '2024-01-01',
      totalValue: 500000,
      cash: 100000,
      investments: 400000,
      dailyChange: 5000,
      dailyChangePercent: 1.0,
      totalChange: 50000,
      totalChangePercent: 11.1,
      allocations: [],
      accountValues: [],
      positionValues: [],
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    expect(snapshot.totalValue).toBe(500000);
    expect(snapshot.allocations).toEqual([]);
  });

  it('should allow creating valid TargetAllocation objects', () => {
    const allocation: TargetAllocation = {
      id: 'alloc-1',
      name: '稳健配置',
      description: '低风险投资配置方案',
      allocations: [
        { category: '股票', percentage: 30 },
        { category: '基金', percentage: 40 },
        { category: '现金', percentage: 30 },
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    expect(allocation.allocations.length).toBe(3);
    expect(allocation.allocations.reduce((sum, a) => sum + a.percentage, 0)).toBe(100);
  });

  it('should support ActionResult pattern for success', () => {
    const result: ActionResult<Account> = {
      success: true,
      data: {
        id: 'test',
        name: 'Test',
        type: 'brokerage',
        currency: 'CNY',
        balance: 0,
        createdAt: '',
        updatedAt: '',
      },
    };
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should support ActionResult pattern for failure', () => {
    const result: ActionResult<Account> = {
      success: false,
      error: 'Account not found',
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe('Account not found');
  });

  it('should support TradeExecutionResult pattern', () => {
    const successResult: TradeExecutionResult = {
      success: true,
      trade: {
        id: 'trade-1',
        accountId: 'acc-1',
        assetType: 'stock',
        symbol: '600519',
        name: '贵州茅台',
        type: 'buy',
        quantity: 100,
        price: 1500,
        total: 150000,
        fees: 10,
        executedAt: '',
        createdAt: '',
      },
      position: {
        id: 'pos-1',
        accountId: 'acc-1',
        assetType: 'stock',
        symbol: '600519',
        name: '贵州茅台',
        quantity: 100,
        avgCost: 1500,
        currentPrice: 1500,
        createdAt: '',
        updatedAt: '',
      },
      accountBalance: 99850,
    };
    expect(successResult.success).toBe(true);
    expect(successResult.trade).toBeDefined();
    expect(successResult.position).toBeDefined();

    const failResult: TradeExecutionResult = {
      success: false,
      error: '余额不足',
    };
    expect(failResult.success).toBe(false);
    expect(failResult.error).toBe('余额不足');
  });
});
