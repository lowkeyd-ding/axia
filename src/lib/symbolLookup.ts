/**
 * Symbol Lookup Service
 * Provides auto-complete for stocks, funds, and other financial instruments
 */

export interface SymbolInfo {
  symbol: string;
  name: string;
  assetType: 'stock' | 'fund' | 'bank_wealth_management' | 'bank_cash';
  exchange?: string;
}

// Mock data for demonstration - in production, this would call a real API
const STOCK_DATA: SymbolInfo[] = [
  // A shares (Shanghai & Shenzhen)
  { symbol: '000001', name: '平安银行', assetType: 'stock', exchange: 'SZ' },
  { symbol: '000002', name: '万科A', assetType: 'stock', exchange: 'SZ' },
  { symbol: '000004', name: '国华网安', assetType: 'stock', exchange: 'SZ' },
  { symbol: '000005', name: 'ST星源', assetType: 'stock', exchange: 'SZ' },
  { symbol: '000006', name: '深振业A', assetType: 'stock', exchange: 'SZ' },
  { symbol: '000007', name: '全新好', assetType: 'stock', exchange: 'SZ' },
  { symbol: '000008', name: '神州高铁', assetType: 'stock', exchange: 'SZ' },
  { symbol: '000009', name: '中国宝安', assetType: 'stock', exchange: 'SZ' },
  { symbol: '000010', name: '美丽生态', assetType: 'stock', exchange: 'SZ' },
  { symbol: '000011', name: '深物业A', assetType: 'stock', exchange: 'SZ' },
  { symbol: '600000', name: '浦发银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '600001', name: '邯郸钢铁', assetType: 'stock', exchange: 'SH' },
  { symbol: '600004', name: '白云机场', assetType: 'stock', exchange: 'SH' },
  { symbol: '600005', name: '武钢股份', assetType: 'stock', exchange: 'SH' },
  { symbol: '600006', name: '东风汽车', assetType: 'stock', exchange: 'SH' },
  { symbol: '600007', name: '中国国贸', assetType: 'stock', exchange: 'SH' },
  { symbol: '600008', name: '首创股份', assetType: 'stock', exchange: 'SH' },
  { symbol: '600009', name: '上海机场', assetType: 'stock', exchange: 'SH' },
  { symbol: '600010', name: '包钢股份', assetType: 'stock', exchange: 'SH' },
  { symbol: '600011', name: '华能国际', assetType: 'stock', exchange: 'SH' },
  { symbol: '600012', name: '皖通高速', assetType: 'stock', exchange: 'SH' },
  { symbol: '600015', name: '华夏银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '600016', name: '民生银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '600018', name: '上港集团', assetType: 'stock', exchange: 'SH' },
  { symbol: '600019', name: '宝钢股份', assetType: 'stock', exchange: 'SH' },
  { symbol: '600020', name: '中原高速', assetType: 'stock', exchange: 'SH' },
  { symbol: '600021', name: '上海电力', assetType: 'stock', exchange: 'SH' },
  { symbol: '600023', name: '浙能电力', assetType: 'stock', exchange: 'SH' },
  { symbol: '600025', name: '华能水电', assetType: 'stock', exchange: 'SH' },
  { symbol: '600026', name: '中远海能', assetType: 'stock', exchange: 'SH' },
  { symbol: '600028', name: '中国石化', assetType: 'stock', exchange: 'SH' },
  { symbol: '600029', name: '南方航空', assetType: 'stock', exchange: 'SH' },
  { symbol: '600030', name: '中信证券', assetType: 'stock', exchange: 'SH' },
  { symbol: '600031', name: '三一重工', assetType: 'stock', exchange: 'SH' },
  { symbol: '600036', name: '招商银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '600048', name: '保利发展', assetType: 'stock', exchange: 'SH' },
  { symbol: '600050', name: '中国联通', assetType: 'stock', exchange: 'SH' },
  { symbol: '600052', name: '东望时代', assetType: 'stock', exchange: 'SH' },
  { symbol: '600053', name: '九鼎投资', assetType: 'stock', exchange: 'SH' },
  { symbol: '600054', name: '黄山旅游', assetType: 'stock', exchange: 'SH' },
  { symbol: '600056', name: '中国医药', assetType: 'stock', exchange: 'SH' },
  { symbol: '600058', name: '五矿发展', assetType: 'stock', exchange: 'SH' },
  { symbol: '600059', name: '古越龙山', assetType: 'stock', exchange: 'SH' },
  { symbol: '600060', name: '海信视像', assetType: 'stock', exchange: 'SH' },
  { symbol: '600061', name: '国投资本', assetType: 'stock', exchange: 'SH' },
  { symbol: '600062', name: '华润双鹤', assetType: 'stock', exchange: 'SH' },
  { symbol: '600063', name: '皖维高新', assetType: 'stock', exchange: 'SH' },
  { symbol: '600066', name: '宇通客车', assetType: 'stock', exchange: 'SH' },
  { symbol: '600068', name: '葛洲坝', assetType: 'stock', exchange: 'SH' },
  { symbol: '600089', name: '特变电工', assetType: 'stock', exchange: 'SH' },
  { symbol: '600104', name: '上汽集团', assetType: 'stock', exchange: 'SH' },
  { symbol: '600109', name: '国金证券', assetType: 'stock', exchange: 'SH' },
  { symbol: '600111', name: '北方稀土', assetType: 'stock', exchange: 'SH' },
  { symbol: '600115', name: '东方航空', assetType: 'stock', exchange: 'SH' },
  { symbol: '600118', name: '中国卫星', assetType: 'stock', exchange: 'SH' },
  { symbol: '600150', name: '中国船舶', assetType: 'stock', exchange: 'SH' },
  { symbol: '600170', name: '上海建工', assetType: 'stock', exchange: 'SH' },
  { symbol: '600176', name: '中国巨石', assetType: 'stock', exchange: 'SH' },
  { symbol: '600183', name: '生益科技', assetType: 'stock', exchange: 'SH' },
  { symbol: '600188', name: '兖矿能源', assetType: 'stock', exchange: 'SH' },
  { symbol: '600196', name: '复星医药', assetType: 'stock', exchange: 'SH' },
  { symbol: '600309', name: '万华化学', assetType: 'stock', exchange: 'SH' },
  { symbol: '600519', name: '贵州茅台', assetType: 'stock', exchange: 'SH' },
  { symbol: '600887', name: '伊利股份', assetType: 'stock', exchange: 'SH' },
  { symbol: '600900', name: '长江电力', assetType: 'stock', exchange: 'SH' },
  { symbol: '600941', name: '中国移动', assetType: 'stock', exchange: 'SH' },
  { symbol: '600989', name: '宝丰能源', assetType: 'stock', exchange: 'SH' },
  { symbol: '600999', name: '招商证券', assetType: 'stock', exchange: 'SH' },
  { symbol: '601006', name: '大秦铁路', assetType: 'stock', exchange: 'SH' },
  { symbol: '601012', name: '隆基绿能', assetType: 'stock', exchange: 'SH' },
  { symbol: '601088', name: '中国神华', assetType: 'stock', exchange: 'SH' },
  { symbol: '601166', name: '兴业银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '601169', name: '北京银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '601288', name: '农业银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '601318', name: '中国平安', assetType: 'stock', exchange: 'SH' },
  { symbol: '601328', name: '交通银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '601336', name: '新华保险', assetType: 'stock', exchange: 'SH' },
  { symbol: '601398', name: '工商银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '601601', name: '中国太保', assetType: 'stock', exchange: 'SH' },
  { symbol: '601628', name: '中国人寿', assetType: 'stock', exchange: 'SH' },
  { symbol: '601668', name: '中国建筑', assetType: 'stock', exchange: 'SH' },
  { symbol: '601688', name: '华泰证券', assetType: 'stock', exchange: 'SH' },
  { symbol: '601818', name: '光大银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '601857', name: '中国石油', assetType: 'stock', exchange: 'SH' },
  { symbol: '601888', name: '中国中免', assetType: 'stock', exchange: 'SH' },
  { symbol: '601899', name: '紫金矿业', assetType: 'stock', exchange: 'SH' },
  { symbol: '601939', name: '建设银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '601985', name: '中国核电', assetType: 'stock', exchange: 'SH' },
  { symbol: '601988', name: '中国银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '601989', name: '中国重工', assetType: 'stock', exchange: 'SH' },
  { symbol: '601998', name: '中信银行', assetType: 'stock', exchange: 'SH' },
  { symbol: '603259', name: '药明康德', assetType: 'stock', exchange: 'SH' },
  { symbol: '603288', name: '海天味业', assetType: 'stock', exchange: 'SH' },
  { symbol: '603501', name: '韦尔股份', assetType: 'stock', exchange: 'SH' },
  { symbol: '603799', name: '华友钴业', assetType: 'stock', exchange: 'SH' },
  { symbol: '603986', name: '兆易创新', assetType: 'stock', exchange: 'SH' },
  { symbol: '688041', name: '芯动联科', assetType: 'stock', exchange: 'SH' },
  { symbol: '688111', name: '金山办公', assetType: 'stock', exchange: 'SH' },
  { symbol: '688981', name: '中芯国际', assetType: 'stock', exchange: 'SH' },
  // Hong Kong stocks
  { symbol: '00700', name: '腾讯控股', assetType: 'stock', exchange: 'HK' },
  { symbol: '00939', name: '建设银行', assetType: 'stock', exchange: 'HK' },
  { symbol: '00941', name: '中国移动', assetType: 'stock', exchange: 'HK' },
  { symbol: '00992', name: '联想集团', assetType: 'stock', exchange: 'HK' },
  { symbol: '01024', name: '快手-W', assetType: 'stock', exchange: 'HK' },
  { symbol: '01088', name: '中国神华', assetType: 'stock', exchange: 'HK' },
  { symbol: '01810', name: '小米集团-W', assetType: 'stock', exchange: 'HK' },
  { symbol: '02020', name: '安踏体育', assetType: 'stock', exchange: 'HK' },
  { symbol: '02318', name: '中国平安', assetType: 'stock', exchange: 'HK' },
  { symbol: '02319', name: '蒙牛乳业', assetType: 'stock', exchange: 'HK' },
  { symbol: '02382', name: '舜宇光学科技', assetType: 'stock', exchange: 'HK' },
  { symbol: '02628', name: '中国人寿', assetType: 'stock', exchange: 'HK' },
  { symbol: '03690', name: '美团-W', assetType: 'stock', exchange: 'HK' },
  { symbol: '03888', name: '金山软件', assetType: 'stock', exchange: 'HK' },
  { symbol: '03988', name: '中国银行', assetType: 'stock', exchange: 'HK' },
  { symbol: '06690', name: '海尔智家', assetType: 'stock', exchange: 'HK' },
  { symbol: '06888', name: '海底捞', assetType: 'stock', exchange: 'HK' },
  { symbol: '09888', name: '百度集团-SW', assetType: 'stock', exchange: 'HK' },
  { symbol: '09987', name: '百胜中国', assetType: 'stock', exchange: 'HK' },
  { symbol: '09988', name: '阿里巴巴-SW', assetType: 'stock', exchange: 'HK' },
  { symbol: '09999', name: '网易-S', assetType: 'stock', exchange: 'HK' },
  { symbol: '10288', name: '金蝶国际', assetType: 'stock', exchange: 'HK' },
  { symbol: '11692', name: '农夫山泉', assetType: 'stock', exchange: 'HK' },
  { symbol: '18100', name: '小鹏汽车-W', assetType: 'stock', exchange: 'HK' },
  { symbol: '20188', name: '润燃', assetType: 'stock', exchange: 'HK' },
  { symbol: '36900', name: '携程集团-S', assetType: 'stock', exchange: 'HK' },
  { symbol: '66183', name: '贵州茅台', assetType: 'stock', exchange: 'HK' },

  // US stocks
  { symbol: 'AAPL', name: 'Apple Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', assetType: 'stock', exchange: 'US' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', assetType: 'stock', exchange: 'US' },
  { symbol: 'TSLA', name: 'Tesla Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'META', name: 'Meta Platforms Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', assetType: 'stock', exchange: 'US' },
  { symbol: 'V', name: 'Visa Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'MA', name: 'Mastercard Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', assetType: 'stock', exchange: 'US' },
  { symbol: 'WMT', name: 'Walmart Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'PG', name: 'Procter & Gamble Co.', assetType: 'stock', exchange: 'US' },
  { symbol: 'HD', name: 'Home Depot Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'CVX', name: 'Chevron Corporation', assetType: 'stock', exchange: 'US' },
  { symbol: 'MRK', name: 'Merck & Co. Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'KO', name: 'Coca-Cola Company', assetType: 'stock', exchange: 'US' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'COST', name: 'Costco Wholesale', assetType: 'stock', exchange: 'US' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'LLY', name: 'Eli Lilly and Company', assetType: 'stock', exchange: 'US' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific', assetType: 'stock', exchange: 'US' },
  { symbol: 'BAC', name: 'Bank of America Corp.', assetType: 'stock', exchange: 'US' },
  { symbol: 'DIS', name: 'Walt Disney Company', assetType: 'stock', exchange: 'US' },
  { symbol: 'ADBE', name: 'Adobe Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'NFLX', name: 'Netflix Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'CRM', name: 'Salesforce Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'INTC', name: 'Intel Corporation', assetType: 'stock', exchange: 'US' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', assetType: 'stock', exchange: 'US' },
  { symbol: 'QCOM', name: 'Qualcomm Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'TXN', name: 'Texas Instruments', assetType: 'stock', exchange: 'US' },
  { symbol: 'PYPL', name: 'PayPal Holdings', assetType: 'stock', exchange: 'US' },
  { symbol: 'CSCO', name: 'Cisco Systems', assetType: 'stock', exchange: 'US' },
  { symbol: 'ORCL', name: 'Oracle Corporation', assetType: 'stock', exchange: 'US' },
  { symbol: 'IBM', name: 'IBM Corporation', assetType: 'stock', exchange: 'US' },
  { symbol: 'UBER', name: 'Uber Technologies', assetType: 'stock', exchange: 'US' },
  { symbol: 'ABNB', name: 'Airbnb Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'SPOT', name: 'Spotify Technology', assetType: 'stock', exchange: 'US' },
  { symbol: 'BABA', name: 'Alibaba Group', assetType: 'stock', exchange: 'US' },
  { symbol: 'BIDU', name: 'Baidu Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'JD', name: 'JD.com Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'PDD', name: 'PDD Holdings', assetType: 'stock', exchange: 'US' },
  { symbol: 'NTES', name: 'NetEase Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'NIO', name: 'NIO Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'XPEV', name: 'XPeng Inc.', assetType: 'stock', exchange: 'US' },
  { symbol: 'LI', name: 'Li Auto Inc.', assetType: 'stock', exchange: 'US' },
];

const FUND_DATA: SymbolInfo[] = [
  // Index ETFs (上海/深圳)
  { symbol: '510050', name: '华夏上证50ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '510300', name: '华泰柏瑞沪深300ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '510500', name: '南方中证500ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '159919', name: '嘉实沪深300ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '159915', name: '易方达创业板ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '159901', name: '易方达深证100ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '159949', name: '华安创业板50ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '159605', name: '广发中证海外中国互联网30ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '159941', name: '纳指ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '513500', name: '博时标普500ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '513100', name: '国泰纳斯达克100ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '518880', name: '国泰黄金ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '518800', name: '华夏黄金ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '512880', name: '国泰中证全指证券公司ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '512760', name: '国泰CES半导体芯片行业ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '512010', name: '华夏中证芯片产业ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '512690', name: '鹏华中证酒ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '515050', name: '华夏中证5G通信主题ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '515790', name: '华泰柏瑞中证光伏产业ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '515030', name: '华夏中证新能源汽车ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '516110', name: '易方达中证800ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '513180', name: '华夏恒生科技ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '513060', name: '博时港股通科技ETF', assetType: 'fund', exchange: 'SH' },
  { symbol: '159792', name: '易方达中证港股通消费ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '159745', name: '国联安中证全指半导体ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '159869', name: '华夏中证机器人ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '159825', name: '富国中证农业主题ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '159628', name: '招商中证1000增强ETF', assetType: 'fund', exchange: 'SZ' },
  { symbol: '159820', name: '工银瑞信中证500ETF', assetType: 'fund', exchange: 'SZ' },

  // REITs (基础设施公募REITs)
  { symbol: '508000', name: '华安张江光大园REIT', assetType: 'fund', exchange: 'SH' },
  { symbol: '508006', name: '中金普洛斯仓储物流REIT', assetType: 'fund', exchange: 'SH' },
  { symbol: '508027', name: '东吴苏园产业REIT', assetType: 'fund', exchange: 'SH' },
  { symbol: '508056', name: '中金厦门安居REIT', assetType: 'fund', exchange: 'SH' },
  { symbol: '508058', name: '华夏中国交建高速REIT', assetType: 'fund', exchange: 'SH' },
  { symbol: '180201', name: '平安广州交投广河高速REIT', assetType: 'fund', exchange: 'SZ' },
  { symbol: '180401', name: '红土创新盐田港仓储物流REIT', assetType: 'fund', exchange: 'SZ' },
  { symbol: '180501', name: '博时蛇口产园REIT', assetType: 'fund', exchange: 'SZ' },
  { symbol: '180801', name: '中航首钢绿能REIT', assetType: 'fund', exchange: 'SZ' },
  { symbol: '180901', name: '浙商沪杭甬高速REIT', assetType: 'fund', exchange: 'SZ' },
  { symbol: '508001', name: '浙商证券沪杭甬高速REIT', assetType: 'fund', exchange: 'SH' },
  { symbol: '508005', name: '建信中关村REIT', assetType: 'fund', exchange: 'SH' },
  { symbol: '508021', name: '国君临港创新产业园REIT', assetType: 'fund', exchange: 'SH' },
  { symbol: '508099', name: '鹏华深圳能源REIT', assetType: 'fund', exchange: 'SH' },
  { symbol: '508088', name: '华泰江苏交控REIT', assetType: 'fund', exchange: 'SH' },

  // Equity funds (主动管理型)
  { symbol: '110011', name: '易方达中小盘混合', assetType: 'fund', exchange: 'OT' },
  { symbol: '161725', name: '招商中证白酒指数(LOF)', assetType: 'fund', exchange: 'SZ' },
  { symbol: '003096', name: '中欧医疗健康混合A', assetType: 'fund', exchange: 'OT' },
  { symbol: '005827', name: '易方达蓝筹精选混合', assetType: 'fund', exchange: 'OT' },
  { symbol: '006327', name: '易方达中证海外互联ETF联接A', assetType: 'fund', exchange: 'OT' },
  { symbol: '007340', name: '南方科技创新混合A', assetType: 'fund', exchange: 'OT' },
  { symbol: '320007', name: '诺安成长混合', assetType: 'fund', exchange: 'OT' },
  { symbol: '519697', name: '交银施罗德优势行业灵活配置', assetType: 'fund', exchange: 'OT' },
  { symbol: '270008', name: '广发消费品精选混合A', assetType: 'fund', exchange: 'OT' },
  { symbol: '000961', name: '天弘沪深300ETF联接A', assetType: 'fund', exchange: 'OT' },
  { symbol: '008087', name: '华夏中证5G通信主题ETF联接A', assetType: 'fund', exchange: 'OT' },
  { symbol: '009265', name: '易方达消费行业股票', assetType: 'fund', exchange: 'OT' },
  { symbol: '011507', name: '兴全合润混合', assetType: 'fund', exchange: 'OT' },
  { symbol: '590008', name: '中邮战略新兴产业混合', assetType: 'fund', exchange: 'OT' },
  { symbol: '163402', name: '兴全趋势投资混合(LOF)', assetType: 'fund', exchange: 'OT' },
  { symbol: '163415', name: '兴全绿色投资混合(LOF)', assetType: 'fund', exchange: 'OT' },
  { symbol: '260101', name: '景顺长城新兴成长混合', assetType: 'fund', exchange: 'OT' },
  { symbol: '260103', name: '景顺长城动力平衡混合', assetType: 'fund', exchange: 'OT' },
  { symbol: '481009', name: '工银瑞信核心价值混合A', assetType: 'fund', exchange: 'OT' },
  { symbol: '519001', name: '银华价值优选混合', assetType: 'fund', exchange: 'OT' },
  { symbol: '519688', name: '交银先锋混合A', assetType: 'fund', exchange: 'OT' },
  { symbol: '630002', name: '华商动态阿尔法混合', assetType: 'fund', exchange: 'OT' },
  { symbol: '700001', name: '平安行业先锋混合', assetType: 'fund', exchange: 'OT' },
  { symbol: '710001', name: '富安达优势成长混合', assetType: 'fund', exchange: 'OT' },

  // Bond funds
  { symbol: '000171', name: '易方达纯债债券A', assetType: 'fund', exchange: 'OT' },
  { symbol: '470058', name: '汇添富增强收益债券A', assetType: 'fund', exchange: 'OT' },
  { symbol: '485105', name: '工银瑞信添颐债券A', assetType: 'fund', exchange: 'OT' },
  { symbol: '340009', name: '兴全磐稳增利债券A', assetType: 'fund', exchange: 'OT' },
  { symbol: '217022', name: '招商安泰债券A', assetType: 'fund', exchange: 'OT' },

  // Money market funds
  { symbol: '000009', name: '易方达天天理财货币A', assetType: 'fund', exchange: 'OT' },
  { symbol: '000538', name: '华夏现金宝货币A', assetType: 'fund', exchange: 'OT' },
  { symbol: '000640', name: '国投瑞银货币A', assetType: 'fund', exchange: 'OT' },

  // QDII funds (海外投资)
  { symbol: '000369', name: '广发全球精选股票(QDII)', assetType: 'fund', exchange: 'OT' },
  { symbol: '000834', name: '大成纳斯达克100指数(QDII)', assetType: 'fund', exchange: 'OT' },
  { symbol: '206011', name: '鹏华全球高收益债(QDII)', assetType: 'fund', exchange: 'OT' },
  { symbol: '377530', name: '上投摩根新兴动力混合A', assetType: 'fund', exchange: 'OT' },
  { symbol: '162411', name: '华宝标普油气上游股票(QDII)', assetType: 'fund', exchange: 'SZ' },
  { symbol: '164701', name: '中银标普全球精选股票(QDII)', assetType: 'fund', exchange: 'OT' },
];

const ALL_SYMBOLS = [...STOCK_DATA, ...FUND_DATA];

/**
 * Search symbols by query (matches code or name)
 */
export function searchSymbols(
  query: string,
  assetType?: 'stock' | 'fund'
): SymbolInfo[] {
  if (!query || query.length < 1) return [];

  const normalizedQuery = query.toLowerCase().trim();

  return ALL_SYMBOLS
    .filter((s) => {
      // Filter by asset type if specified
      if (assetType && s.assetType !== assetType) return false;

      // Match symbol code (partial match)
      if (s.symbol.toLowerCase().includes(normalizedQuery)) return true;

      // Match name (partial match)
      if (s.name.toLowerCase().includes(normalizedQuery)) return true;

      return false;
    })
    .slice(0, 10); // Limit results
}

/**
 * Get symbol info by exact symbol match
 */
export function getSymbolInfo(symbol: string): SymbolInfo | undefined {
  return ALL_SYMBOLS.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());
}

/**
 * Detect asset type from symbol pattern
 */
export function detectAssetType(symbol: string): 'stock' | 'fund' | 'bank_wealth_management' | 'bank_cash' {
  const normalizedSymbol = symbol.toUpperCase();

  // 6-digit codes
  if (/^\d{6}$/.test(normalizedSymbol)) {
    // Stock: 000xxx-009xxx, 600xxx-605xxx, 688xxx
    if (/^(0[0-2]\d{3}|6[0-5]\d{3}|688\d{3})$/.test(normalizedSymbol)) {
      return 'stock';
    }
    // Fund: 15xxxx, 16xxxx, 31xxxx, 32xxxx, 47xxxx, 48xxxx, 49xxxx, 51xxxx, 51xxxx
    if (/^(15|16|31|32|47|48|49|51|51|59)\d{3}$/.test(normalizedSymbol)) {
      return 'fund';
    }
    return 'stock';
  }

  // HK stocks: 5 digits
  if (/^\d{5}$/.test(normalizedSymbol)) {
    return 'stock';
  }

  // US stocks: letters
  if (/^[A-Z]{1,5}$/.test(normalizedSymbol)) {
    return 'stock';
  }

  // Default
  return 'stock';
}
