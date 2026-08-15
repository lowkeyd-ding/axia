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
  PriceSnapshot,
  ActionResult,
  TradeExecutionResult,
  Lot,
} from '@/types';
import { syncToCloud as cloudSyncToCloud, loadFromCloud as cloudLoadFromCloud } from './sync';
import { getBusinessDate, getBusinessMonth, getBusinessYear } from './businessDate';
import type { EconomicEvent } from '@/lib/domain/events';
import { applyEvent, EMPTY_PROJECTION_STATE } from '@/lib/domain/events';
import { createMoney } from '@/lib/domain/money';
import { createQuantity } from '@/lib/domain/quantity';

// Debounce timer for syncing - 移入 store 内部以便更好地管理
let syncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 清理同步定时器
 * 在组件卸载或页面切换时调用，防止内存泄漏
 */
export function clearSyncTimer() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

// 加载云端数据并更新 store
async function loadFromCloudData(state: Partial<AppState>) {
  console.log('[CloudSync] Attempting to load from cloud...');
  try {
    const cloudData = await cloudLoadFromCloud();
    if (cloudData) {
      const local = useAppStore.getState();
      const cloudChanged = Boolean(cloudData.updatedAt && local._lastCloudUpdatedAt && cloudData.updatedAt !== local._lastCloudUpdatedAt);
      if (local._hasUnsyncedChanges && cloudChanged) {
        useAppStore.setState({ _syncStatus: 'conflict', _syncError: '云端和本地都有新改动，请选择保留版本。', _pendingCloudData: cloudData.data, _pendingCloudUpdatedAt: cloudData.updatedAt });
        return;
      }
      console.log('[CloudSync] Found cloud data, updating store');
      const payload = cloudData.data;
      useAppStore.setState({
        accounts: payload.accounts || [], positions: payload.positions || [], snapshots: payload.snapshots || [], trades: payload.trades || [],
        transfers: payload.transfers || [], targetAllocations: payload.targetAllocations || [], lots: payload.lots || [], priceSnapshots: payload.priceSnapshots || [], economicEvents: payload.economicEvents || [],
        _lastSyncedAt: new Date().toISOString(), _lastCloudUpdatedAt: cloudData.updatedAt,
        _hasUnsyncedChanges: false, _syncStatus: 'synced', _syncError: null,
      });
      // Migration: backfill lots for positions loaded from cloud that have no lots
      setTimeout(() => {
        const state = useAppStore.getState();
        const existingLotPositionIds = new Set(state.lots.map((l) => l.positionId));
        const positionsWithoutLots = state.positions.filter(
          (p) => !existingLotPositionIds.has(p.id)
        );
        if (positionsWithoutLots.length > 0) {
          const now = getNow();
          const newLots: Lot[] = positionsWithoutLots.map((p) => ({
            id: uuidv4(),
            positionId: p.id,
            quantity: p.quantity,
            remainingQuantity: p.quantity,
            price: p.avgCost,
            fees: 0,
            executedAt: p.buyDate ? new Date(p.buyDate).toISOString() : p.createdAt,
            createdAt: now,
          }));
          console.log(`[Migration] Backfilling ${newLots.length} lots for cloud-loaded positions`);
          useAppStore.setState((s) => ({ lots: [...s.lots, ...newLots] }));
        }
      }, 0);
    } else {
      console.log('[CloudSync] No cloud data found, keeping local data');
    }
  } catch (error) {
    console.error('[CloudSync] Error loading from cloud:', error);
  }
}

