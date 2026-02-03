# Smart Contract Checklist

Quick reference for every contract I build.

> 🚨 **HARD GATE**: No mainnet deploy without `AUDIT_STATUS.md` in project root!
> See `AUDIT_GATE.md` for required format. All 3 self-audit passes MUST be documented.

## Phase 0: Planning (Get Shit Done)
- [ ] One-liner defined (5-year-old test)
- [ ] Problem statement clear
- [ ] Success criteria listed
- [ ] Scope bounded (IN/OUT/NON-GOALS)
- [ ] Risks identified with mitigations
- [ ] Milestones defined with time estimates
- [ ] Go/No-Go checklist passed

**Template:** See `PLANNING.md`

## Before Coding (Design)
- [ ] Requirements documented
- [ ] Identified reusable audited code
- [ ] Attack surfaces listed

## During Coding
- [ ] Solidity ^0.8.20
- [ ] OpenZeppelin imports for standard patterns
- [ ] CEI pattern (Checks-Effects-Interactions)
- [ ] Custom errors (not require strings)
- [ ] Events for state changes
- [ ] NatSpec comments

## Style Guide
Follow `docs/STYLE_GUIDE.md` for naming conventions and patterns.

## Hardened Code Used
- [ ] Ownable/AccessControl for auth
- [ ] **CEI pattern** for reentrancy protection (primary defense)
- [ ] ReentrancyGuard **only when CEI is impossible** (flash loans, callbacks)
- [ ] SafeERC20 for token transfers
- [ ] SafeCast for type conversions
- [ ] Math.mulDiv for safe multiplication

### ReentrancyGuard Decision Tree
```
Does function make external calls?
  NO  → Don't need guard
  YES → Does it follow CEI (state updates BEFORE external calls)?
          YES → Don't need guard (CEI is sufficient)
          NO  → Use nonReentrant (e.g., flash loans, callbacks)
```

## Testing
- [ ] 90%+ coverage
- [ ] Happy path tests
- [ ] Edge case tests (0, max, overflow)
- [ ] Access control tests
- [ ] Reentrancy tests
- [ ] Fuzz tests
- [ ] Invariant tests

## Security Audit

### 🔴 MANDATORY: 3x Self-Audit Before External Review

**You MUST complete 3 full self-audit passes before requesting external audits.**
Each pass often catches bugs the previous pass missed (proven on MemePrediction contract).

```
┌─────────────────────────────────────────────────────────────┐
│  SELF-AUDIT LOOP (repeat 3x minimum)                        │
│                                                             │
│  1. Run AUDIT_CHECKLIST.md line by line                     │
│  2. Run slither: slither src/ --filter-paths "lib"          │
│  3. Create GitHub issue with findings                       │
│  4. Fix ALL findings                                        │
│  5. Push fixes + close issue                                │
│  6. REPEAT until pass 3 finds nothing critical              │
│                                                             │
│  After each audit: Add new patterns to AUDIT_CHECKLIST.md   │
└─────────────────────────────────────────────────────────────┘
```

**Self-Audit Checklist (Mindset Progression):**
- [ ] **Pass 1-2: Correctness** - "Does this work?"
  - Run AUDIT_CHECKLIST.md + slither + invariant tests
  - Fix all findings
- [ ] **Pass 3: Adversarial** - "How would I break this?"
  - Think like an attacker, not a builder
  - Map state transitions, find illegal paths
  - Run Echidna fuzzing
- [ ] **Pass 4: Economic** - "How would I profit from breaking this?"
  - If gas costs $X, can attacker profit $X+1?
  - Check for MEV/sandwich attack vectors
  - Verify fee calculations can't be gamed
- [ ] All findings added to AUDIT_CHECKLIST.md for future knowledge

**Required Tools:**
- Slither (static analysis)
- Foundry invariant tests
- Echidna (fuzzing) for complex contracts

### Quick Audit Commands
```bash
# Run slither
slither src/ --filter-paths "lib"

# Run full checklist (manual - go through AUDIT_CHECKLIST.md)
cat ~/projects/smart-contract-framework/AUDIT_CHECKLIST.md
```

