# Kit notes — token-radar-01

Fetched 2026-11-23 from the official endpoints (no guessing):

- Guide: https://make.fun/skill.md — version 1.5.272, 302,120 bytes
- Competition: https://make.fun/api/competitions/token-radar-01
  - $1,325 USDC, 10 places (1st $1,000, 2nd–5th $50, 6th–10th $25)
  - Deadline 2026-12-14T10:00:00Z, published 2026-11-14T10:00:00Z
  - 27,655 submissions at fetch time; escrow locked (per the competition API response)
- Requirements: https://make.fun/api/competitions/token-radar-01/requirements
- Kit JSON: https://make.fun/api/competitions/token-radar-01/kit
  - bundle_sha256 ea1c9dccab78e6846655e81b921a79465c7267677ea2e0908624ddbc8a012d43
  - tarball https://make.fun/c/token-radar-01/kit (8.0 MB, sha verified against kit.json)
- Kit contents used: `starter/main.ts`, `starter/lib/model.ts` (base model,
  replaced by radar-2 in lib/model.ts), `starter/vendor/makefun-board.ts`
  (copied verbatim to vendor/), `starter/dashboard/*` (rebuilt),
  `input/snapshot.json` (copied here as snapshot.json, read-only),
  `input/README.md`, `RULES.txt` (same rules as the competition API `rules` field).

## Snapshot

- as_of 2026-11-14, source: DefiLlama https://api.llama.fi/protocols,
  fetched 2026-11-14T01:18:33.201Z
- 758 protocols (TVL >= $5,000,000), floor $50,000,000
- watchlist: 40 slugs (see snapshot.json)
- 342 protocols record no token; strict early radar below the floor: 138
- One live record is dirty: `autofinance` carries mcap_usd -1; the model
  excludes non-positive mcap/TVL ratios from comparables.

## Gate (7 checks, from RULES.txt)

1. dashboard_files: index.html + >=1 .css + >=1 .js, <=400 files / 4 MiB,
   no http:// or https:// in HTML attrs, style bodies, script imports, CSS, JS imports.
2. board_file: 100–4,000 rows, slug in snapshot, non-empty name, positive
   whole rank, positive whole implied_value_usd <= 1e14, farm_steps present.
3. sorted_by_value: ranks exactly 1..N, implied value non-increasing by rank,
   not all equal.
4. coverage: every watchlist slug present.
5. farm_steps: 3–12 steps per row, each 20–600 chars trimmed.
6. screenshots: 3–4 images, <=512 KiB each, whole PNG/JPEG, long side
   <=1440, short side >=800.
7. dossier_matches: dossier.json byte-identical to buildDossier('/output',
   {text_max_bytes: 65536}), <=1.5 MiB.

Dashboard source must stay under 64 KB so the judge reads it whole from the
dossier text (ours: 33 KB). Screenshots guidance 300–350 KB each; ours are
156–217 KB PNGs (see README — under the 512 KiB cap, no padding added).
