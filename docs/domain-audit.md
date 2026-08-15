# AXIA 资产账本模型审计

项目目录：`/Users/lowkeyd/jia-di`

## 1. 当前实体关系图

```text
Account ─┬─< Position ─┬─< Lot
         │             └─< PriceSnapshot / price observation (现有为独立价格数据)
         ├─< Trade
         ├─< Transfer
         └─< Snapshot

Trade / Transfer / Position / PriceSnapshot ──> 绩效计算 / 快照计算 / 首页展示
```

### 当前主要写入入口
- `addAccount`, `updateAccount`, `deleteAccount`
- `addPosition`, `updatePosition`, `deletePosition`
- `addTrade`, `updateTrade`, `deleteTrade`, `executeTrade`
- `addTransfer`, `deleteTransfer`
- `addSnapshot`, `updateSnapshot`, `deleteSnapshot`
- `addLot`, `addPriceSnapshot`
- `setAccounts`, `setPositions`, `setSnapshots`, `setTrades`, `setTransfers`
- `importData`
- `resolveSyncConflict`
- 云同步 `syncToCloud` / `loadFromCloud`

## 2. 事实 / 派生 / 缓存分类

### 2.1 事实数据
这些数据应尽量视作账本事实，原则上只追加、少改写：
- `Account` 的原始账户余额变更
- `Trade`
- `Transfer`
- `Lot`
- `PriceSnapshot` / 历史价格观测
- `Snapshot`（更适合定义成“估值事实记录”或“估值缓存快照”，目前混合了事实和派生）

### 2.2 派生数据
这些数据应该从事实重新推导：
- 当前持仓数量
- 平均成本
- 已实现盈亏 / 未实现盈亏
- 当前账户可用现金
- 当前总资产
- 月度 / 年度 / 当日收益
- 资产配置比例
- 快照中的 `totalChange`、`dailyChange`、`positionValues`

### 2.3 缓存 / 兼容层
这些字段当前更像兼容性缓存，不应再作为主数据源：
- `Position.dailyBasePrice`
- `Position.monthlyBasePrice`
- `Position.yearlyBasePrice`
- `Position.dailyBaseDate`
- `Position.monthlyBaseMonth`
- `Position.yearlyBaseYear`
- 页面内临时计算结果
- 通过当前价格拼出来的快照展示数据

## 3. 可能造成重复记账、漏记账、无法回滚、无法复算的路径

### 3.1 重复记账
- `executeTrade` 已经同时更新 `accounts / positions / lots / trades`
- 后续又调用 `addTrade` 或手工修改 `Position`
- 云同步全量覆盖导致同一事实被再次导入

### 3.2 漏记账
- 删除交易时只删除 `Trade` 数组项，没有反向恢复账户余额、持仓和 lot
- 删除转账时只删除记录，没有恢复对应余额
- 编辑交易时直接覆盖原对象，没有撤销旧影响

### 3.3 无法回滚
- `deleteTrade` 目前不撤销 `executeTrade` 带来的余额 / 持仓变化
- `deleteTransfer` 目前只做余额反向，但没有统一事件回滚语义
- `updatePosition` 直接改数量、成本、基准字段，无法从事实重放恢复

### 3.4 无法复算
- 绩效计算同时依赖当前价、历史基准、快照、交易和转账，来源混合
- 月末快照会用当前持仓和历史兜底价格拼出历史结果
- `Position` 里的基准字段会被旧逻辑覆盖，导致月 / 年收益口径漂移

## 4. 风险点清单

### 4.1 账户余额如何变化
- 买入：`executeTrade` 直接扣减 `Account.balance`
- 卖出：`executeTrade` 直接增加 `Account.balance`
- 转账：`addTransfer` / `deleteTransfer` 直接改余额
- 手工账户修改：`updateAccount` 可直接改余额

### 4.2 持仓数量与成本如何变化
- 买入：`executeTrade` 直接增加持仓并重算均价
- 卖出：`executeTrade` 直接减少持仓并更新 lots
- 手工持仓修改：`updatePosition` 可直接改数量、成本、当前价

### 4.3 快照到底是什么
- 目前既像事实记录，也像派生缓存
- 它会存 totalValue / cash / investments / allocations / positionValues
- 但其中不少值来自当前状态拼装，而非同一时点的账本重放

### 4.4 当前价格、历史价格、成本价格、基准价格分别存在哪里
- 当前价格：`Position.currentPrice`
- 成本价格：`Position.avgCost`
- 历史价格：`PriceSnapshot` 与临时历史行情接口结果
- 基准价格：`Position.dailyBasePrice` / `monthlyBasePrice` / `yearlyBasePrice`

### 4.5 云同步覆盖粒度
- 当前是全量 JSON 覆盖
- 同步冲突主要靠 `_hasUnsyncedChanges` 与 `_lastCloudUpdatedAt` 侦测
- 没有 revision 级别的增量审计

### 4.6 金额 / 数量 / 汇率 / 日期精度与时区
- 目前大量地方仍然直接使用 `number`
- 金额和数量都存在四舍五入分散实现
- 业务日依赖 `Asia/Shanghai`
- UTC 主要用于事件和时间戳，但页面中仍混用本地时间与 ISO 截断

## 5. 建议的目标模型

### 5.1 事实层
- 不可变经济事件
- 价格观测
- 汇率观测
- 原始账户初始化 / 调整事实

### 5.2 投影层
- 账户余额投影
- 持仓投影
- lot 投影
- 快照投影
- 绩效投影

### 5.3 展示层
- 首页、快照页、持仓页只读投影结果

### 5.4 兼容层
- 当前 `Account / Position / Trade / Transfer / Snapshot` 结构先并行保留
- 旧基准字段逐步降级为兼容字段，不再作为收益主输入

## 6. 从当前模型迁移到目标模型的最小步骤

1. 引入统一值对象层：金额、数量、业务日、币种。
2. 引入不可变经济事件模型，先只做写入适配，不改 UI。
3. 建立组合投影引擎，统一推导账户、持仓、lot 和收益。
4. 建立价格观测层，把历史价格从“当前价覆盖历史”改为“追加观测”。
5. 将月末快照改为投影结果的保存，不再直接拼当前状态。
6. 将云同步从全量覆盖升级为带 revision 的版本化同步。
7. 最后再重构首页和策略层。

## 7. 已知不一致风险（已锁定测试）

### 风险：删除交易不会回滚账户余额和持仓
当前 `deleteTrade` 只移除交易记录，不会恢复 `executeTrade` 带来的余额、持仓和 lot 变化。

这意味着：
- 交易记录删掉了
- 账本影响还留着
- 历史无法从事实重放一致恢复

该风险已通过失败测试锁定，后续需要单独修复。