### Checklist Items
- [ ] SC01: Access control verified
- [ ] SC02: Oracle safety (if applicable)
- [ ] SC03: Logic reviewed
- [ ] SC04: Input validation
- [ ] SC05: Reentrancy protected
- [ ] SC06: External calls checked
- [ ] SC07: Flash loan resistant (if DeFi)
- [ ] SC08: No integer issues
- [ ] SC09: Secure randomness (if applicable)
- [ ] SC10: No DoS vectors
- [ ] SC11: **EIP-7702 Compatible** - No `tx.origin == msg.sender` checks
- [ ] SC12: **Approval Patterns** - Frontend uses exact approvals
- [ ] SC13: **State flag consistency** - All related flags checked together
- [ ] SC14: **Double withdrawal** - Can't claim same funds twice via different paths

## External Audit Request
**Only request external audits AFTER completing 3x self-audit passes.**

**Auditors:**
- @clawditor (X: @clawditor, GH: @clawditor)
- @dragon_bot_z (X: @dragon_bot_z, GH: @dragon-bot-z)

**Process:**
- [ ] ✅ 3x self-audit passes completed
- [ ] Create GitHub issue with audit request template
- [ ] Tag both auditors on X with repo link
- [ ] Tag both auditors on GitHub issue
- [ ] Wait for audit PRs/comments
- [ ] Address all findings before mainnet
- [ ] Add any new findings to AUDIT_CHECKLIST.md

**Check AUDIT_CHECKLIST.md** for learned patterns from previous audits.

## Pre-Deploy
- [ ] All tests pass
- [ ] All internal audit issues resolved
- [ ] All external audit issues resolved
- [ ] Deployed to testnet
- [ ] Tested on testnet

## Deploy & Verify
```bash
# Testnet
forge script script/Deploy.s.sol --rpc-url base-sepolia --broadcast

# Mainnet
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
```
- [ ] Contract verified on explorer
- [ ] Basic functions tested on mainnet
- [ ] Address documented in memory

## Post-Deploy (Contract)
- [ ] README updated with mainnet address
- [ ] Tweet shipped 🐉

## Frontend (BUILD AFTER MAINNET DEPLOY)
**Only build frontend AFTER contract is on mainnet.** This avoids testnet→mainnet migration issues.

Order:
1. Contract on testnet → Audit → Contract on mainnet
2. THEN build frontend with mainnet addresses
3. No migration, no address swapping

## Autonomous Build Repository Management
Each autonomous build gets its **own GitHub repository** to prevent bloat:

### Repository Creation
```bash
# Create new repo for build
gh repo create emberdragonc/ember-${PROJECT_NAME} --public --description "🐉 Built by Ember Autonomous Builder"

# Initialize from template (NOT in smart-contract-framework)
cd ~/projects
mkdir ember-${PROJECT_NAME}
cd ember-${PROJECT_NAME}
forge init --template foundry-rs/forge-template
```

### Repository Structure
```
emberdragonc/ember-${PROJECT_NAME}/
├── src/
│   └── ${ContractName}.sol
├── test/
├── script/
├── foundry.toml
├── README.md
└── AUDIT.md (if audited)
```

### Why Separate Repos?
- **No bloat** - smart-contract-framework stays lean
- **Clean audit trail** - each project has its own history
- **Easy forking** - community can fork individual projects
- **Independent versioning** - upgrades don't affect other projects

### Naming Convention
- Repo: `ember-${descriptive-name}` (e.g., `ember-lottery`, `ember-nft-raffle`)
- Max 30 chars for descriptive name
- Lowercase, hyphens only

## Frontend: Testnet → Mainnet Migration (DEPRECATED)
**Prefer building frontend AFTER mainnet deploy instead.** This section is only for cases where frontend was built during testnet phase:

### Chain Configuration
- [ ] **Put mainnet FIRST in chain array** - First chain = default
  ```typescript
  // ❌ WRONG - defaults to testnet
  chains: [baseSepolia, base]
  
  // ✅ CORRECT - defaults to mainnet
  chains: [base, baseSepolia]
  ```
- [ ] Update ALL contract addresses in config
- [ ] Update block explorer links (sepolia.basescan.org → basescan.org)
- [ ] Remove or hide testnet from network selector (production builds)

### Common Issues
- Users connecting to wrong network → wallet prompts them to switch
- Testnet contracts showing $0 balances on mainnet → check chainId logic
- "Coming Soon" banners still showing → update to "NOW LIVE" 🎉

### Checklist
- [ ] `contracts.ts` has mainnet addresses filled in
- [ ] `providers.tsx` has mainnet chain first
- [ ] All hardcoded testnet links updated
- [ ] Test with fresh browser (no cached wallet state)
- [ ] Verify wallet auto-prompts for mainnet

