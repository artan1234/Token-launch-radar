// Token Radar model v2 ("radar-2"): snapshot in, ranked board out.
//
// Board = every watchlist slug (the floor, never the ceiling) + every other
// pre-token protocol below the floor that passes the watchlist's own
// exclusion rule (not a wrapped/staked/bridged product, not a CEX, not a
// versioned pool). That is 40 + 138 = 178 rows in this snapshot.
//
// Implied value follows ONLY from the snapshot's own figures, never from a
// hard-coded list of names. One function scores every row:
//
//   implied = round( tvl_usd x comp_multiple x growth_mult x maturity_mult x breadth_mult )
//
//   comp_multiple  Category comparable: the MEDIAN market-cap/TVL ratio of
//                    the live-token protocols in the same category (n >= 3
//                    comps required), clamped to [0.08, 1.20]. Categories
//                    with fewer than 3 live comps fall back to the global
//                    median (0.241 in this snapshot). A median is used, not
//                    a mean, so one outlier token cannot set the price.
//                    Risk Curators, for example, has only 1 live comp, so
//                    it correctly falls back to the global median instead
//                    of trusting a single 2.98x outlier.
//   growth_mult    1 + clamp(change_7d, -60, 120) / 100 x 0.5
//   maturity_mult  0.6 + min(age_days, 1095) / 1095 x 0.4, where age_days is
//                    days since DefiLlama first listed the protocol (365
//                    when unlisted). Older, longer-running with no token
//                    scores higher: it has survived longer without one.
//   breadth_mult   1 + 0.03 x min(chains - 1, 5): 1.00-1.15 for protocols
//                    live on more chains.
//
// Live-token protocols are never ranked: they are set aside with their
// market cap shown, so the board separates "already trades" from "still
// to come". A protocol is pre-token when its record carries no market cap,
// no CoinGecko id and no symbol. The dashboard says "records no token",
// never "has no token": DefiLlama's record is not proof.

export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot {
  as_of: string; source: string; floor_usd: number;
  protocols: SnapshotProtocol[]; watchlist: string[];
}
export interface ModelConstants {
  growth_weight: number; growth_floor: number; growth_cap: number;
  maturity_floor: number; maturity_range: number; maturity_days: number;
  unknown_age_days: number; comp_min_n: number; comp_floor: number;
  comp_cap: number; breadth_per_chain: number; breadth_max_chains: number;
}
export const MODEL: ModelConstants = {
  growth_weight: 0.5, growth_floor: -60, growth_cap: 120,
  maturity_floor: 0.6, maturity_range: 0.4, maturity_days: 1095,
  unknown_age_days: 365, comp_min_n: 3, comp_floor: 0.08, comp_cap: 1.2,
  breadth_per_chain: 0.03, breadth_max_chains: 5,
};
export const MODEL_VERSION = 'radar-2';
export const LIVE_ROWS = 24;

