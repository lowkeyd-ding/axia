import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  Account,
  Position,
  Snapshot,
  Trade,
  TargetAllocation,
  ActionResult,
  TradeExecutionResult,
  AssetType,
} from '@/types';

interface AppState {
  // State
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  trades: Trade[];
  targetAllocations: TargetAllocation[];

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

  // Target allocation actions
  addTargetAllocation: (allocation: Omit<TargetAllocation, 'id' | 'createdAt' | 'updatedAt'>) => ActionResult<TargetAllocation>;
  updateTargetAllocation: (id: string, updates: Partial<Omit<TargetAllocation, 'id' | 'createdAt'>>) => ActionResult<TargetAllocation>;
  deleteTargetAllocation: (id: string) => ActionResult<string>;

  // Bulk operations
  setAccounts: (accounts: Account[]) => void;
  setPositions: (positions: Position[]) => void;
  setSnapshots: (snapshots: Snapshot[]) => void;
  setTrades: (trades: Trade[]) => void;
  setTargetAllocations: (allocations: TargetAllocation[]) => void;
}

const now = new Date().toISOString();

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  accounts: [],
  positions: [],
  snapshots: [],
  trades: [],
  targetAllocations: [],

  // Account actions
  addAccount: (accountData) => {
    const newAccount: Account = {
      ...accountData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
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
      updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
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
      updatedAt: now,
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
      createdAt: now,
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
      createdAt: now,
    };
    set((state) => ({
      trades: [...state.trades, newTrade].sort(
        (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
      ),
    }));
    return { success: true, data: newTrade };
  },

  executeTrade: (tradeData) => {
    const { accounts, positions, addTrade, updatePosition, addPosition, updateAccount } = get();

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
      createdAt: now,
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
            ? { ...a, balance: a.balance - totalCost, updatedAt: now }
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
          const newQuantity = existingPosition.quantity + tradeData.quantity;
          const newTotalCost = (existingPosition.avgCost * existingPosition.quantity) + tradeData.total;
          const newAvgCost = newTotalCost / newQuantity;
          const newCurrentPrice = tradeData.price; // Use trade price as current

          const updated = {
            ...existingPosition,
            quantity: newQuantity,
            avgCost: newAvgCost,
            currentPrice: newCurrentPrice,
            updatedAt: now,
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
            quantity: tradeData.quantity,
            avgCost: tradeData.price,
            currentPrice: tradeData.price,
            createdAt: now,
            updatedAt: now,
          };
          newPositions.push(newPos);
          updatedPosition = newPos;
        }
      } else {
        // Sell: Add to account balance
        const proceeds = tradeData.total - tradeData.fees;
        newAccounts = newAccounts.map((a) =>
          a.id === tradeData.accountId
            ? { ...a, balance: a.balance + proceeds, updatedAt: now }
            : a
        );
        updatedBalance = currentAccount.balance + proceeds;

        // Find and update position
        const existingPosition = state.positions.find(
          (p) => p.accountId === tradeData.accountId &&
                 p.symbol === tradeData.symbol &&
                 p.assetType === tradeData.assetType
        );

        if (existingPosition) {
          const newQuantity = existingPosition.quantity - tradeData.quantity;

          if (newQuantity <= 0) {
            // Remove position if fully sold
            newPositions = newPositions.filter((p) => p.id !== existingPosition.id);
            updatedPosition = undefined;
          } else {
            // Update position
            const updated = {
              ...existingPosition,
              quantity: newQuantity,
              updatedAt: now,
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

  // Target allocation actions
  addTargetAllocation: (allocationData) => {
    const newAllocation: TargetAllocation = {
      ...allocationData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
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
      updatedAt: now,
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
  setTargetAllocations: (targetAllocations) => set({ targetAllocations }),
}));