## Frontend Design (0xdesigner)
```bash
# Start design session
/design-and-refine:start ComponentName
```
- [ ] Dev server running
- [ ] Design interview completed
- [ ] 5 variations generated
- [ ] Reviewed at `/__design_lab`
- [ ] Feedback provided
- [ ] Iterated to final design
- [ ] DESIGN_PLAN.md generated
- [ ] Cleanup completed

### Web3 UI Checklist
- [ ] Wallet connection state shown
- [ ] Transaction pending/confirmed/failed states
- [ ] Gas estimation displayed
- [ ] Clear error messages for reverts
- [ ] Mobile responsive
- [ ] **Exact approvals only** - no `type(uint256).max` approvals
- [ ] **EIP-7702 batching** - detect smart wallets, batch approve+action when supported
- [ ] **Fallback for EOAs** - 2-step approval flow for traditional wallets

### Launch-Day UX Checklist (from Staking Launch 2026-01-30)
- [ ] **Wrong network CTA** - "Switch to [Network]" button, not just error message
- [ ] **"Check wallet" prompt** - Pulsing indicator when waiting for signature
- [ ] **Popular wallets listed** - MetaMask, Coinbase, Rabby, Phantom, Rainbow (don't rely on WalletConnect alone)
- [ ] **Context metrics** - Show % of supply, user's share, not just raw numbers
- [ ] **Mobile tested** - Test actual flow on mobile devices
- [ ] **Multi-wallet tested** - Test MetaMask, Coinbase, Rabby, Phantom
- [ ] **Error messages** - User-friendly text for rejections, failures, allowance issues

## ⚠️ Verification Note (2026-01-31)

**DO NOT manually pass `--verifier-url`** during deployment!

The foundry.toml etherscan config handles v2 API automatically.

❌ Wrong:
```bash
forge script ... --verify --verifier-url https://api.basescan.org/api
```

✅ Right:
```bash
forge script ... --verify --etherscan-api-key $ETHERSCAN_API_KEY
# OR use forge verify-contract after deployment
```

The manual `--verifier-url` overrides foundry.toml and may hit deprecated v1 endpoint.

## 🔐 Trustless Design Principle (MANDATORY)

**INVIOLABLE: All outcome determination must be trustless via oracles.**

### Rules:
- ❌ Admin/owner should NEVER select winners or outcomes
- ❌ No "manual checking" of external data
- ✅ All determinations must be on-chain via oracles
- ✅ Admin role = setup/emergency ONLY

### Oracle Options for Base:
| Oracle | Best For | Notes |
|--------|----------|-------|
| **Chainlink Price Feeds** | Major tokens | Most reliable, limited coverage |
| **Pyth Network** | More tokens | Pull-based, good meme coverage |
| **Chainlink Functions** | Custom APIs | Call DeFiLlama, CoinGecko, etc. |
| **UMA Optimistic Oracle** | Subjective outcomes | Dispute mechanism |

### When Building Prediction Markets:
1. ✅ Store oracle addresses per asset at round creation
2. ✅ Snapshot starting prices on-chain
3. ✅ Let ANYONE call resolve after deadline
4. ✅ Contract reads oracles and determines winner
5. ✅ Handle stale price / oracle failure gracefully

### Red Flags (STOP and redesign):
- "Admin resolves with winning index" ❌
- "Owner commits hash of winner" ❌
- "Manual verification of results" ❌

If you see these patterns → add oracle integration first.

## 🌐 Frontend Deployment (ALWAYS SUBDOMAINS)

**Each app gets its own subdomain. NEVER deploy multiple apps to the same Vercel project.**

### Subdomain Convention:
```
appname.ember.engineer
```

Examples:
- staking.ember.engineer
- battles.ember.engineer  
- predict.ember.engineer
- reputation.ember.engineer

### Vercel Setup for New App:
```bash
cd /path/to/app/frontend
npx vercel link  # Create NEW project, don't reuse existing
npx vercel domains add appname.ember.engineer
npx vercel --prod
```

### Why Subdomains:
- Apps don't overwrite each other
- Clean separation of concerns
- Can deploy/rollback independently
- Professional appearance

### DNS (Vercel handles automatically):
- Vercel auto-provisions SSL
- Just add the domain in Vercel dashboard or CLI

**Never ask "should I use subdomains?" - the answer is ALWAYS yes.**
