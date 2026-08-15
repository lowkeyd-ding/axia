# 严格绩效计算公式与限制

## 指标定义

### 1. `netAssetChange`
总资产变化：

`closingValue - openingValue`

它包含：
- 资产价格变化
- 持仓变化
- 外部现金流影响

不包含：
- 事件是否完整
- 价格是否可追溯

### 2. `realizedPnL`
已实现盈亏：

当前实现为卖出事件的近似收益拆解。最终应由 lot 投影引擎提供精确值。

### 3. `unrealizedPnL`
未实现盈亏：

`closingValue - openingValue - realizedPnL`

### 4. `cashFlowAdjustedReturn`
现金流调整后回报：

`(closingValue - openingValue - externalCashFlow) / (openingValue + max(externalCashFlow, 0))`

### 5. `dataQuality`
表示结果是否完整，以及缺少哪些关键数据。

## 规则限制
- 内部转账不算外部现金流
- 买卖不算外部现金流
- 外部入金 / 取现必须按发生日期参与计算
- 缺少估值时必须显式返回不完整
- 如果现金流 / 价格历史不足，不应伪造完整收益率

## 当前实现说明
当前版本是严格口径的第一版，后续应进一步接入：
- lot 精确已实现盈亏
- 历史估值分段计算
- 更细粒度的现金流时间加权回报
