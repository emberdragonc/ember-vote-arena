# Smart Contract Audit Checklist 🐉

This checklist combines learnings from external audits with ConsenSys best practices.

**Legend:** 🔴 Critical | 🟡 Medium | 🟢 Low | ⚪ Info

---

## Core Security Patterns (ConsenSys)

### Reentrancy (SWC-107)

- [ ] 🔴 **REENTRANCY**: State changes after external calls
  - Pattern: Updating state AFTER `.call()`, `.transfer()`, or external contract calls
  - Fix: Apply Checks-Effects-Interactions (CEI) pattern
  - Reference: [docs/KNOWN-ATTACKS.md#reentrancy](docs/KNOWN-ATTACKS.md#reentrancy)

- [ ] 🔴 **REENTRANCY**: Cross-function reentrancy
  - Pattern: Multiple functions share state that can be exploited via callback
  - Fix: Use ReentrancyGuard modifier on ALL state-changing functions
  - Reference: [docs/PATTERNS.md#checks-effects-interactions-cei](docs/PATTERNS.md#checks-effects-interactions-cei)

- [ ] 🟡 **REENTRANCY**: Read-only reentrancy
  - Pattern: View functions return stale state during callback
  - Fix: Use reentrancy locks on view functions used by other protocols

### External Calls

- [ ] 🔴 **EXTERNAL**: Using .transfer() or .send()
  - Pattern: `msg.sender.transfer(amount)` or `payable(x).send(amount)`
  - Fix: Use `.call{value: amount}("")` with return check
  - Reference: [docs/PATTERNS.md#safe-external-calls](docs/PATTERNS.md#safe-external-calls)

- [ ] 🟡 **EXTERNAL**: Unchecked return values
  - Pattern: External calls without checking success
  - Fix: Always check `(bool success, )` return value

- [ ] 🟡 **EXTERNAL**: Unsafe ERC20 transfers
  - Pattern: Direct `token.transfer()` without SafeERC20
  - Fix: Use SafeERC20.safeTransfer() for all token operations

### Denial of Service (SWC-113, SWC-128)

- [ ] 🟡 **DOS**: Unbounded loops/arrays
  - Pattern: `for (uint i = 0; i < array.length; i++)` with user-controlled array
  - Fix: Add MAX constants, use pagination
  - Reference: [docs/KNOWN-ATTACKS.md#denial-of-service](docs/KNOWN-ATTACKS.md#denial-of-service)

- [ ] 🟡 **DOS**: Push payment pattern
  - Pattern: Contract pushes funds to users in loop
  - Fix: Use pull payment pattern - let users withdraw
  - Reference: [docs/PATTERNS.md#pull-over-push-payments](docs/PATTERNS.md#pull-over-push-payments)

- [ ] 🟢 **DOS**: Unbounded reward tokens array can DoS core functions
  - Pattern: rewardTokens.length without cap
  - Fix: Add MAX_REWARD_TOKENS = 20 cap and check in addRewardToken()
  - Source: @dragon_bot_z audit 2026-01-29

- [ ] 🟢 **DOS**: No minimum stake allows dust spam attacks
  - Pattern: stake() without minimum amount check
  - Fix: Add MIN_STAKE constant and revert StakeBelowMinimum
  - Source: @dragon_bot_z audit 2026-01-29

### Oracle Security

- [ ] 🔴 **ORACLE**: Single-source price manipulation
  - Pattern: Using spot price from single DEX
  - Fix: Use Chainlink or multiple oracle sources
  - Reference: [docs/KNOWN-ATTACKS.md#oracle-manipulation](docs/KNOWN-ATTACKS.md#oracle-manipulation)

- [ ] 🟡 **ORACLE**: No staleness check
  - Pattern: Using price without checking updatedAt
  - Fix: Add staleness threshold check (e.g., 1 hour)

- [ ] 🟡 **ORACLE**: No price bounds check
  - Pattern: Accepting any price from oracle
  - Fix: Add min/max price bounds and deviation checks

### Frontrunning (SWC-114)

- [ ] 🟡 **FRONTRUN**: Sensitive operations visible in mempool
  - Pattern: Price-sensitive transactions without protection
  - Fix: Implement commit-reveal or use private mempool
  - Reference: [docs/KNOWN-ATTACKS.md#frontrunning](docs/KNOWN-ATTACKS.md#frontrunning)

- [ ] 🟡 **FRONTRUN**: No slippage protection
  - Pattern: Swaps without minAmountOut parameter
  - Fix: Add slippage tolerance parameter

### Access Control

- [ ] 🔴 **ACCESS**: Missing access control on admin functions
  - Pattern: Public functions that should be restricted
  - Fix: Add onlyOwner or role-based access control

- [ ] 🟡 **ACCESS**: Single-step ownership transfer
  - Pattern: Using Ownable instead of Ownable2Step
  - Fix: Use Ownable2Step to prevent accidental transfers

- [ ] 🟢 **ACCESS**: No mechanism to deprecate reward tokens
  - Pattern: addRewardToken without deprecation counterpart
  - Fix: Add deprecateRewardToken() function
  - Source: @dragon_bot_z audit 2026-01-29

### Timestamp Dependence (SWC-116)

- [ ] 🟢 **TIMESTAMP**: Using block.timestamp for randomness
  - Pattern: `uint random = uint(keccak256(block.timestamp))`
  - Fix: Use Chainlink VRF for randomness

- [ ] 🟢 **TIMESTAMP**: Exact timestamp comparisons
  - Pattern: `require(block.timestamp == deadline)`
  - Fix: Use ranges: `require(block.timestamp >= deadline)`

---

## EIP-7702 Compatibility

- [ ] 🟡 **7702**: tx.origin == msg.sender checks break EIP-7702 compatibility
  - Pattern: require(tx.origin == msg.sender) or tx.origin checks
  - Fix: Remove tx.origin checks; use msg.sender for authorization
  - Source: EIP-7702 specification

- [ ] 🟢 **7702**: EXTCODESIZE == 0 checks break EIP-7702 delegated EOAs
  - Pattern: require(extcodesize(addr) == 0) or isContract checks
  - Fix: Remove EXTCODESIZE checks or update logic to handle delegated EOAs
  - Source: EIP-7702 specification

- [ ] 🟢 **7702**: Frontend missing 7702 batching support forces multiple transactions
  - Pattern: Separate approve() and action() calls without capability detection
  - Fix: Detect wallet capabilities via EIP-5792; batch calls if supported, fallback otherwise
  - Source: EIP-7702/EIP-5792 best practice

---

## Randomness & Lotteries

- [ ] 🟡 **RANDOM**: Commit-reveal timing attack
  - Pattern: Revealer can choose when to reveal (different blocks = different blockhash)
  - Fix: Use Chainlink VRF for high-stakes (>10 ETH); document limitation for low-stakes
  - Source: @dragon_bot_z audit 2026-01-29

- [ ] 🟡 **RANDOM**: Unbounded participants array in lottery
  - Pattern: `participants.push(msg.sender)` in loop for each ticket
  - Fix: Use ticket ranges struct instead of individual entries
  - Source: @dragon_bot_z audit 2026-01-29

---

## Token Security

### Approvals

- [ ] 🟡 **APPROVAL**: Infinite/excessive token approvals
  - Pattern: approve(spender, type(uint256).max) or approve(spender, largeConstant)
  - Fix: Use exact amount approvals; implement 7702 batching for single-tx approve+action
  - Source: Security best practice

### ERC20 Edge Cases

- [ ] 🟡 **TOKEN**: No handling for fee-on-transfer tokens
  - Pattern: Assuming amount sent == amount received
  - Fix: Check balance before/after for supported tokens

- [ ] 🟡 **TOKEN**: No handling for rebasing tokens
  - Pattern: Storing token amounts that may change
  - Fix: Use shares-based accounting or explicitly exclude

- [ ] 🟢 **TOKEN**: No handling for tokens with decimals != 18
  - Pattern: Hardcoded 1e18 scaling
  - Fix: Query token.decimals() and scale appropriately

---

## Contract Architecture

### Upgradability

- [ ] 🟡 **UPGRADE**: No storage gap in upgradeable contracts
  - Pattern: Missing `uint256[50] __gap` in base contracts
  - Fix: Add storage gap to prevent collision on upgrade

- [ ] 🟡 **UPGRADE**: Initializer can be called multiple times
  - Pattern: Missing initializer modifier or called in constructor
  - Fix: Use `initializer` modifier from OpenZeppelin

### Gas & Efficiency

- [ ] 🟢 **GAS**: Excessive storage reads in loops
  - Pattern: Reading storage variable in every iteration
  - Fix: Cache in memory variable before loop

- [ ] ⚪ **GAS**: Using require strings instead of custom errors
  - Pattern: `require(condition, "Error message")`
  - Fix: Use custom errors for gas savings

---

## Emergency Controls

- [ ] 🟡 **EMERGENCY**: No pause mechanism
  - Pattern: No way to halt contract in emergency
  - Fix: Implement Pausable with pause/unpause functions

- [ ] 🟡 **EMERGENCY**: No emergency withdrawal
  - Pattern: Funds can be stuck if contract fails
  - Fix: Add emergency withdrawal for stuck funds

- [ ] 🟢 **EMERGENCY**: No timelock on admin actions
  - Pattern: Admin can make instant changes
  - Fix: Add timelock for sensitive operations

---

## How to Use This Checklist

1. **Before coding:** Review relevant sections for your contract type
2. **During review:** Check each item systematically
3. **Before deploy:** Ensure all applicable items are checked
4. **After audits:** Add new findings to this checklist

### Adding New Findings

When adding findings from audits, use this format:
```markdown
- [ ] 🟡 **CATEGORY**: Brief description
  - Pattern: What to look for in code
  - Fix: How to resolve it
  - Source: Where this came from
```

---

## Quick Commands

```bash
# Run security scan
./scripts/security-scan.sh

# Run Slither
slither . --filter-paths "lib|test"

# Run all tests
forge test -vvv
```

---

## References

- [docs/KNOWN-ATTACKS.md](docs/KNOWN-ATTACKS.md) - Attack vectors with code examples
- [docs/PATTERNS.md](docs/PATTERNS.md) - Secure code patterns
- [docs/SECURITY-PHILOSOPHY.md](docs/SECURITY-PHILOSOPHY.md) - Security mindset
- [docs/SECURITY-TOOLS.md](docs/SECURITY-TOOLS.md) - Analysis tools
- [SWC Registry](https://swcregistry.io/) - Smart Contract Weakness Classification

---

## Recent Audit Findings (2026-01-30)

### From EmberStaking Audits (Claude + Dragon_Bot_Z)

- [ ] 🔴 **DEPRECATED TOKEN DRAIN**: emergencyWithdraw can drain unclaimed rewards for deprecated tokens
  - Pattern: Owner can withdraw tokens that users haven't claimed yet
  - Fix: Track total owed per token, only allow withdrawing surplus
  - Source: EmberStaking Claude Audit H-1

- [ ] 🟡 **BATCH CLAIM DOS**: Batch claimRewards() fails if any token transfer fails
  - Pattern: Loop over tokens with external calls, one failure blocks all
  - Fix: Add try/catch around individual transfers, emit failure event
  - Source: EmberStaking Claude Audit M-1

- [ ] 🟡 **FLASH-STAKE ATTACK**: Attacker can flash-stake before reward deposit
  - Pattern: Stake right before rewards, claim proportional share, unstake
  - Fix: Add minimum stake duration before rewards accrue, or snapshot balances
  - Source: EmberStaking Claude Audit M-2

- [ ] 🟡 **COOLDOWN RESET**: Adding to unstake request resets entire cooldown
  - Pattern: User has pending unstake, requests more, entire cooldown restarts
  - Fix: Pro-rata cooldown or separate unstake requests
  - Source: EmberStaking Claude Audit M-3

- [ ] 🟢 **MIN_STAKE BYPASS**: Compound functions may bypass minimum stake
  - Pattern: claimAndRestake() adds to stake without checking MIN_STAKE
  - Fix: Only concern if creating new stakes; existing stakers already passed check
  - Source: EmberStaking Claude Audit (Accepted Risk)

### From EmberLottery Audit (Dragon_Bot_Z)

- [ ] 🟡 **COMMIT-REVEAL TIMING**: Revealer can influence randomness via block timing
  - Pattern: On-chain randomness using blockhash is manipulable
  - Fix: Use Chainlink VRF for high-stakes (>10 ETH) lotteries
  - Source: EmberLottery Dragon_Bot_Z Audit

- [ ] 🟡 **UNBOUNDED PARTICIPANTS**: Buying many tickets = many storage writes
  - Pattern: Array grows unbounded with each ticket purchase
  - Fix: Use ticket ranges instead of individual entries
  - Source: EmberLottery Dragon_Bot_Z Audit

- [ ] 🟢 **UNUSED STATE**: Dead code/unused variables
  - Pattern: State variables declared but never used
  - Fix: Remove unused code to reduce gas and attack surface
  - Source: EmberLottery Dragon_Bot_Z Audit

### From EmberArena Audit (Dragon_Bot_Z)

- [ ] 🟢 **NO TIMELOCK ON EMERGENCY**: emergencyWithdraw has no timelock
  - Pattern: Admin can instantly withdraw all funds
  - Fix: Add timelock for emergency functions
  - Source: EmberArena Dragon_Bot_Z Audit (Suggestion)

- [ ] 🟢 **NO ROUND CANCELLATION**: No way to cancel a round if needed
  - Pattern: Once round starts, no abort mechanism
  - Fix: Add cancelRound() with refund logic for backers
  - Source: EmberArena Dragon_Bot_Z Audit (Suggestion)

- [ ] 🟢 **NO CLAIM DEADLINE**: Winners can claim forever
  - Pattern: Unclaimed rewards sit in contract indefinitely
  - Fix: Add claim deadline, sweep unclaimed to treasury after period
  - Source: EmberArena Dragon_Bot_Z Audit (Suggestion)

### From Clawdia BankrClubCrowdfund Audit (Ember)

- [ ] 🟡 **CROWDFUND TARGET MANIPULATION**: Goal can be changed mid-campaign
  - Pattern: Owner can adjust funding target after contributions
  - Fix: Lock goal once first contribution received
  - Source: BankrClubCrowdfund Ember Audit (if applicable)

### From MemePrediction Audit (Ember Self-Audit x4)

- [ ] 🔴 **DOUBLE WITHDRAWAL**: User can claim same funds via multiple paths
  - Pattern: `emergencyRefund()` + `claimWinnings()` both pay from same balance
  - Fix: Check ALL withdrawal flags in each claim function: `if (w.refunded) revert`
  - Source: MemePrediction Ember Self-Audit Pass 4

- [ ] 🔴 **DIVISION BY ZERO**: Winner selection with zero bets
  - Pattern: Admin commits to coin that received zero bets, division fails
  - Fix: Check `coinTotals[winningCoin] > 0` before resolution
  - Source: MemePrediction Ember Self-Audit Pass 1

- [ ] 🟠 **CANCELLED STATE INCOMPLETE**: New state flag not checked everywhere
  - Pattern: Added `cancelled` flag but forgot to check in `resolveRound()`, `commitWinner()`
  - Fix: When adding new state flags, grep for ALL functions that should check it
  - Source: MemePrediction Ember Self-Audit Pass 2

- [ ] 🟠 **VIEW FUNCTION STATE MISMATCH**: View functions return wrong values for edge states
  - Pattern: `isBettingOpen()` returned true for cancelled rounds
  - Fix: Update ALL view functions when adding new states
  - Source: MemePrediction Ember Self-Audit Pass 2

- [ ] 🟠 **CONSTRUCTOR ZERO CHECK**: Constructor accepts zero address for critical params
  - Pattern: `constructor(address _feeRecipient)` without zero check
  - Fix: Add zero checks in constructor, not just setters

- [ ] 🟠 **ADMIN SETTER ZERO CHECK**: Admin functions accept zero address
  - Pattern: `setSigner(address newSigner)` or `setTreasury(address)` without zero check
  - Fix: Add `if (newAddress == address(0)) revert ZeroAddress();` at start of function
  - Source: MoltENS self-audit 2026-02-02
  - Source: MemePrediction Dragon_Bot_Z Audit

- [ ] 🟡 **UNBOUNDED ARRAY PARAM**: Function accepts unbounded array
  - Pattern: `createRound(string[] memory coins)` with no limit
  - Fix: Add MAX_* constant and check length
  - Source: MemePrediction Ember Self-Audit Pass 1

- [ ] 🟡 **MINIMUM VALUE MISSING**: No minimum for user inputs
  - Pattern: Users can send dust amounts (1 wei bets)
  - Fix: Add MIN_WAGER or similar constants
  - Source: MemePrediction Ember Self-Audit Pass 2

- [ ] 🟡 **CENTRALIZED ORACLE**: Admin picks winner without verification
  - Pattern: `resolveRound(winnerIndex)` with no proof
  - Fix: Commit-reveal scheme OR oracle integration
  - Source: MemePrediction Dragon_Bot_Z Audit

- [ ] 🟡 **NO TIMEOUT PROTECTION**: Funds locked if admin disappears
  - Pattern: No way for users to recover funds if admin never resolves
  - Fix: Add REFUND_TIMEOUT allowing user withdrawal after X days
  - Source: MemePrediction Dragon_Bot_Z Audit

- [ ] 🟢 **OWNABLE VS OWNABLE2STEP**: Using single-step ownership transfer
  - Pattern: `Ownable` allows accidental ownership loss
  - Fix: Use `Ownable2Step` for safer transfers
  - Source: MemePrediction Ember Self-Audit Pass 3

---

## Self-Audit Process (Mandatory)

**Mindset progression through audit passes:**

```
Passes 1-2: CORRECTNESS - "Does this work?"
  → Run full checklist + slither + invariant tests
  → Fix obvious bugs
  
Pass 3: ADVERSARIAL - "How would I break this?"
  → Think like an attacker, not a builder
  → Map ALL state transitions, find illegal paths
  → Run Echidna fuzzing
  
Pass 4: ECONOMIC - "How would I profit from breaking this?"
  → If gas costs $X, can attacker profit $X+1?
  → Check MEV/sandwich attack vectors
  → Verify fee calculations can't be gamed
```

**Required Invariant Tests:**
Before any audit pass, define and test invariants like:
- `totalWithdrawn[user] <= totalDeposited[user]`
- `sum(balances) == address(this).balance`
- `!claimed && !refunded` for any withdrawal path

**After EACH pass:**
1. Create GitHub issue with findings
2. Fix all issues
3. Push fixes
4. Close issue
5. ADD NEW PATTERNS TO THIS FILE

**MemePrediction proof:** Found CRITICAL double-withdrawal bug on Pass 4 that Passes 1-3 missed.
The bug would have been caught on Pass 1 with invariant test: `withdrawn + refunded <= deposited`

*Insight from Moltbook @Dominus: Passes 1-3 asked "does this work?" Pass 4 asked "how do I exploit this?" That mindset shift is the key.*

---


### From EmberArena Audit (Ember Self-Audit x3)

- [ ] 🔴 **DIVISION BY ZERO (THRESHOLD)**: Division by value that can be zero due to configurable threshold
  - Pattern: `amount / totalBacking` where totalBacking can be 0 if minThreshold allows
  - Fix: Add explicit `if (denominator == 0) revert` check, OR ensure threshold prevents zero
  - Source: EmberArena Ember Self-Audit Pass 1

- [ ] 🟠 **NO TIMEOUT REFUND**: Funds locked if admin never resolves
  - Pattern: User deposits require admin action to unlock, no fallback
  - Fix: Add REFUND_TIMEOUT constant (e.g., 7 days), allow user withdrawal after timeout
  - Source: EmberArena Ember Self-Audit Pass 1

- [ ] 🟠 **EMERGENCY WITHDRAW UNRESTRICTED**: Owner can drain user funds mid-operation
  - Pattern: `emergencyWithdraw()` works on primary token during active rounds
  - Fix: Restrict emergency withdrawal of primary token when user funds at risk
  - Source: EmberArena Ember Self-Audit Pass 1

- [ ] 🟡 **FREE SUBMISSION GRIEFING**: No cost to submit entries allows spam attacks
  - Pattern: `submit()` function with no fee or token requirement
  - Fix: Require small fee, minimum token holding, or allowlist
  - Source: EmberArena Ember Self-Audit Pass 3

- [ ] 🟡 **SELF-PARTICIPATION**: Users can participate in their own submissions
  - Pattern: Creator can back/vote for own submission, inflating metrics
  - Fix: Track self-participation separately, or prevent entirely
  - Source: EmberArena Ember Self-Audit Pass 2

- [ ] 🟢 **NO CANCEL MECHANISM**: No way to cancel stuck operations
  - Pattern: Operation starts but no clean abort path if conditions can't be met
  - Fix: Add cancel function with appropriate refund logic
  - Source: EmberArena Ember Self-Audit Pass 2


### From AgentBattles Audit (Ember Self-Audit x3)

- [ ] 🔴 **MISSING REENTRANCY GUARD**: No ReentrancyGuard despite external calls
  - Pattern: Uses `.call{value}` for ETH transfers without ReentrancyGuard modifier
  - Fix: Always add ReentrancyGuard even when CEI is followed (defense in depth)
  - Source: AgentBattles Ember Self-Audit Pass 1

- [ ] 🔴 **CROSS-ENTITY SWEEP BUG**: Admin sweep function drains unrelated funds
  - Pattern: `sweepUnclaimed(battleId)` sweeps entire contract balance, not just that battle
  - Fix: Track claimable amounts per entity, only sweep specific entity's unclaimed
  - Source: AgentBattles Ember Self-Audit Pass 3

- [ ] 🟠 **CREATOR STAKE HOSTAGE**: Creator's deposit has no refund path
  - Pattern: Creator stakes ETH, but only bettors can refund; creator loses stake if stuck
  - Fix: Add dedicated `creatorRefund()` function with same timeout as bettor refunds
  - Source: AgentBattles Ember Self-Audit Pass 1

- [ ] 🟡 **NO ADMIN FALLBACK FOR TRUSTED ROLES**: Trusted role disappears, funds stuck
  - Pattern: Judge-only resolution with no owner fallback after timeout
  - Fix: Add extended timeout (e.g., 14 days) after which owner can intervene
  - Source: AgentBattles Ember Self-Audit Pass 2

