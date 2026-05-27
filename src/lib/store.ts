import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  Account,
  Position,
  Snapshot,
  Trade,
  Transfer,
  TargetAllocation,
  ActionResult,
  TradeExecutionResult,
} from '@/types';
import { syncToCloud, loadFromCloud } from './sync';

// Debounce timer for syncing
let syncTimer: NodeJS.Timeout | null = null;

// Round to 4 decimal places to avoid floating point errors
function roundQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// Round to 2 decimal places for currency
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

interface AppState {
  // State
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  trades: Trade[];
  transfers: Transfer[];
  targetAllocations: TargetAllocation[];

  // Sync state
  _hasLoadedFromCloud: boolean;
  _lastSyncedAt: string | null;

  // Account actions
  addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => ActionResult<Account>;
  updateAccount: (id: string, updates: Partial<Omit<Account, 'id' | 'createdAt'>>) => ActionResult<Account>;
  deleteAccount: (id: string) => ActionResult<string>;

  // Position actions
  addPosition: (position: Omit<Position, 'id' | 'createdAt' | 'updatedAt'>) => ActionResult<Position>;
  updatePosition: (id: string, updates: Partial<Omit<Position, 'id' | 'createdAt'>>) => ActionResult<Position>;
  deletePosition: (id: string) => ActionResult<string>;

  // Snapshot actions
  addSnapshot: (snapshot: Omit<Snapshot, 'id' | 'createdAt'>) => ActionResult<Snapshot>;
  updateSnapshot: (id: string, updates: Partial<Omit<Snapshot, 'id' | 'createdAt'>>) => ActionResult<Snapshot>;
  deleteSnapshot: (id: string) => ActionResult<string>;

  // Trade actions
  addTrade: (trade: Omit<Trade, 'id' | 'createdAt'>) => ActionResult<Trade>;
  updateTrade: (id: string, updates: Partial<Omit<Trade, 'id' | 'createdAt'>>) => ActionResult<Trade>;
  deleteTrade: (id: string) => ActionResult<string>;
  executeTrade: (trade: Omit<Trade, 'id' | 'createdAt'>) => TradeExecutionResult;

  // Transfer actions (资金转入转出)
  addTransfer: (transfer: Omit<Transfer, 'id' | 'createdAt'>) => ActionResult<Transfer>;
  deleteTransfer: (id: string) => ActionResult<string>;

  // Target allocation actions
  addTargetAllocation: (allocation: Omit<TargetAllocation, 'id' | 'createdAt' | 'updatedAt'>) => ActionResult<TargetAllocation>;
  updateTargetAllocation: (id: string, updates: Partial<Omit<TargetAllocation, 'id' | 'createdAt'>>) => ActionResult<TargetAllocation>;
  deleteTargetAllocation: (id: string) => ActionResult<string>;

  // Bulk operations
  setAccounts: (accounts: Account[]) => void;
  setPositions: (positions: Position[]) => void;
  setSnapshots: (snapshots: Snapshot[]) => void;
  setTrades: (trades: Trade[]) => void;
  setTransfers: (transfers: Transfer[]) => void;
  setTargetAllocations: (allocations: TargetAllocation[]) => void;

  // Data export/import
  exportData: () => string;
  importData: (jsonString: string) => { success: boolean; message: string };

  // Cloud sync
  syncToCloud: () => Promise<boolean>;
  forceSyncNow: () => Promise<boolean>;
  loadFromCloud: () => Promise<boolean>;
}

