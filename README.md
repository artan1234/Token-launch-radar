# Token Radar — Build the best token launch radar (make.fun, token-radar-01)

A web dashboard that ranks pre-token DeFi protocols by the implied value of
a token launch, with a concrete farm plan for every protocol.

- **Bounty:** Build the best token launch radar (`token-radar-01`), $1,325 USDC,
  10 places paid (1st $1,000). Deadline Mon Dec 14, 2026 10:00 UTC. Escrow locked.
- **Snapshot:** DefiLlama protocol index, fetched 2026-11-14 (`notes/snapshot.json`,
  758 protocols, watchlist floor $50,000,000, 40 watchlist protocols).
- **Board:** 178 rows — all 40 watchlist protocols + 138 pre-token protocols
  below the floor. Total implied value $3.21B. Top: Steakhouse Financial
  ($615.2M), Gauntlet ($366.4M), Veda ($352.3M).
- **Status:** built locally, **not submitted**. Submission needs a GitHub repo,
  a Discord account and a linked Solana wallet (see below).

## Run it

Requires Node.js 22.18+ (tested on Node v24.22.1, no dependencies, stdlib only).

```sh
# from the repo root, with the sealed snapshot at notes/snapshot.json:
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input notes/snapshot.json
# then open out/dashboard/index.html in a browser (no server, no network)
```

In the grader, the program reads `/input/snapshot.json` and writes to `/output`:
`board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`.
It is deterministic: two runs write identical bytes (verified).

## Methodology (model `radar-2`, in `lib/model.ts`)

One function scores every row, from the snapshot's own figures only — no
protocol name is ever special-cased:

```
implied = round( tvl_usd x comp_multiple x growth_mult x maturity_mult x breadth_mult )
```

| Factor | Definition |
|---|---|
| `comp_multiple` | Category comparable: the **median** market-cap / TVL ratio of the live-token protocols in the same category (at least 3 comps), clamped to 0.08–1.20. Categories with fewer than 3 live comps use the global median (0.246). Median, not mean, so one outlier cannot set the price. One live record carries mcap −1 and is excluded as non-positive. |
| `growth_mult` | `1 + clamp(change_7d, -60, 120) / 100 x 0.5` |
| `maturity_mult` | `0.6 + min(age_days, 1095) / 1095 x 0.4`, age = days since DefiLlama first listed the protocol (365 when unlisted) — how long it has run with no token. |
| `breadth_mult` | `1 + 0.03 x min(chains - 1, 5)` — 1.00–1.15 for multi-chain protocols. |

Pre-token means the record carries no market cap, no CoinGecko id and no
symbol. Every board row also passes the watchlist's own exclusion rule (not a
wrapped / staked / bridged product, not a CEX, not a versioned pool), so the
early radar below the floor is held to the same standard as the watchlist.
Live-token protocols are set aside in their own tab with their market caps
shown — the board never mixes "already trades" with "still to come".

The dashboard recomputes each row's implied value in the page (`impliedOf`
in `dashboard/app.js`) and shows whether it matches `board.json`.

**What this is not:** an implied value is the entry's own model claim, never
make.fun's, and never a prediction that a token will launch, or when. A
protocol that "records no token" may still have one its DefiLlama record
does not carry.

## Farm plans

Every row carries 7 farm steps (20–600 characters each), derived from the
protocol's own record (category, chains, TVL, age): a fresh wallet, the
category-specific action with a concrete capital amount ($50–$250) and gas
cost, a weekly qualifying action (including a second chain when available),
a hold period (30–60 days by age), a weekly points check, claiming only from
the protocol's own published link, and a farm log.

## Dashboard

Static, offline, no framework: `dashboard/index.html` + `app.css` + `app.js`
(33 KB total, under the 64 KB dossier-text cap), reading `data.js` written
beside it by `main.ts`. Search, sort (implied value / TVL / 7d growth / age /
name), filter by category and chain, watchlist-only toggle, Pre-token / Live
token tabs, a top-5 spotlight, a detail view for every protocol (model
working + 7-step farm plan, deep-linkable via `#p=<slug>`), and a category
comparables table.

## Files

```
main.ts                  entry point (Node 22, stdlib only)
lib/model.ts             the radar-2 model, board builder, farm plans
vendor/makefun-board.ts  make.fun dossier library, copied verbatim from the kit
dashboard/               index.html, app.css, app.js (static, no network)
screenshots/             1-board.png, 2-detail.png, 3-filtered.png (1440x900)
notes/                   kit notes: skill.md, competition + requirements JSON,
                         kit.json, snapshot.json (the sealed input, read-only)
```

Screenshots were taken locally with Playwright + Chromium headless
(1440x900). They are 156–217 KB PNGs — under the 512 KiB gate cap; the
guidance target is 300–350 KB, which a PNG of this dark, mostly-flat UI does
not reach without padding, so no bytes were added artificially.

## How to submit (for Bosku — not done)

1. Create a **public GitHub repo** (after the competition opened, 2026-11-14),
   MIT licensed, push this tree, note the commit SHA.
2. Sign in to make.fun with **Discord**, link the **GitHub** account and a
   **Solana wallet** (e.g. Phantom) — the prize is claimed in USDC on Solana
   to the wallet that signs the entry.
3. On the bounty page, enter the repo URL + commit SHA, upload the agent
   transcripts bundle (made by the kit CLI: `node cli/makefun.mjs bundle`),
   and submit before Mon Dec 14, 2026 10:00 UTC. At most 5 submissions a day,
   10 in all; the last one before the deadline is final.
4. Never share a wallet seed phrase or password with anyone — make.fun only
   ever asks the wallet to sign, never to reveal its seed.

## Sources

- Kit: `https://make.fun/api/competitions/token-radar-01/kit`
  (tarball `/c/token-radar-01/kit`, bundle sha256
  `ea1c9dccab78e6846655e81b921a79465c7267677ea2e0908624ddbc8a012d43`)
- Guide: `https://make.fun/skill.md` (v1.5.272)
- Competition API: `https://make.fun/api/competitions/token-radar-01`
