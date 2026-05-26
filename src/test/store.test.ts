import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/lib/store';
import type { Account, Position, Snapshot, Trade } from '@/types';

describe('useAppStore - Accounts', () => {
  beforeEach(() => {
    const store = useAppStore.getState();
    store.setAccounts([]);
    store.setPositions([]);
    store.setSnapshots([]);
    store.setTrades([]);
  });

  it('should add an account successfully', () => {
    const { addAccount } = useAppStore.getState();
    const result = addAccount({
      name: 'Test Account',
      type: 'securities',
      institution: 'Test Broker',
      currency: 'CNY',
      holder: 'Test User',
      balance: 10000,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.name).toBe('Test Account');
    expect(result.data?.type).toBe('securities');
    expect(result.data?.balance).toBe(10000);
    expect(result.data?.id).toBeDefined();
    expect(result.data?.createdAt).toBeDefined();
    expect(result.data?.updatedAt).toBeDefined();
  });

  it('should update an account successfully', () => {
    const { addAccount, updateAccount } = useAppStore.getState();
    const addResult = addAccount({
      name: 'Original Name',
      type: 'securities',
      institution: 'Test Broker',
      currency: 'CNY',
      holder: 'Test User',
      balance: 10000,
    });

    const updateResult = updateAccount(addResult.data!.id, {
      name: 'Updated Name',
      balance: 20000,
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.name).toBe('Updated Name');
    expect(updateResult.data?.balance).toBe(20000);
  });

  it('should fail to update non-existent account', () => {
    const { updateAccount } = useAppStore.getState();
    const result = updateAccount('non-existent-id', { name: 'Test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should delete an account and its positions/trades', () => {
    const { addAccount, addPosition, addTrade, deleteAccount } = useAppStore.getState();

    const accResult = addAccount({
      name: 'Test Account',
      type: 'securities',
      institution: 'Test Broker',
      currency: 'CNY',
      holder: 'Test User',
      balance: 10000,
    });
    const accountId = accResult.data!.id;

    addPosition({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      quantity: 100,
      avgCost: 1500,
      currentPrice: 1600,
    });

    addTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 100,
      price: 1500,
      total: 150000,
      fees: 10,
      executedAt: new Date().toISOString(),
    });

    const deleteResult = deleteAccount(accountId);
    expect(deleteResult.success).toBe(true);

    const { accounts, positions, trades } = useAppStore.getState();
    expect(accounts.some((a) => a.id === accountId)).toBe(false);
    expect(positions.some((p) => p.accountId === accountId)).toBe(false);
    expect(trades.some((t) => t.accountId === accountId)).toBe(false);
  });

  it('should fail to delete non-existent account', () => {
    const { deleteAccount } = useAppStore.getState();
    const result = deleteAccount('non-existent-id');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('useAppStore - Positions', () => {
  let accountId: string;

  beforeEach(() => {
    const store = useAppStore.getState();
    store.setAccounts([]);
    store.setPositions([]);
    store.setSnapshots([]);
    store.setTrades([]);

    const { addAccount } = useAppStore.getState();
    const result = addAccount({
      name: 'Test Account',
      type: 'securities',
      institution: 'Test Broker',
      currency: 'CNY',
      holder: 'Test User',
      balance: 100000,
    });
    accountId = result.data!.id;
  });

  it('should add a position successfully', () => {
    const { addPosition } = useAppStore.getState();
    const result = addPosition({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      quantity: 100,
      avgCost: 1500,
      currentPrice: 1600,
    });

    expect(result.success).toBe(true);
    expect(result.data?.symbol).toBe('600519');
    expect(result.data?.quantity).toBe(100);
    expect(result.data?.avgCost).toBe(1500);
    expect(result.data?.currentPrice).toBe(1600);
  });

  it('should update a position successfully', () => {
    const { addPosition, updatePosition } = useAppStore.getState();
    const addResult = addPosition({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      quantity: 100,
      avgCost: 1500,
      currentPrice: 1600,
    });

    const updateResult = updatePosition(addResult.data!.id, {
      currentPrice: 1700,
      quantity: 200,
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.currentPrice).toBe(1700);
    expect(updateResult.data?.quantity).toBe(200);
  });

  it('should fail to update non-existent position', () => {
    const { updatePosition } = useAppStore.getState();
    const result = updatePosition('non-existent-id', { currentPrice: 1700 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should delete a position successfully', () => {
    const { addPosition, deletePosition } = useAppStore.getState();
    const addResult = addPosition({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      quantity: 100,
      avgCost: 1500,
      currentPrice: 1600,
    });

    const deleteResult = deletePosition(addResult.data!.id);
    expect(deleteResult.success).toBe(true);

    const { positions } = useAppStore.getState();
    expect(positions.some((p) => p.id === addResult.data!.id)).toBe(false);
  });
});

describe('useAppStore - Snapshots', () => {
  beforeEach(() => {
    const store = useAppStore.getState();
    store.setAccounts([]);
    store.setPositions([]);
    store.setSnapshots([]);
    store.setTrades([]);
  });

  it('should add a snapshot successfully', () => {
    const { addSnapshot } = useAppStore.getState();
    const result = addSnapshot({
      date: '2024-01-01',
      totalValue: 100000,
      cash: 20000,
      investments: 80000,
      dailyChange: 1000,
      dailyChangePercent: 1.0,
      totalChange: 5000,
      totalChangePercent: 5.0,
      allocations: [],
      accountValues: [],
      positionValues: [],
    });

    expect(result.success).toBe(true);
    expect(result.data?.date).toBe('2024-01-01');
    expect(result.data?.totalValue).toBe(100000);
  });

  it('should sort snapshots by date descending', () => {
    const { addSnapshot } = useAppStore.getState();
    addSnapshot({
      date: '2024-01-01',
      totalValue: 100000,
      cash: 20000,
      investments: 80000,
      dailyChange: 0,
      dailyChangePercent: 0,
      totalChange: 0,
      totalChangePercent: 0,
      allocations: [],
      accountValues: [],
      positionValues: [],
    });
    addSnapshot({
      date: '2024-03-01',
      totalValue: 120000,
      cash: 25000,
      investments: 95000,
      dailyChange: 2000,
      dailyChangePercent: 1.7,
      totalChange: 20000,
      totalChangePercent: 20.0,
      allocations: [],
      accountValues: [],
      positionValues: [],
    });
    addSnapshot({
      date: '2024-02-01',
      totalValue: 110000,
      cash: 22000,
      investments: 88000,
      dailyChange: 10000,
      dailyChangePercent: 10.0,
      totalChange: 10000,
      totalChangePercent: 10.0,
      allocations: [],
      accountValues: [],
      positionValues: [],
    });

    const { snapshots } = useAppStore.getState();
    expect(snapshots.length).toBe(3);
    expect(snapshots[0].date).toBe('2024-03-01');
    expect(snapshots[1].date).toBe('2024-02-01');
    expect(snapshots[2].date).toBe('2024-01-01');
  });

  it('should update a snapshot successfully', () => {
    const { addSnapshot, updateSnapshot } = useAppStore.getState();
    const addResult = addSnapshot({
      date: '2024-01-01',
      totalValue: 100000,
      cash: 20000,
      investments: 80000,
      dailyChange: 0,
      dailyChangePercent: 0,
      totalChange: 0,
      totalChangePercent: 0,
      allocations: [],
      accountValues: [],
      positionValues: [],
    });

    const updateResult = updateSnapshot(addResult.data!.id, {
      note: 'Updated note',
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.note).toBe('Updated note');
  });

  it('should delete a snapshot successfully', () => {
    const { addSnapshot, deleteSnapshot } = useAppStore.getState();
    const addResult = addSnapshot({
      date: '2024-01-01',
      totalValue: 100000,
      cash: 20000,
      investments: 80000,
      dailyChange: 0,
      dailyChangePercent: 0,
      totalChange: 0,
      totalChangePercent: 0,
      allocations: [],
      accountValues: [],
      positionValues: [],
    });

    const deleteResult = deleteSnapshot(addResult.data!.id);
    expect(deleteResult.success).toBe(true);

    const { snapshots } = useAppStore.getState();
    expect(snapshots.length).toBe(0);
  });
});

describe('useAppStore - Trades', () => {
  let accountId: string;

  beforeEach(() => {
    const store = useAppStore.getState();
    store.setAccounts([]);
    store.setPositions([]);
    store.setSnapshots([]);
    store.setTrades([]);

    const { addAccount } = useAppStore.getState();
    const result = addAccount({
      name: 'Test Account',
      type: 'securities',
      institution: 'Test Broker',
      currency: 'CNY',
      holder: 'Test User',
      balance: 100000,
    });
    accountId = result.data!.id;
  });

  it('should add a trade successfully', () => {
    const { addTrade } = useAppStore.getState();
    const result = addTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 100,
      price: 1500,
      total: 150000,
      fees: 10,
      executedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('buy');
    expect(result.data?.quantity).toBe(100);
    expect(result.data?.fees).toBe(10);
  });

  it('should sort trades by executedAt descending', () => {
    const { addTrade } = useAppStore.getState();
    addTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 100,
      price: 1500,
      total: 150000,
      fees: 10,
      executedAt: '2024-01-01T10:00:00.000Z',
    });
    addTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 50,
      price: 1600,
      total: 80000,
      fees: 5,
      executedAt: '2024-03-01T14:00:00.000Z',
    });
    addTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'sell',
      quantity: 20,
      price: 1700,
      total: 34000,
      fees: 3,
      executedAt: '2024-02-15T09:30:00.000Z',
    });

    const { trades } = useAppStore.getState();
    expect(trades.length).toBe(3);
    expect(trades[0].executedAt).toBe('2024-03-01T14:00:00.000Z');
    expect(trades[1].executedAt).toBe('2024-02-15T09:30:00.000Z');
    expect(trades[2].executedAt).toBe('2024-01-01T10:00:00.000Z');
  });
});

describe('useAppStore - executeTrade', () => {
  let accountId: string;

  beforeEach(() => {
    const store = useAppStore.getState();
    store.setAccounts([]);
    store.setPositions([]);
    store.setSnapshots([]);
    store.setTrades([]);

    const { addAccount } = useAppStore.getState();
    const result = addAccount({
      name: 'Test Account',
      type: 'securities',
      institution: 'Test Broker',
      currency: 'CNY',
      holder: 'Test User',
      balance: 100000,
    });
    accountId = result.data!.id;
  });

  it('should execute a buy trade and create position', () => {
    const { executeTrade } = useAppStore.getState();
    // Use a smaller trade that fits within 100000 balance
    const result = executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 60,
      price: 1500,
      total: 90000,
      fees: 10,
      executedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
    expect(result.trade).toBeDefined();
    expect(result.position).toBeDefined();
    expect(result.position!.quantity).toBe(60);
    expect(result.position!.avgCost).toBe(1500);
    expect(result.accountBalance).toBe(100000 - 90000 - 10);
  });

  it('should fail buy trade when balance is insufficient', () => {
    const { executeTrade } = useAppStore.getState();
    const result = executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 100,
      price: 150000,
      total: 15000000,
      fees: 10,
      executedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('余额不足');
  });

  it('should fail buy trade when account does not exist', () => {
    const { executeTrade } = useAppStore.getState();
    const result = executeTrade({
      accountId: 'non-existent-id',
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 100,
      price: 1500,
      total: 150000,
      fees: 10,
      executedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('账户不存在');
  });

  it('should execute a buy trade and update existing position', () => {
    const { executeTrade } = useAppStore.getState();

    // First buy - within budget
    executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 30,
      price: 1500,
      total: 45000,
      fees: 10,
      executedAt: '2024-01-01T10:00:00.000Z',
    });

    // Second buy - should recalculate average cost
    const result = executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 30,
      price: 1700,
      total: 51000,
      fees: 10,
      executedAt: '2024-02-01T10:00:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(result.position!.quantity).toBe(60);
    expect(result.position!.avgCost).toBe(1600); // (45000 + 51000) / 60 = 1600
  });

  it('should execute a sell trade and update position', () => {
    const { executeTrade } = useAppStore.getState();

    // First buy - smaller amount to fit budget
    executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 30,
      price: 1500,
      total: 45000,
      fees: 10,
      executedAt: '2024-01-01T10:00:00.000Z',
    });

    // Sell half
    const result = executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'sell',
      quantity: 10,
      price: 1700,
      total: 17000,
      fees: 5,
      executedAt: '2024-02-01T10:00:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(result.position!.quantity).toBe(20);
  });

  it('should remove position when fully sold', () => {
    const { executeTrade, positions } = useAppStore.getState();

    executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 30,
      price: 1500,
      total: 45000,
      fees: 10,
      executedAt: '2024-01-01T10:00:00.000Z',
    });

    const sellResult = executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'sell',
      quantity: 30,
      price: 1700,
      total: 51000,
      fees: 10,
      executedAt: '2024-02-01T10:00:00.000Z',
    });

    expect(sellResult.success).toBe(true);
    expect(sellResult.position).toBeUndefined();

    const currentPositions = positions;
    expect(currentPositions.find((p) => p.symbol === '600519')).toBeUndefined();
  });

  it('should fail sell trade when position not found', () => {
    const { executeTrade } = useAppStore.getState();
    const result = executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'sell',
      quantity: 100,
      price: 1700,
      total: 170000,
      fees: 10,
      executedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('找不到对应的持仓');
  });

  it('should fail sell trade when quantity exceeds holding', () => {
    const { executeTrade } = useAppStore.getState();

    executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 50,
      price: 1500,
      total: 75000,
      fees: 10,
      executedAt: '2024-01-01T10:00:00.000Z',
    });

    const result = executeTrade({
      accountId,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'sell',
      quantity: 100,
      price: 1700,
      total: 170000,
      fees: 10,
      executedAt: '2024-02-01T10:00:00.000Z',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('持仓不足');
  });
});

