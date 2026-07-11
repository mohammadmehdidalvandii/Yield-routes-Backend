# Depositor position page with unrealised yield

**Complexity**: medium

## Summary
Add `GET /api/v1/vault/depositor/:address` that returns shares held, current value, and estimated unrealised yield since deposit.

## Acceptance criteria
- [ ] Returns `{ shares, sharePrice, currentValue, deposits, estimatedYield }`
- [ ] `estimatedYield = currentValue - totalDepositedAmount`
- [ ] Frontend: add `/vault/my-position` page showing this data for connected wallet

## Stellar Wave
Points: 150 | Complexity: 🟡 Medium