export interface FarmStep { text: string; cost: string; time: string; }
export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null;
  chains: string[]; tvl_usd: number; change_7d: number | null;
  mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null;
  token_status: 'pre-token'; on_watchlist: boolean; age_days: number | null;
  implied_value_usd: number;
  model: {
    comp_multiple: number; comp_n: number; comp_median: number | null;
    growth_pct: number; growth_multiplier: number;
    maturity_multiplier: number; breadth_multiplier: number; age_days: number | null;
  };
  farm_steps: string[];
}
export interface RadarRow {
  rank: number; slug: string; name: string; category: string | null;
  chains: string[]; tvl_usd: number; change_7d: number | null;
  mcap_usd: number | null; listed_at: string | null; age_days: number | null;
  implied_value_usd: number; on_watchlist: boolean;
  comp_multiple: number; comp_n: number;
  growth_multiplier: number; maturity_multiplier: number; breadth_multiplier: number;
}
export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number | null; change_7d: number | null;
}
export interface CompRow { category: string; n: number; median: number; multiple: number; }
export interface RadarData {
  as_of: string; source: string; floor_usd: number; model: ModelConstants;
  model_version: string; watchlist_size: number; board_size: number;
  early_size: number; live_size: number; global_median: number;
  comps: CompRow[]; rows: RadarRow[]; live: LiveRow[];
}
export class SnapshotError extends Error {
  constructor(m: string) { super(m); this.name = 'SnapshotError'; }
}
const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
function finite(v: unknown, fb: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`), b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}
/** Median mcap/TVL per category over live-token protocols, plus the global median. */
export function comparables(snapshot: Snapshot, model: ModelConstants = MODEL): { byCat: Map<string, { n: number; median: number }>; global: number } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0 || p.category === 'CEX') continue;
    all.push(p.mcap_usd / p.tvl_usd);
    const arr = byCat.get(p.category ?? 'Other') ?? [];
    arr.push(p.mcap_usd / p.tvl_usd); byCat.set(p.category ?? 'Other', arr);
  }
  const out = new Map<string, { n: number; median: number }>();
  for (const [c, xs] of byCat) out.set(c, { n: xs.length, median: median(xs) });
  return { byCat: out, global: all.length ? median(all) : 0.25 };
}
export function compMultiple(category: string | null, comps: { byCat: Map<string, { n: number; median: number }>; global: number }, model: ModelConstants = MODEL): { multiple: number; n: number; median: number | null } {
  const c = comps.byCat.get(category ?? 'Other');
  if (c && c.n >= model.comp_min_n) {
    return { multiple: round4(Math.min(model.comp_cap, Math.max(model.comp_floor, c.median))), n: c.n, median: round4(c.median) };
  }
  return { multiple: round4(comps.global), n: c?.n ?? 0, median: c ? round4(c.median) : null };
}
export function impliedValue(p: SnapshotProtocol, asOf: string, comps: { byCat: Map<string, { n: number; median: number }>; global: number }, model: ModelConstants = MODEL): { implied: number; comp: { multiple: number; n: number; median: number | null }; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageFor = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageFor, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_chains);
  const comp = compMultiple(p.category, comps, model);
  const implied = Math.max(1, Math.round(p.tvl_usd * comp.multiple * growthMult * maturityMult * breadthMult));
  return { implied, comp, growthPct, growthMult, maturityMult, breadthMult, age };
}
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATS = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}
/** Passes the watchlist's own exclusion rule: pre-token, not a wrapped /
 * staked / bridged product, not a CEX, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !EXCLUDED_CATS.has(p.category ?? '') && !VERSIONED.test(p.name) && !WRAPPED_WORD.test(p.name) && !EXCHANGE_PREFIX.test(p.name);
}
function bySlug(ps: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(ps.map((p) => [p.slug, p]));
}
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = comparables(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Early radar: EVERY strict pre-token protocol below the floor (138 here),
  // by TVL — the floor is where the house started, not where the radar stops.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  for (const p of early) chosen.set(p.slug, p);
  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, comps, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((s, i) => ({
    rank: i + 1, slug: s.p.slug, name: s.p.name, category: s.p.category,
    chains: s.p.chains, tvl_usd: s.p.tvl_usd, change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd, listed_at: s.p.listed_at, gecko_id: s.p.gecko_id,
    symbol: s.p.symbol, token_status: 'pre-token' as const,
    on_watchlist: snapshot.watchlist.includes(s.p.slug), age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      comp_multiple: s.comp.multiple, comp_n: s.comp.n, comp_median: s.comp.median,
      growth_pct: s.growthPct, growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult), breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}
function chainOf(p: SnapshotProtocol): string { return p.chains.length > 0 ? p.chains[0]! : 'its main chain'; }
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase(), name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}
/** Seven concrete farm steps, derived from the protocol's own record
 * (category, chains, TVL, age) — never from a hand-written list of names. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(age);
  const second = p.chains.length > 1 ? ` Repeat the deposit on ${p.chains[1]} so the position is counted on two chains.` : ` Use the protocol on a second supported chain when it opens one.`;
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.${second}`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Check the protocol's own points or rewards page weekly and note the points balance in your farm log.`, cost: 'no fee to check', time: '5 minutes a week' },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
  ];
}
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank, slug: row.slug, name: row.name, category: row.category,
    chains: row.chains, tvl_usd: row.tvl_usd, change_7d: row.change_7d,
    mcap_usd: row.mcap_usd, listed_at: row.listed_at, age_days: row.age_days,
    implied_value_usd: row.implied_value_usd, on_watchlist: row.on_watchlist,
    comp_multiple: row.model.comp_multiple, comp_n: row.model.comp_n,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = comparables(snapshot, model);
  const compRows: CompRow[] = [...comps.byCat.entries()]
    .filter(([, v]) => v.n >= 1)
    .map(([category, v]) => ({ category, n: v.n, median: round4(v.median), multiple: compMultiple(category, comps, model).multiple }))
    .sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : 1));
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
    model, model_version: MODEL_VERSION, watchlist_size: snapshot.watchlist.length,
    board_size: board.length, early_size: board.filter((r) => !r.on_watchlist).length,
    live_size: live.length, global_median: round4(comps.global),
    comps: compRows, rows: board.map(radarRow), live,
  };
  return { board, radar };
}
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    return {
      slug: p.slug, name: p.name, category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd, change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return `all ${board.length} rows share the same implied value`;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
