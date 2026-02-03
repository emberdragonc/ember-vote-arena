// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {EmberVoteArena} from "../src/EmberVoteArena.sol";
import {EmberVoteZap} from "../src/EmberVoteZap.sol";

contract DeployScript is Script {
    // Base Mainnet addresses
    address constant EMBER_TOKEN = 0xFf18CbE8b299465731D1C1536B7A8f8F4aa5e2Cf;
    address constant STAKING_DRIP = 0x10D53Fe977d0069D046e5Fc9F0f0eB2659797b37; // 30-day drip
    address constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    address constant KYBER_ROUTER = 0x6131B5fae19EA4f9D964eAc0408E4408b66337b5; // Kyber on Base
    
    // Oracle address (Ember's signing wallet)
    address constant ORACLE = 0xE3c938c71273bFFf7DEe21BDD3a8ee1e453Bdd1b;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy Arena
        EmberVoteArena arena = new EmberVoteArena(
            EMBER_TOKEN,
            ORACLE,
            STAKING_DRIP,
            BURN_ADDRESS
        );
        console.log("EmberVoteArena deployed at:", address(arena));
        
        // Deploy Zap
        EmberVoteZap zap = new EmberVoteZap(
            address(arena),
            KYBER_ROUTER
        );
        console.log("EmberVoteZap deployed at:", address(zap));
        
        vm.stopBroadcast();
        
        console.log("\n=== Deployment Summary ===");
        console.log("Arena:", address(arena));
        console.log("Zap:", address(zap));
        console.log("Oracle:", ORACLE);
        console.log("Staking Drip:", STAKING_DRIP);
    }
}
