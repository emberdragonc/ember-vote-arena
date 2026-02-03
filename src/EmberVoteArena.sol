// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title EmberVoteArena
 * @author Ember 🐉
 * @notice Community voting markets with EMBER token
 * @dev Factory + market logic in one contract using mapping-based markets
 */
contract EmberVoteArena is Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ Constants ============
    uint256 public constant MARKET_CREATION_FEE = 100_000 * 1e18; // 100K EMBER (burned)
    uint256 public constant DEFAULT_ENTRY_FEE = 10_000 * 1e18;    // 10K EMBER default
    uint256 public constant DEFAULT_ENTRY_DURATION = 6 hours;
    uint256 public constant DEFAULT_VOTE_DURATION = 6 hours;
    uint256 public constant MIN_ENTRIES_TO_PROCEED = 2;
    uint256 public constant MAX_ENTRIES = 100;  // Prevent DoS via gas exhaustion
    
    // Payout splits (basis points, 10000 = 100%)
    uint256 public constant FIRST_PLACE_BPS = 5500;  // 55%
    uint256 public constant SECOND_PLACE_BPS = 2000; // 20%
    uint256 public constant THIRD_PLACE_BPS = 1000;  // 10%
    uint256 public constant STAKERS_BPS = 1000;      // 10%
    uint256 public constant INITIATOR_BPS = 500;     // 5%

    // ============ State ============
    IERC20 public immutable emberToken;
    address public oracle;           // Ember's oracle address for filtering
    address public stakingDrip;      // 30-day drip contract for stakers
    address public burnAddress;      // Where to "burn" EMBER (or 0x0 if token supports burn)
    
    // Bonding curve parameters (adjustable by owner)
    uint256 public curveParam = 10_000;  // Denominator for curve
    uint256 public curveExponent = 2;    // Exponent for curve (2 = quadratic growth)
    
    uint256 public marketCount;
    
    // ============ Structs ============
    enum MarketState { EntryPhase, VotingPhase, Resolved, Canceled }
    
    struct Market {
        address initiator;
        string title;
        string rules;           // Filtering rules for oracle
        uint256 entryCost;
        uint256 entryEnd;
        uint256 voteEnd;
        uint256 totalPot;
        uint256 totalVotes;
        uint256 entryCount;
        MarketState state;
        bool resolved;
    }
    
    struct Entry {
        address author;
        string data;            // IPFS hash or metadata
        uint256 votes;
        bool filtered;          // True if oracle filtered out
        bool exists;
    }
    
    // ============ Storage ============
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(uint256 => Entry)) public entries;  // marketId => entryId => Entry
    mapping(uint256 => mapping(address => uint256)) public userVotes;  // marketId => user => total votes cast
    mapping(uint256 => uint256[]) public marketEntryIds;  // marketId => array of entry IDs
    mapping(bytes32 => bool) public usedSignatures;  // Prevent signature replay
    
    // ============ Events ============
    event MarketCreated(
        uint256 indexed marketId,
        address indexed initiator,
        string title,
        uint256 entryCost,
        uint256 entryEnd,
        uint256 voteEnd
    );
    event EntrySubmitted(
        uint256 indexed marketId,
        uint256 indexed entryId,
        address indexed author,
        string data,
        bool filtered
    );
    event VoteCast(
        uint256 indexed marketId,
        uint256 indexed entryId,
        address indexed voter,
        uint256 amount,
        uint256 cost
    );
    event MarketResolved(
        uint256 indexed marketId,
        uint256 firstPlace,
        uint256 secondPlace,
        uint256 thirdPlace
    );
    event PayoutDistributed(
        uint256 indexed marketId,
        address indexed recipient,
        uint256 amount,
        string payoutType
    );
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event CurveParamsUpdated(uint256 newParam, uint256 newExponent);
    
    // ============ Errors ============
    error InvalidOracle();
    error InvalidMarket();
    error MarketNotInEntryPhase();
    error MarketNotInVotingPhase();
    error MarketAlreadyResolved();
    error VotingNotEnded();
    error InvalidSignature();
    error InsufficientPayment();
    error ZeroAmount();
    error EntryDoesNotExist();
    error CannotVoteOnFilteredEntry();
    error TransferFailed();
    error ZeroAddress();
    error MaxEntriesReached();
    error SignatureAlreadyUsed();
    
    // ============ Constructor ============
    constructor(
        address _emberToken,
        address _oracle,
        address _stakingDrip,
        address _burnAddress
    ) Ownable(msg.sender) {
        if (_emberToken == address(0)) revert ZeroAddress();
        if (_oracle == address(0)) revert ZeroAddress();
        if (_stakingDrip == address(0)) revert ZeroAddress();
        if (_burnAddress == address(0)) revert ZeroAddress();
        
        emberToken = IERC20(_emberToken);
        oracle = _oracle;
        stakingDrip = _stakingDrip;
        burnAddress = _burnAddress;
    }
    
    // ============ Market Creation ============
    
    /**
     * @notice Create a new voting market
     * @param title Market title
     * @param rules Filtering rules (for oracle reference)
     * @param entryCost Cost to submit entry (0 = default 10K)
     * @param entryDuration Seconds for entry phase (0 = default 6h)
     * @param voteDuration Seconds for voting phase (0 = default 6h)
     */
    function createMarket(
        string calldata title,
        string calldata rules,
        uint256 entryCost,
        uint256 entryDuration,
        uint256 voteDuration
    ) external returns (uint256 marketId) {
        // Transfer and burn creation fee
        emberToken.safeTransferFrom(msg.sender, burnAddress, MARKET_CREATION_FEE);
        
        // Set defaults
        if (entryCost == 0) entryCost = DEFAULT_ENTRY_FEE;
        if (entryDuration == 0) entryDuration = DEFAULT_ENTRY_DURATION;
        if (voteDuration == 0) voteDuration = DEFAULT_VOTE_DURATION;
        
        marketId = marketCount++;
        
        uint256 entryEnd = block.timestamp + entryDuration;
        uint256 voteEnd = entryEnd + voteDuration;
        
        markets[marketId] = Market({
            initiator: msg.sender,
            title: title,
            rules: rules,
            entryCost: entryCost,
            entryEnd: entryEnd,
            voteEnd: voteEnd,
            totalPot: 0,
            totalVotes: 0,
            entryCount: 0,
            state: MarketState.EntryPhase,
            resolved: false
        });
        
        emit MarketCreated(marketId, msg.sender, title, entryCost, entryEnd, voteEnd);
    }
    
    // ============ Entry Submission ============
    
    /**
     * @notice Submit an entry to a market
     * @param marketId The market to enter
     * @param data Entry data (IPFS hash, etc.)
     * @param approved Whether oracle approved this entry
     * @param signature Oracle signature proving approval status
     */
    function submitEntry(
        uint256 marketId,
        string calldata data,
        bool approved,
        bytes calldata signature
    ) external returns (uint256 entryId) {
        Market storage market = markets[marketId];
        
        if (market.initiator == address(0)) revert InvalidMarket();
        if (market.entryCount >= MAX_ENTRIES) revert MaxEntriesReached();
        if (block.timestamp > market.entryEnd) {
            // Transition to voting phase if needed
            if (market.state == MarketState.EntryPhase) {
                market.state = MarketState.VotingPhase;
            }
            revert MarketNotInEntryPhase();
        }
        
        // Verify oracle signature and prevent replay
        bytes32 messageHash = keccak256(abi.encodePacked(marketId, data, approved));
        bytes32 sigHash = keccak256(signature);
        if (usedSignatures[sigHash]) revert SignatureAlreadyUsed();
        usedSignatures[sigHash] = true;
        
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        if (signer != oracle) revert InvalidSignature();
        
        // Transfer entry fee to pot (even if filtered)
        emberToken.safeTransferFrom(msg.sender, address(this), market.entryCost);
        market.totalPot += market.entryCost;
        
        entryId = market.entryCount++;
        
        entries[marketId][entryId] = Entry({
            author: msg.sender,
            data: data,
            votes: 0,
            filtered: !approved,
            exists: true
        });
        
        marketEntryIds[marketId].push(entryId);
        
        emit EntrySubmitted(marketId, entryId, msg.sender, data, !approved);
    }
    
    // ============ Voting ============
    
    /**
     * @notice Vote for an entry
     * @param marketId The market
     * @param entryId The entry to vote for
     * @param voteAmount Number of votes to cast
     */
    function vote(
        uint256 marketId,
        uint256 entryId,
        uint256 voteAmount
    ) external {
        if (voteAmount == 0) revert ZeroAmount();
        
        Market storage market = markets[marketId];
        Entry storage entry = entries[marketId][entryId];
        
        if (market.initiator == address(0)) revert InvalidMarket();
        if (!entry.exists) revert EntryDoesNotExist();
        if (entry.filtered) revert CannotVoteOnFilteredEntry();
        
        // Check/transition phase
        if (block.timestamp <= market.entryEnd) {
            revert MarketNotInVotingPhase();
        }
        if (block.timestamp > market.voteEnd) {
            revert MarketNotInVotingPhase();
        }
        if (market.state == MarketState.EntryPhase) {
            market.state = MarketState.VotingPhase;
        }
        
        // Calculate cost with bonding curve
        uint256 cost = calculateVoteCost(market.totalVotes, voteAmount);
        
        // Transfer EMBER
        emberToken.safeTransferFrom(msg.sender, address(this), cost);
        market.totalPot += cost;
        
        // Record votes
        entry.votes += voteAmount;
        market.totalVotes += voteAmount;
        userVotes[marketId][msg.sender] += voteAmount;
        
        emit VoteCast(marketId, entryId, msg.sender, voteAmount, cost);
    }
    
    /**
     * @notice Calculate cost for votes based on bonding curve
     * @param currentTotalVotes Current total votes in market
     * @param numVotes Number of new votes
     * @return cost Total cost in EMBER (18 decimals)
     */
    function calculateVoteCost(uint256 currentTotalVotes, uint256 numVotes) public view returns (uint256 cost) {
        // Base cost per vote: 1 EMBER
        uint256 baseCost = 1e18;
        
        // Integral of bonding curve for multiple votes
        // price(v) = baseCost * (1 + v/curveParam)^curveExponent
        // For simplicity, calculate average price and multiply
        
        uint256 startPrice = _curvePrice(currentTotalVotes, baseCost);
        uint256 endPrice = _curvePrice(currentTotalVotes + numVotes, baseCost);
        
        // Multiply first, then divide to avoid precision loss
        cost = (startPrice + endPrice) * numVotes / 2 / 1e18;
        
        // Minimum 1 EMBER per vote (use >= to avoid strict equality)
        uint256 minCost = baseCost * numVotes / 1e18;
        if (cost < minCost) cost = minCost;
    }
    
    function _curvePrice(uint256 totalVotes, uint256 baseCost) internal view returns (uint256) {
        // price = baseCost * (1 + totalVotes/curveParam)^exponent
        // Using fixed point math (1e18 precision)
        uint256 ratio = 1e18 + (totalVotes * 1e18 / curveParam);
        
        // Simple power calculation for exponent 2
        if (curveExponent == 2) {
            return baseCost * ratio * ratio / 1e18 / 1e18;
        } else if (curveExponent == 1) {
            return baseCost * ratio / 1e18;
        } else {
            // For other exponents, use simplified approximation
            uint256 result = 1e18;
            for (uint256 i = 0; i < curveExponent; i++) {
                result = result * ratio / 1e18;
            }
            return baseCost * result / 1e18;
        }
    }
    
    // ============ Resolution ============
    
    /**
     * @notice Resolve a market and distribute payouts
     * @param marketId The market to resolve
     */
    function resolve(uint256 marketId) external {
        Market storage market = markets[marketId];
        
        if (market.initiator == address(0)) revert InvalidMarket();
        if (market.resolved) revert MarketAlreadyResolved();
        if (block.timestamp <= market.voteEnd) revert VotingNotEnded();
        
        market.resolved = true;
        market.state = MarketState.Resolved;
        
        uint256[] memory entryIds = marketEntryIds[marketId];
        uint256 validEntries = _countValidEntries(marketId, entryIds);
        
        // Edge case: Less than 2 valid entries
        if (validEntries < MIN_ENTRIES_TO_PROCEED) {
            _handleInsufficientEntries(marketId, entryIds);
            return;
        }
        
        // Find top 3
        (uint256 first, uint256 second, uint256 third, bool hasThird) = _findTopThree(marketId, entryIds);
        
        emit MarketResolved(marketId, first, second, third);
        
        // Distribute payouts
        _distributePayout(marketId, first, second, third, hasThird);
    }
    
    function _countValidEntries(uint256 marketId, uint256[] memory entryIds) internal view returns (uint256 count) {
        for (uint256 i = 0; i < entryIds.length; i++) {
            if (!entries[marketId][entryIds[i]].filtered) {
                count++;
            }
        }
    }
    
    function _handleInsufficientEntries(uint256 marketId, uint256[] memory entryIds) internal {
        Market storage market = markets[marketId];
        
        // Refund all entries their fees + any votes
        for (uint256 i = 0; i < entryIds.length; i++) {
            Entry storage entry = entries[marketId][entryIds[i]];
            if (entry.exists && !entry.filtered) {
                uint256 refund = market.entryCost;
                if (refund > 0) {
                    market.totalPot -= refund;
                    emberToken.safeTransfer(entry.author, refund);
                    emit PayoutDistributed(marketId, entry.author, refund, "refund");
                }
            }
        }
        
        // Remaining pot (from filtered entries + votes) goes to stakers
        if (market.totalPot > 0) {
            emberToken.safeTransfer(stakingDrip, market.totalPot);
            emit PayoutDistributed(marketId, stakingDrip, market.totalPot, "stakers");
        }
    }
    
    function _findTopThree(
        uint256 marketId,
        uint256[] memory entryIds
    ) internal view returns (uint256 first, uint256 second, uint256 third, bool hasThird) {
        uint256 firstVotes;
        uint256 secondVotes;
        uint256 thirdVotes;
        uint256 validCount;
        
        for (uint256 i = 0; i < entryIds.length; i++) {
            Entry storage entry = entries[marketId][entryIds[i]];
            if (entry.filtered) continue;
            
            validCount++;
            uint256 votes = entry.votes;
            uint256 entryId = entryIds[i];
            
            if (votes > firstVotes) {
                // Shift down
                third = second;
                thirdVotes = secondVotes;
                second = first;
                secondVotes = firstVotes;
                first = entryId;
                firstVotes = votes;
            } else if (votes > secondVotes) {
                third = second;
                thirdVotes = secondVotes;
                second = entryId;
                secondVotes = votes;
            } else if (votes > thirdVotes) {
                third = entryId;
                thirdVotes = votes;
            }
        }
        
        hasThird = validCount >= 3;
    }
    
    function _distributePayout(
        uint256 marketId,
        uint256 first,
        uint256 second,
        uint256 third,
        bool hasThird
    ) internal {
        Market storage market = markets[marketId];
        uint256 pot = market.totalPot;
        
        // Check for ties and adjust payouts
        Entry storage e1 = entries[marketId][first];
        Entry storage e2 = entries[marketId][second];
        Entry storage e3 = entries[marketId][third];
        
        uint256 firstPayout;
        uint256 secondPayout;
        uint256 thirdPayout;
        
        // Handle ties
        if (e1.votes == e2.votes && e2.votes == e3.votes) {
            // 3-way tie: split 1st+2nd+3rd
            uint256 combined = (FIRST_PLACE_BPS + SECOND_PLACE_BPS + THIRD_PLACE_BPS) * pot / 10000 / 3;
            firstPayout = combined;
            secondPayout = combined;
            thirdPayout = combined;
        } else if (e1.votes == e2.votes) {
            // 1st/2nd tie: split 1st+2nd
            uint256 combined = (FIRST_PLACE_BPS + SECOND_PLACE_BPS) * pot / 10000 / 2;
            firstPayout = combined;
            secondPayout = combined;
            thirdPayout = THIRD_PLACE_BPS * pot / 10000;
        } else if (e2.votes == e3.votes) {
            // 2nd/3rd tie: split 2nd+3rd
            firstPayout = FIRST_PLACE_BPS * pot / 10000;
            uint256 combined = (SECOND_PLACE_BPS + THIRD_PLACE_BPS) * pot / 10000 / 2;
            secondPayout = combined;
            thirdPayout = combined;
        } else {
            // No ties
            firstPayout = FIRST_PLACE_BPS * pot / 10000;
            secondPayout = SECOND_PLACE_BPS * pot / 10000;
            thirdPayout = THIRD_PLACE_BPS * pot / 10000;
        }
        
        uint256 stakersPayout = STAKERS_BPS * pot / 10000;
        uint256 initiatorPayout = INITIATOR_BPS * pot / 10000;
        
        // If no third place, add third prize to stakers
        if (!hasThird) {
            stakersPayout += thirdPayout;
            thirdPayout = 0;
        }
        
        // Transfer payouts (CEI: state already updated above)
        if (firstPayout > 0 && e1.author != address(0)) {
            emberToken.safeTransfer(e1.author, firstPayout);
            emit PayoutDistributed(marketId, e1.author, firstPayout, "first");
        }
        if (secondPayout > 0 && e2.author != address(0)) {
            emberToken.safeTransfer(e2.author, secondPayout);
            emit PayoutDistributed(marketId, e2.author, secondPayout, "second");
        }
        if (hasThird && thirdPayout > 0 && e3.author != address(0)) {
            emberToken.safeTransfer(e3.author, thirdPayout);
            emit PayoutDistributed(marketId, e3.author, thirdPayout, "third");
        }
        
        // Stakers (to drip contract)
        emberToken.safeTransfer(stakingDrip, stakersPayout);
        emit PayoutDistributed(marketId, stakingDrip, stakersPayout, "stakers");
        
        // Initiator
        emberToken.safeTransfer(market.initiator, initiatorPayout);
        emit PayoutDistributed(marketId, market.initiator, initiatorPayout, "initiator");
    }
    
    // ============ View Functions ============
    
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }
    
    function getEntry(uint256 marketId, uint256 entryId) external view returns (Entry memory) {
        return entries[marketId][entryId];
    }
    
    function getMarketEntries(uint256 marketId) external view returns (uint256[] memory) {
        return marketEntryIds[marketId];
    }
    
    function getLeaderboard(uint256 marketId) external view returns (
        uint256[] memory entryIds,
        uint256[] memory voteCounts
    ) {
        uint256[] memory ids = marketEntryIds[marketId];
        uint256[] memory votes = new uint256[](ids.length);
        
        for (uint256 i = 0; i < ids.length; i++) {
            votes[i] = entries[marketId][ids[i]].votes;
        }
        
        // Sort by votes (descending) - simple bubble sort for small arrays
        for (uint256 i = 0; i < ids.length; i++) {
            for (uint256 j = i + 1; j < ids.length; j++) {
                if (votes[j] > votes[i]) {
                    (votes[i], votes[j]) = (votes[j], votes[i]);
                    (ids[i], ids[j]) = (ids[j], ids[i]);
                }
            }
        }
        
        return (ids, votes);
    }
    
    function getCurrentVotePrice(uint256 marketId, uint256 numVotes) external view returns (uint256) {
        return calculateVoteCost(markets[marketId].totalVotes, numVotes);
    }
    
    // ============ Admin Functions ============
    
    function setOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert InvalidOracle();
        emit OracleUpdated(oracle, newOracle);
        oracle = newOracle;
    }
    
    function setCurveParams(uint256 newParam, uint256 newExponent) external onlyOwner {
        curveParam = newParam;
        curveExponent = newExponent;
        emit CurveParamsUpdated(newParam, newExponent);
    }
    
    function setStakingDrip(address newDrip) external onlyOwner {
        if (newDrip == address(0)) revert ZeroAddress();
        stakingDrip = newDrip;
    }
    
    function setBurnAddress(address newBurn) external onlyOwner {
        if (newBurn == address(0)) revert ZeroAddress();
        burnAddress = newBurn;
    }
}
