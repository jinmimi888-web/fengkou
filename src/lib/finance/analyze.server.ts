import { getBundle, getNews } from "./market.server";
import { isCrypto } from "./catalog";
import { DIMENSION_META } from "./types";
import type {
  Analysis,
  BookAnalysis,
  BookVerdict,
  DimensionKey,
  Horizon,
  Severity,
  Verdict,
} from "./types";

const DIMENSIONS = Object.keys(DIMENSION_META) as DimensionKey[];

const emptyDim = { score: 50, note: "样本不足" };

function fallbackAnalysis(symbol: string, reason: string): Analysis {
  return {
    symbol,
    generatedAt: Date.now(),
    verdict: "wait",
    headline: "暂无法完成模型研判",
    summary: reason,
    conviction: 1,
    horizon: "swing",
    sizeMinPct: 0,
    sizeMaxPct: 0,
    invalidation: "等待数据恢复后再评估。",
    entryPlan: "先观察盘面与新闻，不要在信息缺失时加仓。",
    dimensions: {
      sentiment: emptyDim,
      catalyst: emptyDim,
      momentum: emptyDim,
      valuation: emptyDim,
      liquidity: emptyDim,
      macro: emptyDim,
    },
    risks: [{ title: "数据或模型不可用", severity: "mid", detail: reason }],
    watch: ["行情接口恢复", "官方公告与财报日历"],
    riskScore: 60,
  };
}

function asVerdict(v: unknown): Verdict {
  return v === "enter" || v === "probe" || v === "wait" || v === "avoid" ? v : "wait";
}

function asHorizon(v: unknown): Horizon {
  return v === "intraday" || v === "swing" || v === "position" ? v : "swing";
}

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(hi, Math.max(lo, x));
}

function coerce(symbol: string, raw: Record<string, unknown>): Analysis {
  const dimsIn = (raw.dimensions ?? {}) as Record<string, { score?: unknown; note?: unknown }>;
  const dimensions = {} as Analysis["dimensions"];
  for (const key of DIMENSIONS) {
    const d = dimsIn[key] ?? {};
    dimensions[key] = {
      score: clamp(d.score, 0, 100, 50),
      note: String(d.note ?? "").slice(0, 80) || "—",
    };
  }
  const risksRaw = Array.isArray(raw.risks) ? raw.risks : [];
  const risks = risksRaw.slice(0, 6).map((r) => {
    const item = (r ?? {}) as Record<string, unknown>;
    const sev: Severity =
      item.severity === "high" ? "high" : item.severity === "low" ? "low" : "mid";
    return {
      title: String(item.title ?? "风险").slice(0, 40),
      severity: sev,
      detail: String(item.detail ?? "").slice(0, 160),
    };
  });
  const watch = (Array.isArray(raw.watch) ? raw.watch : [])
    .map((w) => String(w).slice(0, 80))
    .filter(Boolean)
    .slice(0, 5);
  return {
    symbol,
    generatedAt: Date.now(),
    verdict: asVerdict(raw.verdict),
    headline: String(raw.headline ?? "").slice(0, 48) || "综合研判",
    summary: String(raw.summary ?? "").slice(0, 280) || "模型未给出综述。",
    conviction: clamp(raw.conviction, 1, 5, 3),
    horizon: asHorizon(raw.horizon),
    sizeMinPct: clamp(raw.sizeMinPct, 0, 30, 0),
    sizeMaxPct: clamp(raw.sizeMaxPct, 0, 40, 0),
    invalidation: String(raw.invalidation ?? "").slice(0, 160),
    entryPlan: String(raw.entryPlan ?? "").slice(0, 200),
    dimensions,
    risks: risks.length
      ? risks
      : [{ title: "模型未列出风险", severity: "mid", detail: "请结合自身风控。" }],
    watch: watch.length ? watch : ["下一份财报", "板块资金"],
    riskScore: clamp(raw.riskScore, 0, 100, 50),
  };
}

const recentCalls: number[] = [];

function rateOk(): boolean {
  const now = Date.now();
  while (recentCalls.length && now - recentCalls[0]! > 10 * 60_000) recentCalls.shift();
  if (recentCalls.length >= 36) return false;
  recentCalls.push(now);
  return true;
}