// Round to 4 decimal places for quantity and price
function roundQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// Round to 4 decimal places for price (especially for funds)
function roundPrice(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// Round to 2 decimal places for currency
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

// Snapshot helpers — check if date boundaries have changed
function todayDate(): string {
  return getBusinessDate();
}
function todayMonth(): string {
  return getBusinessMonth();
}
function todayYear(): string {
  return getBusinessYear();
}

/**
 * @deprecated 旧基准字段写入逻辑，新域层通过事件投影推导收益，后续将移除。
 */
function captureBaseline(
  pos: Position,
  price: number,
  roundP: (v: number) => number
): Partial<Position> {
  const today = todayDate();
  const month = todayMonth();
  const year = todayYear();
  const updates: Partial<Position> = {};

  // Daily: only snapshot if we haven't already captured today's baseline
  if (pos.dailyBaseDate !== today) {
    updates.dailyBasePrice = roundP(price);
    updates.dailyBaseDate = today;
  }
  // Monthly: only snapshot if we haven't captured this month's baseline
  if (pos.monthlyBaseMonth !== month) {
    updates.monthlyBasePrice = roundP(price);
    updates.monthlyBaseMonth = month;
  }
  // Yearly: only snapshot if we haven't captured this year's baseline
  if (pos.yearlyBaseYear !== year) {
    updates.yearlyBasePrice = roundP(price);
    updates.yearlyBaseYear = year;
  }
  return updates;
}

/**
 * @deprecated 旧基准字段初始化逻辑，后续将移除。
 */
function initBaselineFields(pos: Position, price: number, roundP: (v: number) => number): Partial<Position> {
  const today = todayDate();
  const month = todayMonth();
  const year = todayYear();
  const updates: Partial<Position> = {};

  if (pos.dailyBasePrice === undefined) {
    updates.dailyBasePrice = roundP(price);
    updates.dailyBaseDate = today;
  }
  if (pos.monthlyBasePrice === undefined) {
    updates.monthlyBasePrice = roundP(price);
    updates.monthlyBaseMonth = month;
  }
  if (pos.yearlyBasePrice === undefined) {
    updates.yearlyBasePrice = roundP(price);
    updates.yearlyBaseYear = year;
  }
  return updates;
}

// 延迟同步到云端（防抖）
async function scheduleCloudSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(async () => {
    const state = useAppStore.getState();
    const data = {
      accounts: state.accounts,
      positions: state.positions,
      snapshots: state.snapshots,
      trades: state.trades,
      transfers: state.transfers,
      targetAllocations: state.targetAllocations,
      lots: state.lots,
      priceSnapshots: state.priceSnapshots,
      economicEvents: state.economicEvents,
    };
    const success = await cloudSyncToCloud(data);
    if (success) {
      console.log('[CloudSync] Auto-synced to cloud');
    }
  }, 1000);
}

interface AppState {
  // State
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  trades: Trade[];
  transfers: Transfer[];
  targetAllocations: TargetAllocation[];
  lots: Lot[];
  priceSnapshots: PriceSnapshot[];
  economicEvents: EconomicEvent[];

  // Sync state
  _hasLoadedFromCloud: boolean;
  _lastSyncedAt: string | null;
  _lastCloudUpdatedAt: string | null;
  _hasUnsyncedChanges: boolean;
  _syncStatus: 'local' | 'syncing' | 'synced' | 'dirty' | 'error' | 'conflict';
  _syncError: string | null;
  _pendingCloudData: import('./sync').CloudSyncData | null;
  _pendingCloudUpdatedAt: string | null;
  resolveSyncConflict: (choice: 'cloud' | 'local') => Promise<boolean>;

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

  // Lot actions (per-buy-point P&L tracking)
  getLotsByPosition: (positionId: string) => Lot[];
  addLot: (lot: Omit<Lot, 'id' | 'createdAt'>) => Lot;
  addPriceSnapshot: (snapshot: Omit<PriceSnapshot, 'id' | 'createdAt'>) => PriceSnapshot;

  // Bulk operations
  setAccounts: (accounts: Account[]) => void;
  setPositions: (positions: Position[]) => void;
  setSnapshots: (snapshots: Snapshot[]) => void;
  setTrades: (trades: Trade[]) => void;
  setTransfers: (transfers: Transfer[]) => void;
  setTargetAllocations: (allocations: TargetAllocation[]) => void;

  // Clear all data (used on sign-out)
  resetAll: () => void;

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
  lots: [],
  priceSnapshots: [],
  economicEvents: [],
  _hasLoadedFromCloud: false,
  _lastSyncedAt: null,
  _lastCloudUpdatedAt: null,
  _hasUnsyncedChanges: false,
  _syncStatus: 'local',
  _syncError: null,
  _pendingCloudData: null,
  _pendingCloudUpdatedAt: null,

