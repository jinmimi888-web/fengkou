export type AssetKind = "equity" | "crypto";

export type CatalogItem = {
  symbol: string;
  name: string;
  aliases: string[];
  exchange: string;
  kind: AssetKind;
};

export const DEFAULT_WATCHLIST = [
  "NVDA",
  "AAPL",
  "0700.HK",
  "TSLA",
  "BABA",
  "600519.SS",
] as const;

export const DEFAULT_CRYPTO = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "BNB-USD",
  "XRP-USD",
  "DOGE-USD",
] as const;

export const INDEX_TAPE = [
  { symbol: "^GSPC", label: "标普500" },
  { symbol: "^IXIC", label: "纳指" },
  { symbol: "^HSI", label: "恒指" },
  { symbol: "000300.SS", label: "沪深300" },
] as const;

export const CRYPTO_TAPE = [
  { symbol: "BTC-USD", label: "比特币" },
  { symbol: "ETH-USD", label: "以太坊" },
  { symbol: "SOL-USD", label: "索拉纳" },
  { symbol: "BNB-USD", label: "币安币" },
] as const;

export const FX_PAIRS = [
  { symbol: "USDCNY=X", currency: "CNY" },
  { symbol: "USDHKD=X", currency: "HKD" },
] as const;

export const CATALOG: CatalogItem[] = [
  { symbol: "AAPL", name: "苹果", aliases: ["apple", "苹果"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "MSFT", name: "微软", aliases: ["microsoft", "微软"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "NVDA", name: "英伟达", aliases: ["nvidia", "英伟达", "黄仁勋"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "GOOGL", name: "谷歌", aliases: ["google", "alphabet", "谷歌"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "AMZN", name: "亚马逊", aliases: ["amazon", "亚马逊"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "META", name: "Meta", aliases: ["facebook", "meta", "脸书"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "TSLA", name: "特斯拉", aliases: ["tesla", "特斯拉", "马斯克"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "AVGO", name: "博通", aliases: ["broadcom", "博通"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "AMD", name: "超微", aliases: ["amd", "超微"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "NFLX", name: "奈飞", aliases: ["netflix", "奈飞"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "JPM", name: "摩根大通", aliases: ["jpmorgan", "摩根"], exchange: "NYSE", kind: "equity" },
  { symbol: "BRK-B", name: "伯克希尔", aliases: ["berkshire", "巴菲特"], exchange: "NYSE", kind: "equity" },
  { symbol: "LLY", name: "礼来", aliases: ["lilly", "礼来"], exchange: "NYSE", kind: "equity" },
  { symbol: "XOM", name: "埃克森美孚", aliases: ["exxon"], exchange: "NYSE", kind: "equity" },
  { symbol: "UNH", name: "联合健康", aliases: ["unitedhealth"], exchange: "NYSE", kind: "equity" },
  { symbol: "COST", name: "开市客", aliases: ["costco"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "PLTR", name: "帕兰提尔", aliases: ["palantir", "帕兰提尔"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "COIN", name: "Coinbase", aliases: ["coinbase"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "MSTR", name: "微策略", aliases: ["microstrategy", "策略", "微策略"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "SPY", name: "标普500 ETF", aliases: ["spy", "标普"], exchange: "ARCA", kind: "equity" },
  { symbol: "QQQ", name: "纳指100 ETF", aliases: ["qqq", "纳指"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "GLD", name: "黄金 ETF", aliases: ["gold", "黄金"], exchange: "ARCA", kind: "equity" },
  { symbol: "TLT", name: "长期美债", aliases: ["tlt", "美债"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "BABA", name: "阿里巴巴", aliases: ["alibaba", "阿里", "baba"], exchange: "NYSE", kind: "equity" },
  { symbol: "PDD", name: "拼多多", aliases: ["pdd", "拼多多", "temu"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "JD", name: "京东", aliases: ["jd", "京东"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "BIDU", name: "百度", aliases: ["baidu", "百度"], exchange: "NASDAQ", kind: "equity" },
  { symbol: "NIO", name: "蔚来", aliases: ["nio", "蔚来"], exchange: "NYSE", kind: "equity" },
  { symbol: "0700.HK", name: "腾讯控股", aliases: ["tencent", "腾讯", "0700", "700"], exchange: "HKEX", kind: "equity" },
  { symbol: "9988.HK", name: "阿里巴巴-W", aliases: ["9988", "阿里港股"], exchange: "HKEX", kind: "equity" },
  { symbol: "3690.HK", name: "美团-W", aliases: ["meituan", "美团", "3690"], exchange: "HKEX", kind: "equity" },
  { symbol: "1810.HK", name: "小米集团-W", aliases: ["xiaomi", "小米", "1810"], exchange: "HKEX", kind: "equity" },
  { symbol: "9618.HK", name: "京东集团-SW", aliases: ["9618"], exchange: "HKEX", kind: "equity" },
  { symbol: "0941.HK", name: "中国移动", aliases: ["移动", "0941", "941"], exchange: "HKEX", kind: "equity" },
  { symbol: "0388.HK", name: "香港交易所", aliases: ["港交所", "0388", "388"], exchange: "HKEX", kind: "equity" },
  { symbol: "1299.HK", name: "友邦保险", aliases: ["aia", "友邦", "1299"], exchange: "HKEX", kind: "equity" },
  { symbol: "1211.HK", name: "比亚迪股份", aliases: ["byd港股", "1211"], exchange: "HKEX", kind: "equity" },
  { symbol: "2020.HK", name: "安踏体育", aliases: ["anta", "安踏", "2020"], exchange: "HKEX", kind: "equity" },
  { symbol: "600519.SS", name: "贵州茅台", aliases: ["茅台", "moutai", "600519"], exchange: "SSE", kind: "equity" },
  { symbol: "601318.SS", name: "中国平安", aliases: ["平安", "601318"], exchange: "SSE", kind: "equity" },
  { symbol: "600036.SS", name: "招商银行", aliases: ["招行", "600036"], exchange: "SSE", kind: "equity" },
  { symbol: "601012.SS", name: "隆基绿能", aliases: ["隆基", "601012"], exchange: "SSE", kind: "equity" },
  { symbol: "688981.SS", name: "中芯国际", aliases: ["中芯", "smic", "688981"], exchange: "SSE", kind: "equity" },
  { symbol: "000858.SZ", name: "五粮液", aliases: ["五粮液", "000858"], exchange: "SZSE", kind: "equity" },
  { symbol: "000333.SZ", name: "美的集团", aliases: ["美的", "000333"], exchange: "SZSE", kind: "equity" },
  { symbol: "002594.SZ", name: "比亚迪", aliases: ["byd", "比亚迪", "002594"], exchange: "SZSE", kind: "equity" },
  { symbol: "300750.SZ", name: "宁德时代", aliases: ["宁德", "catl", "300750"], exchange: "SZSE", kind: "equity" },
  { symbol: "002475.SZ", name: "立讯精密", aliases: ["立讯", "002475"], exchange: "SZSE", kind: "equity" },
  { symbol: "BTC-USD", name: "比特币", aliases: ["btc", "bitcoin", "比特币"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "ETH-USD", name: "以太坊", aliases: ["eth", "ethereum", "以太坊", "以太"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "SOL-USD", name: "索拉纳", aliases: ["sol", "solana", "索拉纳"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "BNB-USD", name: "币安币", aliases: ["bnb", "币安"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "XRP-USD", name: "瑞波", aliases: ["xrp", "ripple", "瑞波"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "DOGE-USD", name: "狗狗币", aliases: ["doge", "dogecoin", "狗狗"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "ADA-USD", name: "艾达币", aliases: ["ada", "cardano", "艾达"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "AVAX-USD", name: "雪崩", aliases: ["avax", "avalanche", "雪崩"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "LINK-USD", name: "Chainlink", aliases: ["link", "chainlink"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "DOT-USD", name: "波卡", aliases: ["dot", "polkadot", "波卡"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "TON-USD", name: "TON", aliases: ["ton", "toncoin"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "SUI-USD", name: "Sui", aliases: ["sui"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "LTC-USD", name: "莱特币", aliases: ["ltc", "litecoin", "莱特"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "BCH-USD", name: "比特币现金", aliases: ["bch", "bitcoincash"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "UNI-USD", name: "Uniswap", aliases: ["uni", "uniswap"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "APT-USD", name: "Aptos", aliases: ["apt", "aptos"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "NEAR-USD", name: "NEAR", aliases: ["near"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "ARB-USD", name: "Arbitrum", aliases: ["arb", "arbitrum"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "OP-USD", name: "Optimism", aliases: ["op", "optimism"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "TRX-USD", name: "波场", aliases: ["trx", "tron", "波场"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "SHIB-USD", name: "柴犬币", aliases: ["shib", "shiba", "柴犬"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "PEPE-USD", name: "PEPE", aliases: ["pepe"], exchange: "CRYPTO", kind: "crypto" },
  { symbol: "HBAR-USD", name: "Hedera", aliases: ["hbar", "hedera"], exchange: "CRYPTO", kind: "crypto" },
];

export function isCrypto(symbol: string): boolean {
  const hit = CATALOG.find((c) => c.symbol === symbol);
  if (hit) return hit.kind === "crypto";
  return /^[A-Z0-9]{2,10}-USD$/.test(symbol);
}

export function assetKind(symbol: string): AssetKind {
  return isCrypto(symbol) ? "crypto" : "equity";
}

export function shortSymbol(symbol: string): string {
  return isCrypto(symbol) ? symbol.replace(/-USD$/, "") : symbol;
}

export function unitLabel(symbol: string): string {
  return isCrypto(symbol) ? "枚" : "股";
}

export function displayName(symbol: string, quoteName?: string) {
  return CATALOG.find((c) => c.symbol === symbol)?.name ?? quoteName ?? symbol;
}

const EXCHANGE_ZH: Record<string, string> = {
  NASDAQ: "纳斯达克",
  NMS: "纳斯达克",
  NYSE: "纽交所",
  NYQ: "纽交所",
  HKEX: "港交所",
  HKG: "港交所",
  SSE: "上交所",
  SHH: "上交所",
  SZSE: "深交所",
  SHZ: "深交所",
  ARCA: "美股",
  CRYPTO: "加密",
  CCC: "加密",
};

export function exchangeLabel(exchange: string): string {
  return EXCHANGE_ZH[exchange] ?? exchange;
}

export function normalizeSymbol(raw: string): string {
  const original = raw.trim();
  if (!original) return original;
  const t = original.toUpperCase().replace(/\s+/g, "");
  const lower = original.toLowerCase();
  const aliased = CATALOG.find(
    (c) =>
      c.symbol.toUpperCase() === t ||
      c.symbol.replace(/-USD$/, "") === t ||
      c.aliases.some((a) => a.toLowerCase() === lower),
  );
  if (aliased) return aliased.symbol;
  if (/^[A-Z0-9]{2,10}-USD$/.test(t)) return t;
  if (/^[A-Z0-9]{2,10}USD$/.test(t)) {
    const base = t.slice(0, -3) + "-USD";
    if (CATALOG.some((c) => c.symbol === base) || t.length <= 8) return base;
  }
  if (t.includes(".")) {
    const [code, exch] = t.split(".");
    if (code && exch) {
      if (exch === "HK") return code.padStart(4, "0") + ".HK";
      if (exch === "SS" || exch === "SZ" || exch === "SH") {
        const mapped = exch === "SH" ? "SS" : exch;
        return code.padStart(6, "0") + "." + mapped;
      }
      return `${code}.${exch}`;
    }
  }
  if (/^\d{1,4}$/.test(t)) return t.padStart(4, "0") + ".HK";
  if (/^\d{6}$/.test(t)) {
    if (t.startsWith("6") || t.startsWith("9")) return `${t}.SS`;
    return `${t}.SZ`;
  }
  return t;
}

export function searchCatalog(q: string, limit = 8, kind?: AssetKind): CatalogItem[] {
  const pool = kind ? CATALOG.filter((c) => c.kind === kind) : CATALOG;
  const t = q.trim().toLowerCase();
  if (!t) return pool.slice(0, limit);
  const scored = pool
    .map((c) => {
      const hay = [c.symbol, c.name, ...c.aliases].join(" ").toLowerCase();
      let score = 0;
      if (c.symbol.toLowerCase() === t) score = 100;
      else if (c.symbol.replace(/-usd$/, "") === t) score = 95;
      else if (c.symbol.toLowerCase().startsWith(t)) score = 80;
      else if (c.name === q.trim()) score = 70;
      else if (c.aliases.some((a) => a.toLowerCase() === t)) score = 65;
      else if (hay.includes(t)) score = 40;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.c);
}