const getNow = () => new Date().toISOString();

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  // Initial state
  accounts: [],
  positions: [],
  snapshots: [],
  trades: [],
  transfers: [],
  targetAllocations: [],
  _hasLoadedFromCloud: false,
  _lastSyncedAt: null,

  // Cloud sync
  syncToCloud: async () => {
    const state = get();
    const data = {
      accounts: state.accounts,
      positions: state.positions,
      snapshots: state.snapshots,
      trades: state.trades,
      transfers: state.transfers,
      targetAllocations: state.targetAllocations,
    };
    
    // Debounce sync - wait 1 second after last change
    if (syncTimer) {
      clearTimeout(syncTimer);
    }
    
    return new Promise((resolve) => {
      syncTimer = setTimeout(async () => {
        const success = await syncToCloud(data);
        if (success) {
          set({ _lastSyncedAt: new Date().toISOString() });
        }
        resolve(success);
      }, 1000);
    });
  },

  // Force sync immediately (no debounce)
  forceSyncNow: async () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    const state = get();
    const data = {
      accounts: state.accounts,
      positions: state.positions,
      snapshots: state.snapshots,
      trades: state.trades,
      transfers: state.transfers,
      targetAllocations: state.targetAllocations,
    };
    const success = await syncToCloud(data);
    if (success) {
      set({ _lastSyncedAt: new Date().toISOString() });
    }
    return success;
  },

  loadFromCloud: async () => {
    const cloudData = await loadFromCloud();
    if (cloudData) {
      set({
        accounts: cloudData.accounts || [],
        positions: cloudData.positions || [],
        snapshots: cloudData.snapshots || [],
        trades: cloudData.trades || [],
        transfers: cloudData.transfers || [],
        targetAllocations: cloudData.targetAllocations || [],
        _hasLoadedFromCloud: true,
        _lastSyncedAt: new Date().toISOString(),
      });
      return true;
    }
    set({ _hasLoadedFromCloud: true });
    return false;
  },

  // Account actions
  addAccount: (accountData) => {
    const newAccount: Account = {
      ...accountData,
      id: uuidv4(),
      createdAt: getNow(),
      updatedAt: getNow(),
    };
    set((state) => ({
      accounts: [...state.accounts, newAccount],
    }));
    return { success: true, data: newAccount };
  },

  updateAccount: (id, updates) => {
    const account = get().accounts.find((a) => a.id === id);
    if (!account) {
      return { success: false, error: `Account with id ${id} not found` };
    }
    const updatedAccount: Account = {
      ...account,
      ...updates,
      updatedAt: getNow(),
    };
    set((state) => ({
      accounts: state.accounts.map((a) => (a.id === id ? updatedAccount : a)),
    }));
    return { success: true, data: updatedAccount };
  },

  deleteAccount: (id) => {
    const exists = get().accounts.some((a) => a.id === id);
    if (!exists) {
      return { success: false, error: `Account with id ${id} not found` };
    }
    set((state) => ({
      accounts: state.accounts.filter((a) => a.id !== id),
      positions: state.positions.filter((p) => p.accountId !== id),
      trades: state.trades.filter((t) => t.accountId !== id),
    }));
    return { success: true, data: id };
  },

  // Position actions
  addPosition: (positionData) => {
    const newPosition: Position = {
      ...positionData,
      id: uuidv4(),
      createdAt: getNow(),
      updatedAt: getNow(),
    };
    set((state) => ({
      positions: [...state.positions, newPosition],
    }));
    return { success: true, data: newPosition };
  },

  updatePosition: (id, updates) => {
    const position = get().positions.find((p) => p.id === id);
    if (!position) {
      return { success: false, error: `Position with id ${id} not found` };
    }
    const updatedPosition: Position = {
      ...position,
      ...updates,
      updatedAt: getNow(),
    };
    set((state) => ({
      positions: state.positions.map((p) => (p.id === id ? updatedPosition : p)),
    }));
    return { success: true, data: updatedPosition };
  },

  deletePosition: (id) => {
    const exists = get().positions.some((p) => p.id === id);
    if (!exists) {
      return { success: false, error: `Position with id ${id} not found` };
    }
    set((state) => ({
      positions: state.positions.filter((p) => p.id !== id),
    }));
    return { success: true, data: id };
  },

  // Snapshot actions
  addSnapshot: (snapshotData) => {
    const newSnapshot: Snapshot = {
      ...snapshotData,
      id: uuidv4(),
      createdAt: getNow(),
    };
    set((state) => ({
      snapshots: [...state.snapshots, newSnapshot].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    }));
    return { success: true, data: newSnapshot };
  },

  updateSnapshot: (id, updates) => {
    const snapshot = get().snapshots.find((s) => s.id === id);
    if (!snapshot) {
      return { success: false, error: `Snapshot with id ${id} not found` };
    }
    const updatedSnapshot: Snapshot = {
      ...snapshot,
      ...updates,
    };
    set((state) => ({
      snapshots: state.snapshots
        .map((s) => (s.id === id ? updatedSnapshot : s))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }));
    return { success: true, data: updatedSnapshot };
  },

  deleteSnapshot: (id) => {
    const exists = get().snapshots.some((s) => s.id === id);
    if (!exists) {
      return { success: false, error: `Snapshot with id ${id} not found` };
    }
    set((state) => ({
      snapshots: state.snapshots.filter((s) => s.id !== id),
    }));
    return { success: true, data: id };
  },

  // Trade actions
  addTrade: (tradeData) => {
    const newTrade: Trade = {
      ...tradeData,
      id: uuidv4(),
      createdAt: getNow(),
    };
    set((state) => ({
      trades: [...state.trades, newTrade].sort(
        (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
      ),
    }));
    return { success: true, data: newTrade };
  },

  executeTrade: (tradeData) => {
    const { accounts, positions } = get();

    // Get account
    const account = accounts.find((a) => a.id === tradeData.accountId);
    if (!account) {
      return { success: false, error: '账户不存在' };
    }

    const totalCost = tradeData.total + tradeData.fees;

    // Check balance for buy orders
    if (tradeData.type === 'buy') {
      if (account.balance < totalCost) {
        return { success: false, error: `余额不足，当前余额 ${account.balance.toFixed(2)} ${account.currency}，需要 ${totalCost.toFixed(2)} ${account.currency}` };
      }
    } else {
      // For sell, check if position has enough quantity
      const position = positions.find(
        (p) => p.accountId === tradeData.accountId &&
               p.symbol === tradeData.symbol &&
               p.assetType === tradeData.assetType
      );
      if (!position) {
        return { success: false, error: '找不到对应的持仓' };
      }
      if (position.quantity < tradeData.quantity) {
        return { success: false, error: `持仓不足，当前持有 ${position.quantity}，需要卖出 ${tradeData.quantity}` };
      }
    }

    // Create the trade
    const newTrade: Trade = {
      ...tradeData,
      id: uuidv4(),
      createdAt: getNow(),
    };

    let updatedPosition: Position | undefined;
    let updatedBalance = account.balance;

    // Update position and account balance
    set((state) => {
      const currentAccount = state.accounts.find((a) => a.id === tradeData.accountId);
      if (!currentAccount) return state;

      let newPositions = [...state.positions];
      let newAccounts = [...state.accounts];
      const newTrades = [...state.trades, newTrade].sort(
        (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
      );

      if (tradeData.type === 'buy') {
        // Deduct from account balance
        newAccounts = newAccounts.map((a) =>
          a.id === tradeData.accountId
            ? { ...a, balance: a.balance - totalCost, updatedAt: getNow() }
            : a
        );
        updatedBalance = currentAccount.balance - totalCost;

        // Find existing position or create new one
        const existingPosition = state.positions.find(
          (p) => p.accountId === tradeData.accountId &&
                 p.symbol === tradeData.symbol &&
                 p.assetType === tradeData.assetType
        );

        if (existingPosition) {
          // Update position: recalculate average cost
          const newQuantity = roundQuantity(existingPosition.quantity + tradeData.quantity);
          const newTotalCost = roundCurrency((existingPosition.avgCost * existingPosition.quantity) + tradeData.total);
          const newAvgCost = roundCurrency(newTotalCost / newQuantity);
          const newCurrentPrice = roundCurrency(tradeData.price); // Use trade price as current

          const updated = {
            ...existingPosition,
            quantity: newQuantity,
            avgCost: newAvgCost,
            currentPrice: newCurrentPrice,
            updatedAt: getNow(),
          };
          newPositions = newPositions.map((p) =>
            p.id === existingPosition.id ? updated : p
          );
          updatedPosition = updated;
        } else {
          // Create new position
          const newPos: Position = {
            id: uuidv4(),
            accountId: tradeData.accountId,
            assetType: tradeData.assetType,
            symbol: tradeData.symbol,
            name: tradeData.name,
            quantity: roundQuantity(tradeData.quantity),
            avgCost: roundCurrency(tradeData.price),
            currentPrice: roundCurrency(tradeData.price),
            createdAt: getNow(),
            updatedAt: getNow(),
          };
          newPositions.push(newPos);
          updatedPosition = newPos;
        }
      } else {
        // Sell: Add to account balance
        const proceeds = roundCurrency(tradeData.total - tradeData.fees);
        newAccounts = newAccounts.map((a) =>
          a.id === tradeData.accountId
            ? { ...a, balance: roundCurrency(a.balance + proceeds), updatedAt: getNow() }
            : a
        );
        updatedBalance = roundCurrency(currentAccount.balance + proceeds);

        // Find and update position
        const existingPosition = state.positions.find(
          (p) => p.accountId === tradeData.accountId &&
                 p.symbol === tradeData.symbol &&
                 p.assetType === tradeData.assetType
        );

        if (existingPosition) {
          const newQuantity = roundQuantity(existingPosition.quantity - tradeData.quantity);

          if (newQuantity <= 0) {
            // Remove position if fully sold
            newPositions = newPositions.filter((p) => p.id !== existingPosition.id);
            updatedPosition = undefined;
          } else {
            // Update position
            const updated = {
              ...existingPosition,
              quantity: newQuantity,
              updatedAt: getNow(),
            };
            newPositions = newPositions.map((p) =>
              p.id === existingPosition.id ? updated : p
            );
            updatedPosition = updated;
          }
        }
      }

      return {
        positions: newPositions,
        accounts: newAccounts,
        trades: newTrades,
      };
    });

    return {
      success: true,
      trade: newTrade,
      position: updatedPosition,
      accountBalance: updatedBalance,
    };
  },

  updateTrade: (id, updates) => {
    const trade = get().trades.find((t) => t.id === id);
    if (!trade) {
      return { success: false, error: `Trade with id ${id} not found` };
    }
    const updatedTrade: Trade = {
      ...trade,
      ...updates,
    };
    set((state) => ({
      trades: state.trades
        .map((t) => (t.id === id ? updatedTrade : t))
        .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()),
    }));
    return { success: true, data: updatedTrade };
  },

  deleteTrade: (id) => {
    const exists = get().trades.some((t) => t.id === id);
    if (!exists) {
      return { success: false, error: `Trade with id ${id} not found` };
    }
    set((state) => ({
      trades: state.trades.filter((t) => t.id !== id),
    }));
    return { success: true, data: id };
  },

  // Transfer actions (资金转入转出)
  addTransfer: (transferData) => {
    const { fromAccountId, toAccountId, amount } = transferData;

    // Validate system accounts exist
    const fromAccount = fromAccountId !== 'external'
      ? get().accounts.find((a) => a.id === fromAccountId)
      : null;
    const toAccount = toAccountId !== 'external'
      ? get().accounts.find((a) => a.id === toAccountId)
      : null;

    // 内部转账：两个都是系统账户
    if (fromAccountId !== 'external' && toAccountId !== 'external') {
      if (!fromAccount) {
        return { success: false, error: '转出账户不存在' };
      }
      if (!toAccount) {
        return { success: false, error: '转入账户不存在' };
      }
      if (fromAccountId === toAccountId) {
        return { success: false, error: '转出和转入账户不能相同' };
      }
      if (fromAccount.balance < amount) {
        return { success: false, error: `余额不足，当前余额 ${fromAccount.balance.toFixed(2)} ${fromAccount.currency}` };
      }
    }

    // 向外部转出：fromAccount 是系统账户
    if (fromAccountId !== 'external' && toAccountId === 'external') {
      if (!fromAccount) {
        return { success: false, error: '转出账户不存在' };
      }
      if (fromAccount.balance < amount) {
        return { success: false, error: `余额不足，当前余额 ${fromAccount.balance.toFixed(2)} ${fromAccount.currency}` };
      }
    }

    // 从外部转入：toAccount 是系统账户
    if (fromAccountId === 'external' && toAccountId !== 'external') {
      if (!toAccount) {
        return { success: false, error: '转入账户不存在' };
      }
    }

    if (amount <= 0) {
      return { success: false, error: '金额必须大于0' };
    }

    // Create transfer record
    const newTransfer: Transfer = {
      ...transferData,
      id: uuidv4(),
      createdAt: getNow(),
    };

    // Update balances - only update system accounts
    set((state) => ({
      transfers: [...state.transfers, newTransfer],
      accounts: state.accounts.map((a) => {
        // 向外部转出：减少转出账户余额
        if (fromAccountId !== 'external' && a.id === fromAccountId) {
          return { ...a, balance: roundCurrency(a.balance - amount), updatedAt: getNow() };
        }
        // 从外部转入：增加转入账户余额
        if (toAccountId !== 'external' && a.id === toAccountId) {
          return { ...a, balance: roundCurrency(a.balance + amount), updatedAt: getNow() };
        }
        return a;
      }),
    }));

    return { success: true, data: newTransfer };
  },

  deleteTransfer: (id) => {
    const transfer = get().transfers.find((t) => t.id === id);
    if (!transfer) {
      return { success: false, error: '转账记录不存在' };
    }

    // Reverse the transfer - only update system accounts
    set((state) => ({
      transfers: state.transfers.filter((t) => t.id !== id),
      accounts: state.accounts.map((a) => {
        // 向外部转出的反向：增加原转出账户余额
        if (transfer.fromAccountId !== 'external' && a.id === transfer.fromAccountId) {
          return { ...a, balance: roundCurrency(a.balance + transfer.amount), updatedAt: getNow() };
        }
        // 从外部转入的反向：减少原转入账户余额
        if (transfer.toAccountId !== 'external' && a.id === transfer.toAccountId) {
          return { ...a, balance: roundCurrency(a.balance - transfer.amount), updatedAt: getNow() };
        }
        return a;
      }),
    }));

    return { success: true, data: id };
  },

  // Target allocation actions
  addTargetAllocation: (allocationData) => {
    const newAllocation: TargetAllocation = {
      ...allocationData,
      id: uuidv4(),
      createdAt: getNow(),
      updatedAt: getNow(),
    };
    set((state) => ({
      targetAllocations: [...state.targetAllocations, newAllocation],
    }));
    return { success: true, data: newAllocation };
  },

  updateTargetAllocation: (id, updates) => {
    const allocation = get().targetAllocations.find((a) => a.id === id);
    if (!allocation) {
      return { success: false, error: `Target allocation with id ${id} not found` };
    }
    const updatedAllocation: TargetAllocation = {
      ...allocation,
      ...updates,
      updatedAt: getNow(),
    };
    set((state) => ({
      targetAllocations: state.targetAllocations.map((a) =>
        a.id === id ? updatedAllocation : a
      ),
    }));
    return { success: true, data: updatedAllocation };
  },

  deleteTargetAllocation: (id) => {
    const exists = get().targetAllocations.some((a) => a.id === id);
    if (!exists) {
      return { success: false, error: `Target allocation with id ${id} not found` };
    }
    set((state) => ({
      targetAllocations: state.targetAllocations.filter((a) => a.id !== id),
    }));
    return { success: true, data: id };
  },

  // Bulk operations
  setAccounts: (accounts) => set({ accounts }),
  setPositions: (positions) => set({ positions }),
  setSnapshots: (snapshots) =>
    set({
      snapshots: [...snapshots].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    }),
  setTrades: (trades) =>
    set({
      trades: [...trades].sort(
        (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
      ),
    }),
  setTransfers: (transfers) =>
    set({
      transfers: [...transfers].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    }),
  setTargetAllocations: (targetAllocations) => set({ targetAllocations }),

  // Data export - returns all data as JSON string
  exportData: () => {
    const state = get();
    const exportObj = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        accounts: state.accounts,
        positions: state.positions,
        snapshots: state.snapshots,
        trades: state.trades,
        transfers: state.transfers,
        targetAllocations: state.targetAllocations,
      },
    };
    return JSON.stringify(exportObj, null, 2);
  },

  // Data import - replaces all data with imported JSON
  importData: (jsonString: string): { success: boolean; message: string } => {
    try {
      const parsed = JSON.parse(jsonString);
      
      // Validate structure
      if (!parsed.data || typeof parsed.data !== 'object') {
        return { success: false, message: '无效的数据格式' };
      }

      const { accounts = [], positions = [], snapshots = [], trades = [], targetAllocations = [] } = parsed.data;

      // Validate arrays
      if (!Array.isArray(accounts) || !Array.isArray(positions) || 
          !Array.isArray(snapshots) || !Array.isArray(trades)) {
        return { success: false, message: '数据格式错误：缺少必需字段' };
      }

      // Import data
      set({
        accounts,
        positions,
        snapshots: [...snapshots].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
        trades: [...trades].sort(
          (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
        ),
        targetAllocations,
      });

      return { 
        success: true, 
        message: `成功导入：${accounts.length} 个账户，${positions.length} 笔持仓，${snapshots.length} 个快照，${trades.length} 笔交易` 
      };
    } catch (error) {
      return { success: false, message: 'JSON 解析失败，请检查文件格式' };
    }
  },
}),
    {
      name: 'axia-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accounts: state.accounts,
        positions: state.positions,
        snapshots: state.snapshots,
        trades: state.trades,
        transfers: state.transfers,
        targetAllocations: state.targetAllocations,
        _hasLoadedFromCloud: state._hasLoadedFromCloud,
        _lastSyncedAt: state._lastSyncedAt,
      }),
      onRehydrateStorage: () => (state) => {
        // 数据从 localStorage 恢复后，尝试从云端同步
        if (state && !state._hasLoadedFromCloud) {
          // 避免无限循环 - 仅在没有从云端加载过数据时加载
        }
      },
    }
  )
);

// 延迟加载云端数据（避免 SSR 问题）
let cloudInitPromise: Promise<void> | null = null;

export function initializeCloudSync() {
  if (typeof window === 'undefined') return;
  if (cloudInitPromise) return cloudInitPromise;

  cloudInitPromise = (async () => {
    const store = useAppStore.getState();
    if (!store._hasLoadedFromCloud) {
      await store.loadFromCloud();
    }
  })();

  return cloudInitPromise;
}