export async function analyzeSymbol(symbol: string): Promise<Analysis> {
  if (!rateOk()) {
    return fallbackAnalysis(symbol, "研判请求过于频繁，请稍后再试。");
  }
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return fallbackAnalysis(symbol, "当前环境未接入模型，盘面与新闻仍可查看。");
  }

  let bundle;
  let news;
  try {
    [bundle, news] = await Promise.all([getBundle(symbol), getNews(symbol)]);
  } catch {
    return fallbackAnalysis(symbol, "行情或新闻拉取失败，稍后再试。");
  }

  const { quote, tech } = bundle;
  const headlines = news
    .slice(0, 8)
    .map((n) => {
      const when = n.publishedAt ? new Date(n.publishedAt).toISOString().slice(0, 10) : "";
      return `- [${n.source}] ${when} ${n.title}`;
    })
    .join("\n");

  const crypto = isCrypto(symbol);
  const prompt = `你是冷静的${crypto ? "加密货币" : "股票"}入场研究员，不是荐股主播。根据给定的行情摘要与新闻，判断「现在是否适合新开仓」。用简体中文回答。

硬性要求：
- 不承诺收益，不喊单，不编造未提供的数字。
- ${crypto ? "估值看相对历史分位、对比特币的强弱、杠杆与监管风险，不要编造市盈率。" : "估值若缺少 PE/PS，根据价格位置、新闻与常识给区间判断，并在 note 里标明依据弱。"}
- 默认读者是准备「现在入场」的个人投资者，仓位用占总资金百分比。
- ${crypto ? "强调 24 小时交易、波动远大于股票，建议更小仓位。" : ""}
- 只输出一个 JSON 对象，不要 markdown。

JSON 字段：
{
  "verdict": "enter|probe|wait|avoid",
  "headline": "不超过18字的判断",
  "summary": "不超过120字，说明为什么现在入或不入",
  "conviction": 1到5的整数,
  "horizon": "intraday|swing|position",
  "sizeMinPct": 数字,
  "sizeMaxPct": 数字,
  "invalidation": "何种价格或事件出现则观点失效",
  "entryPlan": "如何分批、等什么价或什么信号",
  "dimensions": {
    "sentiment": { "score": 0-100, "note": "不超过30字" },
    "catalyst": { "score": 0-100, "note": "不超过30字" },
    "momentum": { "score": 0-100, "note": "不超过30字" },
    "valuation": { "score": 0-100, "note": "不超过30字" },
    "liquidity": { "score": 0-100, "note": "不超过30字" },
    "macro": { "score": 0-100, "note": "不超过30字" }
  },
  "risks": [ { "title": "", "severity": "high|mid|low", "detail": "" } ],
  "watch": ["接下来盯的事项"],
  "riskScore": 0-100 越高风险越大
}

标的：${quote.symbol} ${quote.name} ${crypto ? "虚拟货币" : `交易所 ${quote.exchange}`} 货币 ${quote.currency}
现价：${quote.price}  日涨跌：${(quote.changePct * 100).toFixed(2)}%
52周：${quote.fiftyTwoWeekLow ?? "?"} ~ ${quote.fiftyTwoWeekHigh ?? "?"}
均线：SMA20=${tech.sma20 ?? "?"} SMA50=${tech.sma50 ?? "?"} SMA120=${tech.sma120 ?? "?"}
相对均线：vs20=${tech.vsSma20 ?? "?"} vs50=${tech.vsSma50 ?? "?"}
RSI14=${tech.rsi14 ?? "?"}  20日年化波动=${tech.vol20 ?? "?"}
5日收益=${tech.ret5d ?? "?"}  20日收益=${tech.ret20d ?? "?"}
距52周高=${tech.dist52wHigh ?? "?"}  量比=${tech.volumeRatio ?? "?"}

新闻（可能含中英文，按原样理解，不要翻译成事实以外的东西）：
${headlines || "（未取到新闻）"}`;

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.3,
        max_tokens: 1400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You output only valid JSON for a Chinese equity entry desk. No markdown.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      return fallbackAnalysis(symbol, `模型接口返回 ${res.status}，请稍后重试。`);
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return coerce(symbol, parsed);
  } catch {
    return fallbackAnalysis(symbol, "模型解析失败，请稍后重试。");
  }
}

function asBookVerdict(v: unknown): BookVerdict {
  return v === "hold" || v === "add" || v === "trim" || v === "rebalance" || v === "wait"
    ? v
    : "wait";
}

function fallbackBook(reason: string): BookAnalysis {
  return {
    generatedAt: Date.now(),
    verdict: "wait",
    headline: "暂无法完成组合研判",
    summary: reason,
    conviction: 1,
    riskScore: 60,
    concentration: "样本不足",
    action: "先核对持仓与行情，不要在信息缺失时调仓。",
    suggestions: [],
    risks: [{ title: "数据或模型不可用", severity: "mid", detail: reason }],
    watch: ["持仓市值变化", "最大个股权重"],
  };
}

export type BookSnapshot = {
  positions: Array<{
    symbol: string;
    name: string;
    qty: number;
    avgCost: number;
    price: number;
    currency: string;
    value: number;
    pnlPct: number;
    weight: number;
    changePct: number;
    rsi14: number | null;
    vsSma20: number | null;
  }>;
  totals: {
    currency: string;
    value: number;
    cost: number;
    pnl: number;
    pnlPct: number;
    realized: number;
    count: number;
    maxWeight: number;
    totalPnl?: number;
    totalPnlPct?: number;
    top3Weight?: number;
    winRate?: number;
  };
  headlines: string[];
};

