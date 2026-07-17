import { NextRequest, NextResponse } from 'next/server';

interface FundData {
  fundcode: string;
  name: string;
  jzrq: string;
  dwjz: string;
  gsz: string;
  gszzl: string;
  gztime: string;
  gzct?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get('symbols');

  if (!symbols) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const symbolList = symbols.split(',').map((s) => s.trim().toUpperCase());

  const results = await Promise.all(
    symbolList.map(async (symbol) => {
      try {
        const fundCode = symbol.replace(/\.OF$/i, '');
        const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${Date.now()}`;

        const response = await fetch(url, {
          headers: {
            Referer: 'https://fund.eastmoney.com',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!response.ok) {
          return { symbol, error: `HTTP ${response.status}` };
        }

        const text = await response.text();
        const match = text.match(/jsonpgz\((.+)\)/);

        if (!match) {
          return { symbol, error: 'Invalid response format' };
        }

        const data: FundData = JSON.parse(match[1]);
        const price = parseFloat(data.gsz);
        const prevClose = parseFloat(data.gzct || data.dwjz);

        if (isNaN(price) || price === 0) {
          return { symbol, error: 'Invalid price data' };
        }

        const change = price - prevClose;
        const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

        return {
          symbol: symbol.toUpperCase(),
          name: data.name || fundCode,
          price,
          change,
          changePercent,
          prevClose,
          open: price,
          high: price,
          low: price,
          volume: 0,
          timestamp: data.gztime || new Date().toISOString(),
          source: 'fund' as const,
        };
      } catch (err) {
        return { symbol, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    })
  );

  const prices = results.filter((r) => !('error' in r));
  const errors = results.filter((r) => 'error' in r).map((r) => `${r.symbol}: ${r.error}`);

  return NextResponse.json({
    success: errors.length === 0,
    prices,
    errors: errors.length > 0 ? errors : undefined,
  });
}
