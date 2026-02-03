// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {EmberVoteArena} from "../src/EmberVoteArena.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock EMBER token for testing
contract MockEMBER is ERC20 {
    constructor() ERC20("Ember", "EMBER") {
        _mint(msg.sender, 1_000_000_000 * 1e18);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract EmberVoteArenaTest is Test {
    EmberVoteArena public arena;
    MockEMBER public ember;
    
    address public owner = address(1);
    address public oracle = address(2);
    address public stakingDrip = address(3);
    address public burnAddress = address(4);
    
    address public alice = address(10);
    address public bob = address(11);
    address public charlie = address(12);
    address public dave = address(13);
    
    uint256 public oraclePrivateKey = 0xA11CE;
    
    function setUp() public {
        // Create oracle address from private key
        oracle = vm.addr(oraclePrivateKey);
        
        // Deploy mock token
        ember = new MockEMBER();
        
        // Deploy arena
        vm.prank(owner);
        arena = new EmberVoteArena(
            address(ember),
            oracle,
            stakingDrip,
            burnAddress
        );
        
        // Fund test accounts
        ember.mint(alice, 1_000_000 * 1e18);
        ember.mint(bob, 1_000_000 * 1e18);
        ember.mint(charlie, 1_000_000 * 1e18);
        ember.mint(dave, 1_000_000 * 1e18);
        
        // Approve arena
        vm.prank(alice);
        ember.approve(address(arena), type(uint256).max);
        vm.prank(bob);
        ember.approve(address(arena), type(uint256).max);
        vm.prank(charlie);
        ember.approve(address(arena), type(uint256).max);
        vm.prank(dave);
        ember.approve(address(arena), type(uint256).max);
    }
    
    // ============ Market Creation Tests ============
    
    function test_CreateMarket() public {
        vm.prank(alice);
        uint256 marketId = arena.createMarket(
            "Best Cat Photo",
            "Only cat photos allowed",
            0, // default entry cost
            0, // default entry duration
            0  // default vote duration
        );
        
        assertEq(marketId, 0);
        
        EmberVoteArena.Market memory market = arena.getMarket(marketId);
        assertEq(market.initiator, alice);
        assertEq(market.title, "Best Cat Photo");
        assertEq(market.entryCost, 10_000 * 1e18);
        
        // Check creation fee was burned
        assertEq(ember.balanceOf(burnAddress), 100_000 * 1e18);
    }
    
    function test_CreateMarket_CustomParams() public {
        vm.prank(alice);
        uint256 marketId = arena.createMarket(
            "Custom Market",
            "Custom rules",
            50_000 * 1e18, // 50K entry cost
            12 hours,       // 12h entry phase
            24 hours        // 24h voting phase
        );
        
        EmberVoteArena.Market memory market = arena.getMarket(marketId);
        assertEq(market.entryCost, 50_000 * 1e18);
        assertEq(market.entryEnd, block.timestamp + 12 hours);
        assertEq(market.voteEnd, block.timestamp + 12 hours + 24 hours);
    }
    
    // ============ Entry Submission Tests ============
    
    function test_SubmitEntry() public {
        // Create market
        vm.prank(alice);
        uint256 marketId = arena.createMarket("Test", "Rules", 0, 0, 0);
        
        // Generate oracle signature
        bytes memory signature = _signEntry(marketId, "ipfs://entry1", true);
        
        // Submit entry
        vm.prank(bob);
        uint256 entryId = arena.submitEntry(marketId, "ipfs://entry1", true, signature);
        
        assertEq(entryId, 0);
        
        EmberVoteArena.Entry memory entry = arena.getEntry(marketId, entryId);
        assertEq(entry.author, bob);
        assertEq(entry.data, "ipfs://entry1");
        assertFalse(entry.filtered);
        assertTrue(entry.exists);
        
        // Check entry fee added to pot
        EmberVoteArena.Market memory market = arena.getMarket(marketId);
        assertEq(market.totalPot, 10_000 * 1e18);
    }
    
    function test_SubmitEntry_Filtered() public {
        vm.prank(alice);
        uint256 marketId = arena.createMarket("Test", "Rules", 0, 0, 0);
        
        // Oracle rejects the entry
        bytes memory signature = _signEntry(marketId, "ipfs://badentry", false);
        
        vm.prank(bob);
        uint256 entryId = arena.submitEntry(marketId, "ipfs://badentry", false, signature);
        
        EmberVoteArena.Entry memory entry = arena.getEntry(marketId, entryId);
        assertTrue(entry.filtered);
        
        // Fee still goes to pot
        EmberVoteArena.Market memory market = arena.getMarket(marketId);
        assertEq(market.totalPot, 10_000 * 1e18);
    }
    
    function test_RevertWhen_SubmitEntry_InvalidSignature() public {
        vm.prank(alice);
        uint256 marketId = arena.createMarket("Test", "Rules", 0, 0, 0);
        
        // Sign as approved but claim rejected
        bytes memory signature = _signEntry(marketId, "ipfs://entry1", true);
        
        vm.prank(bob);
        vm.expectRevert(EmberVoteArena.InvalidSignature.selector);
        arena.submitEntry(marketId, "ipfs://entry1", false, signature); // wrong approval status
    }
    
    // ============ Voting Tests ============
    
    function test_Vote() public {
        // Setup market with entries
        (uint256 marketId, uint256 entry1, uint256 entry2) = _setupMarketWithEntries();
        
        // Advance to voting phase
        vm.warp(block.timestamp + 7 hours);
        
        // Vote
        vm.prank(dave);
        arena.vote(marketId, entry1, 100);
        
        EmberVoteArena.Entry memory entry = arena.getEntry(marketId, entry1);
        assertEq(entry.votes, 100);
        
        assertEq(arena.userVotes(marketId, dave), 100);
    }
    
    function test_Vote_BondingCurve() public {
        (uint256 marketId, uint256 entry1,) = _setupMarketWithEntries();
        vm.warp(block.timestamp + 7 hours);
        
        // First vote is cheap
        uint256 cost1 = arena.getCurrentVotePrice(marketId, 100);
        
        // Vote
        vm.prank(dave);
        arena.vote(marketId, entry1, 100);
        
        // After votes, price increases
        uint256 cost2 = arena.getCurrentVotePrice(marketId, 100);
        
        assertGt(cost2, cost1);
    }
    
    function test_RevertWhen_Vote_FilteredEntry() public {
        vm.prank(alice);
        uint256 marketId = arena.createMarket("Test", "Rules", 0, 0, 0);
        
        bytes memory sig = _signEntry(marketId, "ipfs://filtered", false);
        vm.prank(bob);
        uint256 entryId = arena.submitEntry(marketId, "ipfs://filtered", false, sig);
        
        vm.warp(block.timestamp + 7 hours);
        
        vm.prank(dave);
        vm.expectRevert(EmberVoteArena.CannotVoteOnFilteredEntry.selector);
        arena.vote(marketId, entryId, 100); // Should fail
    }
    
    // ============ Resolution Tests ============
    
    function test_Resolve() public {
        (uint256 marketId, uint256 entry1, uint256 entry2) = _setupMarketWithEntries();
        
        // Add third entry
        bytes memory sig3 = _signEntry(marketId, "ipfs://entry3", true);
        vm.prank(dave);
        uint256 entry3 = arena.submitEntry(marketId, "ipfs://entry3", true, sig3);
        
        vm.warp(block.timestamp + 7 hours);
        
        // Vote: entry1=1000, entry2=500, entry3=250
        vm.prank(alice);
        arena.vote(marketId, entry1, 1000);
        
        vm.prank(bob);
        arena.vote(marketId, entry2, 500);
        
        vm.prank(charlie);
        arena.vote(marketId, entry3, 250);
        
        // Record balances before resolve
        uint256 bobBalBefore = ember.balanceOf(bob);
        uint256 charlieBalBefore = ember.balanceOf(charlie);
        uint256 daveBalBefore = ember.balanceOf(dave);
        uint256 stakersBalBefore = ember.balanceOf(stakingDrip);
        uint256 aliceBalBefore = ember.balanceOf(alice);
        
        // Advance past voting
        vm.warp(block.timestamp + 7 hours);
        
        // Resolve
        arena.resolve(marketId);
        
        // Check payouts happened
        EmberVoteArena.Market memory market = arena.getMarket(marketId);
        assertTrue(market.resolved);
        
        // bob (entry1 author) should have most
        assertGt(ember.balanceOf(bob), bobBalBefore);
        // charlie (entry2 author) should have some
        assertGt(ember.balanceOf(charlie), charlieBalBefore);
        // dave (entry3 author) should have some
        assertGt(ember.balanceOf(dave), daveBalBefore);
        // stakers should have 10%
        assertGt(ember.balanceOf(stakingDrip), stakersBalBefore);
        // alice (initiator) should have 5%
        assertGt(ember.balanceOf(alice), aliceBalBefore);
    }
    
    function test_Resolve_SingleEntry_Refund() public {
        vm.prank(alice);
        uint256 marketId = arena.createMarket("Test", "Rules", 0, 0, 0);
        
        bytes memory sig = _signEntry(marketId, "ipfs://entry1", true);
        vm.prank(bob);
        arena.submitEntry(marketId, "ipfs://entry1", true, sig);
        
        uint256 bobBalBefore = ember.balanceOf(bob);
        
        // Skip to after voting
        vm.warp(block.timestamp + 13 hours);
        
        arena.resolve(marketId);
        
        // Bob should get refund
        assertGt(ember.balanceOf(bob), bobBalBefore);
    }
    
    function test_Resolve_Tie() public {
        (uint256 marketId, uint256 entry1, uint256 entry2) = _setupMarketWithEntries();
        
        // Add third entry for proper tie testing
        bytes memory sig3 = _signEntry(marketId, "ipfs://entry3", true);
        vm.prank(dave);
        uint256 entry3 = arena.submitEntry(marketId, "ipfs://entry3", true, sig3);
        
        vm.warp(block.timestamp + 7 hours);
        
        // 1st and 2nd tie, 3rd has fewer
        vm.prank(alice);
        arena.vote(marketId, entry1, 500);
        
        vm.prank(alice);
        arena.vote(marketId, entry2, 500);
        
        vm.prank(charlie);
        arena.vote(marketId, entry3, 100);
        
        uint256 bobBalBefore = ember.balanceOf(bob);
        uint256 charlieBalBefore = ember.balanceOf(charlie);
        
        vm.warp(block.timestamp + 7 hours);
        arena.resolve(marketId);
        
        // bob (entry1) and charlie (entry2) tied for 1st/2nd, should get equal payout
        uint256 bobPayout = ember.balanceOf(bob) - bobBalBefore;
        uint256 charliePayout = ember.balanceOf(charlie) - charlieBalBefore;
        
        assertEq(bobPayout, charliePayout);
    }
    
    // ============ View Function Tests ============
    
    function test_GetLeaderboard() public {
        (uint256 marketId, uint256 entry1, uint256 entry2) = _setupMarketWithEntries();
        
        vm.warp(block.timestamp + 7 hours);
        
        // entry2 gets more votes
        vm.prank(alice);
        arena.vote(marketId, entry2, 1000);
        
        vm.prank(charlie);
        arena.vote(marketId, entry1, 500);
        
        (uint256[] memory entryIds, uint256[] memory votes) = arena.getLeaderboard(marketId);
        
        // entry2 should be first
        assertEq(entryIds[0], entry2);
        assertEq(votes[0], 1000);
        assertEq(entryIds[1], entry1);
        assertEq(votes[1], 500);
    }
    
    // ============ Admin Tests ============
    
    function test_SetOracle() public {
        address newOracle = address(100);
        
        vm.prank(owner);
        arena.setOracle(newOracle);
        
        assertEq(arena.oracle(), newOracle);
    }
    
    function test_SetCurveParams() public {
        vm.prank(owner);
        arena.setCurveParams(20_000, 3);
        
        assertEq(arena.curveParam(), 20_000);
        assertEq(arena.curveExponent(), 3);
    }
    
    function test_RevertWhen_SetOracle_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        arena.setOracle(address(100));
    }
    
    // ============ Helper Functions ============
    
    function _signEntry(
        uint256 marketId,
        string memory data,
        bool approved
    ) internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(abi.encodePacked(marketId, data, approved));
        bytes32 ethSignedHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            messageHash
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oraclePrivateKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _setupMarketWithEntries() internal returns (uint256 marketId, uint256 entry1, uint256 entry2) {
        vm.prank(alice);
        marketId = arena.createMarket("Test Market", "Test rules", 0, 0, 0);
        
        bytes memory sig1 = _signEntry(marketId, "ipfs://entry1", true);
        bytes memory sig2 = _signEntry(marketId, "ipfs://entry2", true);
        
        vm.prank(bob);
        entry1 = arena.submitEntry(marketId, "ipfs://entry1", true, sig1);
        
        vm.prank(charlie);
        entry2 = arena.submitEntry(marketId, "ipfs://entry2", true, sig2);
    }
}
