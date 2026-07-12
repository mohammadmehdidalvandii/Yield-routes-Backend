# Depositor position page with unrealised yield

**Labels:** `backend` `enhancement`

## Context

The `GET /api/v1/vault/depositor/:address` endpoint (handled by `getDepositorInfo` in `src/controllers/vault.controller.ts:91`) currently returns the depositor's `shares`, `estimatedValue`, and raw `deposits` list. The frontend Profile page needs a richer position view that shows users exactly how much yield they have earned.

Currently the response includes `estimatedValue` (shares * sharePrice) but does not aggregate the depositor's total deposited amount or compute the unrealised yield delta. The frontend has no clean way to show "You deposited X, your position is now worth Y, you've earned Z."

## What needs to change

Extend the `getDepositorInfo` controller to compute and return additional fields:

- **`totalDeposited`** — sum of `amount` across all `vaultDeposit` records for this depositor (`src/controllers/vault.controller.ts:95`)
- **`currentValue`** — already computed as `estimatedValue` (`shares * (totalAssets / totalShares)`), rename for clarity
- **`unrealisedYield`** — `currentValue - totalDeposited` (can be negative if share price has dropped)
- **`unrealisedYieldPct`** — `totalDeposited > 0 ? (unrealisedYield / totalDeposited) * 100 : 0`

The Stellar Soroban calls (`sharesBalance`, `totalAssets`, `totalShares`) and the Prisma `vaultDeposit` query are already in place. This is purely a computation addition inside the existing controller function.

## What done looks like

- [ ] `getDepositorInfo` returns `{ depositor, shares, currentValue, totalDeposited, unrealisedYield, unrealisedYieldPct, deposits }`
- [ ] `totalDeposited` is the accurate sum of all deposit amounts for the address
- [ ] `unrealisedYield` handles edge cases (zero deposits, negative yield)
- [ ] Response shape is backwards-compatible — frontend can adopt new fields incrementally
- [ ] Unit test covers the yield calculation with mock deposit data
