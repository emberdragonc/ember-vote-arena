# 🐉 Ember Vote Arena

Community voting markets powered by EMBER token on Base.

## Overview

Ember Vote Arena lets users create voting markets on any topic. Users stake EMBER to vote, and winners share the pot.

**Features:**
- 🗳️ Create custom voting markets (100K EMBER to create, burned)
- 📝 Submit entries with AI oracle filtering
- 💰 Vote with EMBER (bonding curve pricing)
- 🏆 Fair payouts: 55% 1st, 20% 2nd, 10% 3rd, 10% stakers, 5% initiator
- ⚡ Zap from any Base token to EMBER

## How It Works

1. **Create Market** - Pay 100K EMBER (burned) to create a voting market with custom rules
2. **Entry Phase** - Submit entries (10K EMBER default). AI oracle filters based on market rules
3. **Voting Phase** - Vote for entries. Bonding curve makes late votes more expensive (~5x)
4. **Resolution** - Anyone can resolve after voting ends. Payouts distributed automatically

## Contracts

- `EmberVoteArena.sol` - Main market logic (creation, entries, voting, resolution)
- `EmberVoteZap.sol` - Swap any token to EMBER for participation

## Addresses

### Base Mainnet
Coming soon after audit...

### Base Sepolia (Testnet)
Coming soon...

## Build & Test

```bash
# Install dependencies
forge install

# Build
forge build

# Test
forge test

# Test with verbosity
forge test -vvv

# Coverage
forge coverage
```

## Deploy

```bash
# Set environment
export PRIVATE_KEY=0x...
export ETHERSCAN_API_KEY=...
export BASE_RPC_URL=https://mainnet.base.org

# Deploy to testnet
forge script script/Deploy.s.sol --rpc-url base-sepolia --broadcast --verify

# Deploy to mainnet (after audit)
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
```

## Architecture

### Bonding Curve
```
price = baseCost * (1 + totalVotes/curveParam)^exponent
```
Default: `curveParam=10000`, `exponent=2` → ~5x price increase as votes accumulate

### Oracle Signature
Entries require an off-chain signature from the oracle (Ember 🐉) confirming the entry meets market rules:
```
messageHash = keccak256(marketId, entryData, approved)
signature = oracle.sign(ethSignedMessageHash)
```

### Payout Distribution
| Recipient | Share |
|-----------|-------|
| 1st Place | 55% |
| 2nd Place | 20% |
| 3rd Place | 10% |
| EMBER Stakers | 10% |
| Market Initiator | 5% |

Ties split combined prizes equally.

## Security

- [ ] 3x Self-Audit with AUDIT_CHECKLIST.md
- [ ] Slither static analysis
- [ ] External audit by @clawditor and @dragon_bot_z
- [ ] Testnet deployment + testing

## License

MIT

## Links

- [EMBER Token](https://basescan.org/token/0xFf18CbE8b299465731D1C1536B7A8f8F4aa5e2Cf)
- [Ember Staking](https://ember.engineer/staking)
- [Built by Ember 🐉](https://twitter.com/emberclawd)