export async function analyzeBook(snap: BookSnapshot): Promise<BookAnalysis> {
  if (!rateOk()) return fallbackBook("研判请求过于频繁，请稍后再试。");
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return fallbackBook("当前环境未接入模型，账本数字仍可查看。");
  if (!snap.positions.length) return fallbackBook("还没有持仓，先登记仓位再做整体研判。");

  const lines = snap.positions
    .map((p) => {
      const w = (p.weight * 100).toFixed(1);
      const pnl = (p.pnlPct * 100).toFixed(1);
      const chg = (p.changePct * 100).toFixed(2);
      return `- ${p.symbol} ${p.name} 数量${p.qty} 成本${p.avgCost} 现价${p.price} ${p.currency} 市值${p.value.toFixed(0)} 浮盈${pnl}% 权重${w}% 日涨跌${chg}% RSI=${p.rsi14 ?? "?"} vs20=${p.vsSma20 ?? "?"}`;
    })
    .join("\n");

  const t = snap.totals;
  const prompt = `你是冷静的组合研究员。根据投资者自己登记的持仓与现价，判断「现在这本账该如何处理」。用简体中文。

硬性要求：
- 不承诺收益，不喊单，不编造未提供的数字。
- 仓位权重已给出，不要自己重算市值。
- 只输出一个 JSON 对象。

JSON 字段：
{
  "verdict": "hold|add|trim|rebalance|wait",
  "headline": "不超过18字",
  "summary": "不超过120字，评组合结构与盈亏质量",
  "conviction": 1到5的整数,
  "riskScore": 0-100 越高风险越大,
  "concentration": "不超过40字，点名是否过重",
  "action": "不超过80字，现在该加、减还是再平衡",
  "suggestions": [ { "symbol": "代码", "move": "加仓|减仓|持有|观望", "detail": "不超过40字" } ],
  "risks": [ { "title": "", "severity": "high|mid|low", "detail": "" } ],
  "watch": ["接下来盯的事项"]
}

总计货币 ${t.currency} 市值 ${t.value} 成本 ${t.cost} 浮盈 ${t.pnl} (${(t.pnlPct * 100).toFixed(2)}%) 已实现 ${t.realized} 总盈亏 ${t.totalPnl ?? t.pnl + t.realized} (${(((t.totalPnlPct ?? t.pnlPct) * 100).toFixed(2))}%)
持仓只数 ${t.count} 最大权重 ${(t.maxWeight * 100).toFixed(1)}% 前三集中 ${( ((t.top3Weight ?? 0) * 100).toFixed(1) )}% 持仓胜率 ${(((t.winRate ?? 0) * 100).toFixed(0))}%

持仓明细：
${lines}

新闻标题（可能含中英文，不要当成已核实事实）：
${snap.headlines.join("\n") || "（未提供）"}`;

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.3,
        max_tokens: 1100,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You output only valid JSON for a Chinese portfolio desk. No markdown.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return fallbackBook(`模型接口返回 ${res.status}，请稍后重试。`);
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const raw = JSON.parse(text) as Record<string, unknown>;
    const suggestionsRaw = Array.isArray(raw.suggestions) ? raw.suggestions : [];
    const suggestions = suggestionsRaw.slice(0, 8).map((s) => {
      const item = (s ?? {}) as Record<string, unknown>;
      return {
        symbol: String(item.symbol ?? "").slice(0, 24),
        move: String(item.move ?? "观望").slice(0, 8),
        detail: String(item.detail ?? "").slice(0, 80),
      };
    });
    const risksRaw = Array.isArray(raw.risks) ? raw.risks : [];
    const risks = risksRaw.slice(0, 6).map((r) => {
      const item = (r ?? {}) as Record<string, unknown>;
      const sev: Severity =
        item.severity === "high" ? "high" : item.severity === "low" ? "low" : "mid";
      return {
        title: String(item.title ?? "风险").slice(0, 40),
        severity: sev,
        detail: String(item.detail ?? "").slice(0, 160),
      };
    });
    const watch = (Array.isArray(raw.watch) ? raw.watch : [])
      .map((w) => String(w).slice(0, 80))
      .filter(Boolean)
      .slice(0, 5);
    return {
      generatedAt: Date.now(),
      verdict: asBookVerdict(raw.verdict),
      headline: String(raw.headline ?? "").slice(0, 48) || "组合研判",
      summary: String(raw.summary ?? "").slice(0, 280) || "模型未给出综述。",
      conviction: clamp(raw.conviction, 1, 5, 3),
      riskScore: clamp(raw.riskScore, 0, 100, 50),
      concentration: String(raw.concentration ?? "").slice(0, 80) || "—",
      action: String(raw.action ?? "").slice(0, 160) || "—",
      suggestions,
      risks: risks.length
        ? risks
        : [{ title: "模型未列出风险", severity: "mid", detail: "请结合自身风控。" }],
      watch: watch.length ? watch : ["最大个股权重", "组合回撤"],
    };
  } catch {
    return fallbackBook("模型解析失败，请稍后重试。");
  }
}