  resolveSyncConflict: async (choice) => {
    const state = get();
    if (choice === 'cloud' && state._pendingCloudData) {
      const d = state._pendingCloudData;
      set({ accounts: d.accounts || [], positions: d.positions || [], snapshots: d.snapshots || [], trades: d.trades || [], transfers: d.transfers || [], targetAllocations: d.targetAllocations || [], lots: d.lots || [], priceSnapshots: d.priceSnapshots || [], economicEvents: d.economicEvents || [], _hasUnsyncedChanges: false, _syncStatus: 'synced', _syncError: null, _lastCloudUpdatedAt: state._pendingCloudUpdatedAt, _pendingCloudData: null, _pendingCloudUpdatedAt: null });
      return true;
    }
    if (choice === 'local') {
      set({ _pendingCloudData: null, _pendingCloudUpdatedAt: null });
      return get().forceSyncNow();
    }
    return false;
  },

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
      lots: state.lots,
    };

    // Debounce sync - wait 1 second after last change
    if (syncTimer) {
      clearTimeout(syncTimer);
    }

    return new Promise((resolve) => {
      syncTimer = setTimeout(async () => {
        const success = await cloudSyncToCloud(data);
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
    set({ _syncStatus: 'syncing', _syncError: null });
    const state = get();
    const data = {
      accounts: state.accounts,
      positions: state.positions,
      snapshots: state.snapshots,
      trades: state.trades,
      transfers: state.transfers,
      targetAllocations: state.targetAllocations,
      lots: state.lots,
    };
    const success = await cloudSyncToCloud(data);
    if (success) {
      const now = new Date().toISOString();
      set({ _lastSyncedAt: now, _lastCloudUpdatedAt: now, _hasUnsyncedChanges: false, _syncStatus: 'synced', _syncError: null });
    } else {
      set({ _hasUnsyncedChanges: true, _syncStatus: 'error', _syncError: '同步失败，本地数据已保留，可稍后重试。' });
    }
    return success;
  },

  loadFromCloud: async () => {
    console.log('[CloudSync] Loading from cloud...');

    const cloudData = await cloudLoadFromCloud();
    if (cloudData) {
      const state = get();
      const cloudChanged = Boolean(cloudData.updatedAt && state._lastCloudUpdatedAt && cloudData.updatedAt !== state._lastCloudUpdatedAt);
      if (state._hasUnsyncedChanges && cloudChanged) {
        set({ _hasLoadedFromCloud: true, _syncStatus: 'conflict', _syncError: '云端和本地都有新改动，请选择保留版本。', _pendingCloudData: cloudData.data, _pendingCloudUpdatedAt: cloudData.updatedAt });
        return false;
      }
      const payload = cloudData.data;
      set({
        accounts: payload.accounts || [], positions: payload.positions || [], snapshots: payload.snapshots || [], trades: payload.trades || [],
        transfers: payload.transfers || [], targetAllocations: payload.targetAllocations || [], lots: payload.lots || [],
        _hasLoadedFromCloud: true, _lastSyncedAt: new Date().toISOString(), _lastCloudUpdatedAt: cloudData.updatedAt,
        _hasUnsyncedChanges: false, _syncStatus: 'synced', _syncError: null,
      });
      // Migration: backfill lots for positions loaded from cloud that have no lots
      setTimeout(() => {
        const state = useAppStore.getState();
        const existingLotPositionIds = new Set(state.lots.map((l) => l.positionId));
        const positionsWithoutLots = state.positions.filter(
          (p) => !existingLotPositionIds.has(p.id)
        );
        if (positionsWithoutLots.length > 0) {
          const now = getNow();
          const newLots: Lot[] = positionsWithoutLots.map((p) => ({
            id: uuidv4(),
            positionId: p.id,
            quantity: p.quantity,
            remainingQuantity: p.quantity,
            price: p.avgCost,
            fees: 0,
            executedAt: p.buyDate ? new Date(p.buyDate).toISOString() : p.createdAt,
            createdAt: now,
          }));
          console.log(`[Migration] Backfilling ${newLots.length} lots for cloud-loaded positions`);
          useAppStore.setState((s) => ({ lots: [...s.lots, ...newLots] }));
        }
      }, 0);
      return true;
    }
    console.log('[CloudSync] No cloud data found, keeping local data');
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
    scheduleCloudSync();
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
    scheduleCloudSync();
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
    scheduleCloudSync();
    return { success: true, data: id };
  },

  // Position actions
  addPosition: (positionData) => {
    const now = new Date();
    const date = getBusinessDate(now);
    const month = getBusinessMonth(now);
    const year = getBusinessYear(now);
    const price = roundPrice(positionData.currentPrice);
    const createdAt = getNow();
    // Use provided buyDate or fall back to today
    const buyDate = positionData.buyDate
      ? new Date(positionData.buyDate).toISOString()
      : createdAt;

    const newPosition: Position = {
      ...positionData,
      id: uuidv4(),
      quantity: roundQuantity(positionData.quantity),
      avgCost: roundPrice(positionData.avgCost),
      currentPrice: price,
      dailyBasePrice: price,
      monthlyBasePrice: price,
      yearlyBasePrice: price,
      dailyBaseDate: date,
      monthlyBaseMonth: month,
      yearlyBaseYear: year,
      createdAt,
      updatedAt: createdAt,
    };

    // Create a lot for this position (manual entry = single buy event)
    const newLot: Lot = {
      id: uuidv4(),
      positionId: newPosition.id,
      quantity: roundQuantity(positionData.quantity),
      remainingQuantity: roundQuantity(positionData.quantity),
      price: roundPrice(positionData.avgCost),
      fees: 0,
      executedAt: buyDate,
      createdAt,
    };

    set((state) => ({
      positions: [...state.positions, newPosition],
      lots: [...state.lots, newLot],
    }));
    scheduleCloudSync();
    return { success: true, data: newPosition };
  },

  updatePosition: (id, updates) => {
    const position = get().positions.find((p) => p.id === id);
    if (!position) {
      return { success: false, error: `Position with id ${id} not found` };
    }
    // Round price fields to 4 decimal places
    const roundedUpdates: Partial<Position> = {};
    if (updates.currentPrice !== undefined) {
      roundedUpdates.currentPrice = roundPrice(updates.currentPrice);
    }
    if (updates.avgCost !== undefined) {
      roundedUpdates.avgCost = roundPrice(updates.avgCost);
    }
    if (updates.quantity !== undefined) {
      roundedUpdates.quantity = roundQuantity(updates.quantity);
    }

    // A changed acquisition date invalidates period baselines captured for the old holding timeline.
    if (updates.buyDate !== undefined && updates.buyDate !== position.buyDate) {
      const today = todayDate();
      const month = todayMonth();
      const year = todayYear();
      const price = roundedUpdates.currentPrice ?? position.currentPrice;
      Object.assign(roundedUpdates, {
        dailyBasePrice: roundPrice(price),
        monthlyBasePrice: roundPrice(price),
        yearlyBasePrice: roundPrice(price),
        dailyBaseDate: today,
        monthlyBaseMonth: month,
        yearlyBaseYear: year,
      });
    }

    // Auto-capture baseline when period boundary changes; locked thereafter
    if (updates.currentPrice !== undefined) {
      const base = captureBaseline(position, updates.currentPrice, roundPrice);
      Object.assign(roundedUpdates, base);
      // Backward compat: init missing baseline fields from current price
      if (!position.dailyBasePrice) {
        const init = initBaselineFields(position, position.currentPrice, roundPrice);
        Object.assign(roundedUpdates, init);
      }
    } else if (!position.dailyBasePrice) {
      // No price update but still need to init baselines (e.g. on first refresh)
      const init = initBaselineFields(position, position.currentPrice, roundPrice);
      Object.assign(roundedUpdates, init);
    }

    const updatedPosition: Position = {
      ...position,
      ...updates,
      ...roundedUpdates,
      updatedAt: getNow(),
    };
    set((state) => ({
      positions: state.positions.map((p) => (p.id === id ? updatedPosition : p)),
    }));
    scheduleCloudSync();
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
    scheduleCloudSync();
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
    scheduleCloudSync();
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
    scheduleCloudSync();
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
    scheduleCloudSync();
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
    scheduleCloudSync();
    return { success: true, data: newTrade };
  },

  executeTrade: (tradeData) => {
    const { accounts, positions, lots } = get();

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

    // Update position, account balance, and lots
    set((state) => {
      const currentAccount = state.accounts.find((a) => a.id === tradeData.accountId);
      if (!currentAccount) return state;

      let newPositions = [...state.positions];
      let newAccounts = [...state.accounts];
      let newLots = [...state.lots];
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
          const newTotalCost = roundPrice((existingPosition.avgCost * existingPosition.quantity) + tradeData.total);
          const newAvgCost = roundPrice(newTotalCost / newQuantity);
          const newCurrentPrice = roundPrice(tradeData.price);

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

          // Create a new buy lot for this purchase
          const newLot: Lot = {
            id: uuidv4(),
            positionId: existingPosition.id,
            quantity: roundQuantity(tradeData.quantity),
            remainingQuantity: roundQuantity(tradeData.quantity),
            price: roundPrice(tradeData.price),
            fees: roundCurrency(tradeData.fees),
            executedAt: tradeData.executedAt,
            createdAt: getNow(),
          };
          newLots.push(newLot);
        } else {
          // Create new position
          const price = roundPrice(tradeData.price);
          const now = new Date();
          const newPos: Position = {
            id: uuidv4(),
            accountId: tradeData.accountId,
            assetType: tradeData.assetType,
            symbol: tradeData.symbol,
            name: tradeData.name,
            quantity: roundQuantity(tradeData.quantity),
            avgCost: price,
            currentPrice: price,
            dailyBasePrice: price,
            monthlyBasePrice: price,
            yearlyBasePrice: price,
            dailyBaseDate: getBusinessDate(now),
            monthlyBaseMonth: getBusinessMonth(now),
            yearlyBaseYear: getBusinessYear(now),
            createdAt: getNow(),
            updatedAt: getNow(),
          };
          newPositions.push(newPos);
          updatedPosition = newPos;

          // Create a new buy lot
          const newLot: Lot = {
            id: uuidv4(),
            positionId: newPos.id,
            quantity: roundQuantity(tradeData.quantity),
            remainingQuantity: roundQuantity(tradeData.quantity),
            price: roundPrice(tradeData.price),
            fees: roundCurrency(tradeData.fees),
            executedAt: tradeData.executedAt,
            createdAt: getNow(),
          };
          newLots.push(newLot);
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
          // FIFO sell: reduce lots in chronological order
          let remainingToSell = roundQuantity(tradeData.quantity);
          newLots = newLots.map((lot) => {
            if (lot.positionId !== existingPosition.id || lot.deletedAt || lot.remainingQuantity <= 0) {
              return lot;
            }
            if (remainingToSell <= 0) return lot;

            if (lot.remainingQuantity <= remainingToSell) {
              // Fully consume this lot
              remainingToSell = roundQuantity(remainingToSell - lot.remainingQuantity);
              return { ...lot, remainingQuantity: 0 };
            } else {
              // Partially consume this lot
              const soldFromThisLot = remainingToSell;
              remainingToSell = 0;
              return { ...lot, remainingQuantity: roundQuantity(lot.remainingQuantity - soldFromThisLot) };
            }
          });

          const newQuantity = roundQuantity(existingPosition.quantity - tradeData.quantity);

          if (newQuantity <= 0) {
            // Remove position if fully sold; soft-delete remaining lots
            newPositions = newPositions.filter((p) => p.id !== existingPosition.id);
            newLots = newLots.map((lot) =>
              lot.positionId === existingPosition.id && !lot.deletedAt
                ? { ...lot, remainingQuantity: 0, deletedAt: getNow() }
                : lot
            );
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
        lots: newLots,
        economicEvents: [...state.economicEvents, {
          id: newTrade.id,
          type: tradeData.type === 'buy' ? 'buy' : 'sell',
          occurredAt: tradeData.executedAt,
          businessDate: getBusinessDate(new Date(tradeData.executedAt)),
          createdAt: getNow(),
          source: 'user',
          status: 'posted',
          idempotencyKey: newTrade.id,
          accountId: tradeData.accountId,
          symbol: tradeData.symbol,
          assetType: tradeData.assetType,
          quantity: createQuantity(tradeData.quantity),
          price: createMoney(tradeData.price, { currency: 'CNY' }),
          fees: createMoney(tradeData.fees, { currency: 'CNY' }),
        } as EconomicEvent],
      };
    });

    scheduleCloudSync();

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
    scheduleCloudSync();
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
    scheduleCloudSync();
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

    scheduleCloudSync();
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

    scheduleCloudSync();
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
    scheduleCloudSync();
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
    scheduleCloudSync();
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
    scheduleCloudSync();
    return { success: true, data: id };
  },

  // Lot actions — per-buy-point P&L tracking
  getLotsByPosition: (positionId: string) => {
    return get().lots.filter(
      (l) => l.positionId === positionId && !l.deletedAt && l.remainingQuantity > 0
    );
  },

  addLot: (lotData) => {
    const newLot: Lot = {
      ...lotData,
      id: uuidv4(),
      createdAt: getNow(),
    };
    set((state) => ({
      lots: [...state.lots, newLot],
    }));
    scheduleCloudSync();
    return newLot;
  },

  addPriceSnapshot: (snapshotData) => {
    const newSnapshot: PriceSnapshot = { ...snapshotData, id: uuidv4(), createdAt: getNow() };
    set((state) => ({
      priceSnapshots: [
        ...state.priceSnapshots.filter((item) => !(item.symbol === newSnapshot.symbol && item.date === newSnapshot.date)),
        newSnapshot,
      ],
    }));
    scheduleCloudSync();
    return newSnapshot;
  },

  // Bulk operations
  setAccounts: (accounts) => {
    set({ accounts });
    scheduleCloudSync();
  },
  setPositions: (positions) => {
    set({ positions });
    scheduleCloudSync();
  },
  setSnapshots: (snapshots) => {
    set({
      snapshots: [...snapshots].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    });
    scheduleCloudSync();
  },
  setTrades: (trades) => {
    set({
      trades: [...trades].sort(
        (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
      ),
    });
    scheduleCloudSync();
  },
  setTransfers: (transfers) => {
    set({
      transfers: [...transfers].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    });
    scheduleCloudSync();
  },
  setTargetAllocations: (targetAllocations) => {
    set({ targetAllocations });
    scheduleCloudSync();
  },

  // 清空全部业务数据（登出时使用），保留 _hasLoadedFromCloud 避免触发重新拉取
  resetAll: () => {
    set({
      accounts: [],
      positions: [],
      snapshots: [],
      trades: [],
      transfers: [],
      targetAllocations: [],
      lots: [],
      priceSnapshots: [],
      economicEvents: [],
      _hasLoadedFromCloud: false,
      _lastSyncedAt: null,
    });
  },

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
        lots: state.lots,
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
        transfers: Array.isArray(parsed.data.transfers) ? parsed.data.transfers : [],
        lots: Array.isArray(parsed.data.lots) ? parsed.data.lots : [],
        targetAllocations,
        _hasUnsyncedChanges: true,
        _syncStatus: 'dirty',
        _syncError: null,
      });

      scheduleCloudSync();

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
        lots: state.lots,
        _lastSyncedAt: state._lastSyncedAt,
        _lastCloudUpdatedAt: state._lastCloudUpdatedAt,
        _hasUnsyncedChanges: state._hasUnsyncedChanges,
        _syncStatus: state._syncStatus,
        _syncError: state._syncError,
        economicEvents: state.economicEvents,
      }),
      onRehydrateStorage: () => (state) => {
        // 数据从 localStorage 恢复后，在下一个事件循环中加载云端数据
        // 这样可以确保 store 已完全初始化
        if (state && typeof window !== 'undefined') {
          setTimeout(async () => {
            console.log('[CloudSync] Loading from cloud after hydration...');
            await loadFromCloudData(state);
          }, 0);
        }
        // Migration: backfill lots for existing positions that have no lots
        if (state && typeof window !== 'undefined') {
          setTimeout(() => {
            const existingLotPositionIds = new Set(state.lots.map((l) => l.positionId));
            const positionsWithoutLots = state.positions.filter(
              (p) => !existingLotPositionIds.has(p.id)
            );
            if (positionsWithoutLots.length > 0) {
              const now = getNow();
              const newLots: Lot[] = positionsWithoutLots.map((p) => ({
                id: uuidv4(),
                positionId: p.id,
                quantity: p.quantity,
                remainingQuantity: p.quantity,
                price: p.avgCost,
                fees: 0,
                executedAt: p.buyDate ? new Date(p.buyDate).toISOString() : p.createdAt,
                createdAt: now,
              }));
              console.log(`[Migration] Backfilling ${newLots.length} lots for existing positions`);
              useAppStore.setState((s) => ({ lots: [...s.lots, ...newLots] }));
            }
          }, 0);
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
    // 等待一小段时间确保 hydration 完成
    await new Promise(resolve => setTimeout(resolve, 100));
    await loadFromCloudData(useAppStore.getState());
  })();

  return cloudInitPromise;
}