describe('useAppStore - Target Allocations', () => {
  beforeEach(() => {
    const store = useAppStore.getState();
    store.setAccounts([]);
    store.setPositions([]);
    store.setSnapshots([]);
    store.setTrades([]);
    store.setTargetAllocations([]);
  });

  it('should add a target allocation', () => {
    const { addTargetAllocation } = useAppStore.getState();
    const result = addTargetAllocation({
      name: '我的配置',
      description: '我的目标资产配置',
      allocations: [
        { category: '股票', percentage: 60 },
        { category: '基金', percentage: 30 },
        { category: '现金', percentage: 10 },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('我的配置');
    expect(result.data?.allocations.length).toBe(3);
  });

  it('should update a target allocation', () => {
    const { addTargetAllocation, updateTargetAllocation } = useAppStore.getState();
    const addResult = addTargetAllocation({
      name: '原始配置',
      allocations: [{ category: '股票', percentage: 100 }],
    });

    const updateResult = updateTargetAllocation(addResult.data!.id, {
      name: '更新后的配置',
      allocations: [{ category: '股票', percentage: 50 }, { category: '基金', percentage: 50 }],
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.name).toBe('更新后的配置');
    expect(updateResult.data?.allocations.length).toBe(2);
  });

  it('should delete a target allocation', () => {
    const { addTargetAllocation, deleteTargetAllocation } = useAppStore.getState();
    const addResult = addTargetAllocation({
      name: '测试配置',
      allocations: [{ category: '股票', percentage: 100 }],
    });

    const deleteResult = deleteTargetAllocation(addResult.data!.id);
    expect(deleteResult.success).toBe(true);

    const { targetAllocations } = useAppStore.getState();
    expect(targetAllocations.length).toBe(0);
  });
});

describe('useAppStore - Bulk Operations', () => {
  it('should set all data at once', () => {
    const store = useAppStore.getState();
    store.setAccounts([]);
    store.setPositions([]);
    store.setSnapshots([]);
    store.setTrades([]);
    store.setTargetAllocations([]);

    const accounts: Account[] = [
      {
        id: 'acc-1',
        name: 'Account 1',
        type: 'securities',
        institution: 'Broker',
        currency: 'CNY',
        holder: 'User',
        balance: 50000,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      },
    ];

    const positions: Position[] = [
      {
        id: 'pos-1',
        accountId: 'acc-1',
        assetType: 'stock',
        symbol: '600519',
        name: '贵州茅台',
        quantity: 100,
        avgCost: 1500,
        currentPrice: 1600,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      },
    ];

    store.setAccounts(accounts);
    store.setPositions(positions);

    const state = useAppStore.getState();
    expect(state.accounts.length).toBe(1);
    expect(state.positions.length).toBe(1);
    expect(state.accounts[0].name).toBe('Account 1');
    expect(state.positions[0].symbol).toBe('600519');
  });
});
