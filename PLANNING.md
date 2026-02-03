# Ember Vote Arena - Planning Document

## One-Liner (5-year-old test)
People can make voting contests about anything, vote with EMBER tokens, and winners get prizes.

## Problem Statement
No way for EMBER holders to create and participate in community voting markets. Existing voting platforms (JokeRace) don't integrate with EMBER tokenomics (staking, burning, drip rewards).

## Success Criteria
- [ ] Users can create voting markets for 100K EMBER (burned)
- [ ] Entries cost configurable EMBER (default 10K), goes to prize pool
- [ ] AI oracle (Ember) filters entries based on market rules
- [ ] Bonding curve makes late votes more expensive (~5x by end)
- [ ] Fair payouts: 1st (55%), 2nd (20%), 3rd (10%), stakers (10%), initiator (5%)
- [ ] Zap feature accepts any Base token, swaps to EMBER
- [ ] Instant results when voting ends

## Scope

### IN Scope
- Market creation with EMBER fee (burned)
- Entry submission with fee (to pot)
- Voting with EMBER (bonding curve pricing)
- Off-chain oracle filtering (Ember signature)
- Configurable entry/voting phases
- Tie handling (split prizes)
- Payout distribution to winners, stakers, initiator
- Zap via Kyber aggregator (10% slippage max)

### OUT of Scope (v1)
- On-chain Kleros integration (manual dispute path only)
- Multiple voting tokens
- Delegation
- Quadratic voting

### Non-Goals
- Replace JokeRace (we're EMBER-native)
- Support non-Base chains

## Architecture

### Contracts
1. **EmberVoteArenaFactory.sol** - Creates markets, manages oracle
2. **EmberVoteMarket.sol** - Individual market logic
3. **EmberVoteZap.sol** - Token swap integration

### Flow
```
1. Creator calls createMarket(title, rules, entryCost, entryDuration, voteDuration)
   → 100K EMBER burned
   → Market deployed

2. Entry Phase:
   → Users submit entries via submitEntry(data, signature)
   → Oracle (Ember) validates off-chain, provides signature
   → Entry fee to pot (even if filtered)
   → Filtered entries marked but still pay

3. Voting Phase:
   → Users vote via vote(entryId, amount)
   → Bonding curve: price = base * (1 + totalVotes/param)^exp
   → Votes recorded, leaderboard updated

4. Resolution:
   → Anyone calls resolve() after votingEnd
   → Top 3 determined, ties split
   → Payouts: 55% 1st, 20% 2nd, 10% 3rd, 10% drip, 5% initiator
   → Single entry: refund entry + votes back
```

### Bonding Curve
```solidity
// Price increases as more votes cast
// curveParam and exponent are configurable (owner can adjust)
uint256 price = baseCost * (1e18 + (totalVotes * 1e18 / curveParam)) ** exponent / 1e18;

// Default: curveParam = 10000, exponent = 2
// At 10K total votes: price = base * 4x
// At 20K total votes: price = base * 9x
```

### Oracle Signature
```solidity
// Ember signs: keccak256(marketId, entryId, entryData, approved)
// Contract verifies signature from trusted oracle address
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Oracle centralization | High | Document dispute path, plan for Kleros v2 |
| Bonding curve gaming | Medium | Configurable params, can adjust post-launch |
| Zap slippage MEV | Medium | 10% max slippage, user confirms |
| Single entry edge case | Low | Clear refund logic |
| Tie manipulation | Low | Ties split fairly, no advantage |

## Milestones

| Phase | Task | Estimate |
|-------|------|----------|
| 1 | Contract architecture + core logic | 2 hours |
| 2 | Bonding curve + payouts | 1 hour |
| 3 | Zap integration | 1 hour |
| 4 | Tests (90%+ coverage) | 2 hours |
| 5 | 3x self-audit + slither | 1.5 hours |
| 6 | Testnet deploy | 30 min |
| 7 | External audit request | - |
| 8 | Mainnet deploy | 30 min |
| 9 | Frontend | 3 hours |

## Go/No-Go Checklist
- [x] One-liner clear
- [x] Problem understood
- [x] Scope bounded
- [x] Risks identified
- [x] Brian approved spec
- [x] Framework cloned
- [ ] Start coding

## Dependencies
- EMBER token: `0xFf18CbE8b299465731D1C1536B7A8f8F4aa5e2Cf` (Base)
- EMBER Drip contract: Use existing 30-day drip
- Kyber Aggregator on Base

## Notes
- JokeRace reference: https://github.com/jk-labs-inc/jokerace-v3
- Inspired by JokeRace's Governor pattern but EMBER-native
