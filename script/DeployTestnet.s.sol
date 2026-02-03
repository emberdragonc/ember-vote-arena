// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {EmberVoteArena} from "../src/EmberVoteArena.sol";
import {EmberVoteZap} from "../src/EmberVoteZap.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock EMBER token for testnet
contract MockEMBER is ERC20 {
    constructor() ERC20("Mock Ember", "mEMBER") {
        _mint(msg.sender, 1_000_000_000 * 1e18);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DeployTestnetScript is Script {
    // Oracle address (Ember's signing wallet)
    address constant ORACLE = 0xE3c938c71273bFFf7DEe21BDD3a8ee1e453Bdd1b;
    address constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy mock EMBER token for testnet
        MockEMBER mockEmber = new MockEMBER();
        console.log("MockEMBER deployed at:", address(mockEmber));
        
        // Use deployer as staking drip for testnet
        address stakingDrip = deployer;
        
        // Deploy Arena
        EmberVoteArena arena = new EmberVoteArena(
            address(mockEmber),
            ORACLE,
            stakingDrip,
            BURN_ADDRESS
        );
        console.log("EmberVoteArena deployed at:", address(arena));
        
        // Deploy Zap (use zero address for Kyber on testnet - won't work but deploys)
        EmberVoteZap zap = new EmberVoteZap(
            address(arena),
            address(0) // No Kyber on testnet
        );
        console.log("EmberVoteZap deployed at:", address(zap));
        
        // Mint some tokens for testing
        mockEmber.mint(deployer, 10_000_000 * 1e18);
        
        vm.stopBroadcast();
        
        console.log("\n=== Testnet Deployment Summary ===");
        console.log("MockEMBER:", address(mockEmber));
        console.log("Arena:", address(arena));
        console.log("Zap:", address(zap));
        console.log("Oracle:", ORACLE);
        console.log("Deployer/StakingDrip:", deployer);
        console.log("\nMint more tokens: mockEmber.mint(address, amount)");
    }
}
