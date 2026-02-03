// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IEmberVoteArena {
    function createMarket(
        string calldata title,
        string calldata rules,
        uint256 entryCost,
        uint256 entryDuration,
        uint256 voteDuration
    ) external returns (uint256 marketId);
    
    function submitEntry(
        uint256 marketId,
        string calldata data,
        bool approved,
        bytes calldata signature
    ) external returns (uint256 entryId);
    
    function vote(
        uint256 marketId,
        uint256 entryId,
        uint256 voteAmount
    ) external;
    
    function emberToken() external view returns (IERC20);
    function MARKET_CREATION_FEE() external view returns (uint256);
    function getCurrentVotePrice(uint256 marketId, uint256 numVotes) external view returns (uint256);
}

interface IKyberRouter {
    function swap(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 minAmountOut,
        address recipient,
        bytes calldata data
    ) external payable returns (uint256 amountOut);
}

/**
 * @title EmberVoteZap
 * @author Ember 🐉
 * @notice Zap any Base token into EMBER for voting/entries
 * @dev Uses Kyber aggregator for swaps, 10% max slippage
 */
contract EmberVoteZap is Ownable {
    using SafeERC20 for IERC20;
    
    IEmberVoteArena public immutable arena;
    IERC20 public immutable ember;
    IKyberRouter public kyberRouter;
    
    uint256 public constant MAX_SLIPPAGE_BPS = 1000; // 10% max slippage
    
    event ZapAndVote(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 emberReceived,
        uint256 marketId,
        uint256 entryId,
        uint256 votes
    );
    
    event ZapAndCreateMarket(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 emberReceived,
        uint256 marketId
    );
    
    event ZapAndSubmitEntry(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 emberReceived,
        uint256 marketId,
        uint256 entryId
    );
    
    error SlippageTooHigh();
    error SwapFailed();
    error InsufficientOutput();
    
    constructor(
        address _arena,
        address _kyberRouter
    ) Ownable(msg.sender) {
        arena = IEmberVoteArena(_arena);
        ember = arena.emberToken();
        kyberRouter = IKyberRouter(_kyberRouter);
    }
    
    /**
     * @notice Zap any token to EMBER and vote
     * @param tokenIn Token to swap from (address(0) for ETH)
     * @param amountIn Amount of tokenIn
     * @param minEmberOut Minimum EMBER to receive (slippage protection)
     * @param marketId Market to vote in
     * @param entryId Entry to vote for
     * @param voteAmount Number of votes
     * @param kyberData Encoded swap data from Kyber API
     */
    function zapAndVote(
        address tokenIn,
        uint256 amountIn,
        uint256 minEmberOut,
        uint256 marketId,
        uint256 entryId,
        uint256 voteAmount,
        bytes calldata kyberData
    ) external payable {
        uint256 emberReceived = _zapToEmber(tokenIn, amountIn, minEmberOut, kyberData);
        
        // Approve arena to spend EMBER
        ember.approve(address(arena), emberReceived);
        
        // Vote
        arena.vote(marketId, entryId, voteAmount);
        
        // Refund any excess EMBER
        _refundExcess();
        
        emit ZapAndVote(msg.sender, tokenIn, amountIn, emberReceived, marketId, entryId, voteAmount);
    }
    
    /**
     * @notice Zap any token to EMBER and create a market
     */
    function zapAndCreateMarket(
        address tokenIn,
        uint256 amountIn,
        uint256 minEmberOut,
        string calldata title,
        string calldata rules,
        uint256 entryCost,
        uint256 entryDuration,
        uint256 voteDuration,
        bytes calldata kyberData
    ) external payable returns (uint256 marketId) {
        uint256 emberReceived = _zapToEmber(tokenIn, amountIn, minEmberOut, kyberData);
        
        // Approve arena
        ember.approve(address(arena), emberReceived);
        
        // Create market
        marketId = arena.createMarket(title, rules, entryCost, entryDuration, voteDuration);
        
        // Refund excess
        _refundExcess();
        
        emit ZapAndCreateMarket(msg.sender, tokenIn, amountIn, emberReceived, marketId);
    }
    
    /**
     * @notice Zap any token to EMBER and submit entry
     */
    function zapAndSubmitEntry(
        address tokenIn,
        uint256 amountIn,
        uint256 minEmberOut,
        uint256 marketId,
        string calldata data,
        bool approved,
        bytes calldata signature,
        bytes calldata kyberData
    ) external payable returns (uint256 entryId) {
        uint256 emberReceived = _zapToEmber(tokenIn, amountIn, minEmberOut, kyberData);
        
        // Approve arena
        ember.approve(address(arena), emberReceived);
        
        // Submit entry
        entryId = arena.submitEntry(marketId, data, approved, signature);
        
        // Refund excess
        _refundExcess();
        
        emit ZapAndSubmitEntry(msg.sender, tokenIn, amountIn, emberReceived, marketId, entryId);
    }
    
    /**
     * @notice Refund any excess EMBER to sender
     */
    function _refundExcess() internal {
        uint256 remaining = ember.balanceOf(address(this));
        if (remaining > 0) {
            ember.safeTransfer(msg.sender, remaining);
        }
    }
    
    /**
     * @notice Internal swap logic
     */
    function _zapToEmber(
        address tokenIn,
        uint256 amountIn,
        uint256 minEmberOut,
        bytes calldata kyberData
    ) internal returns (uint256 emberReceived) {
        // If already EMBER, just transfer
        if (tokenIn == address(ember)) {
            ember.safeTransferFrom(msg.sender, address(this), amountIn);
            return amountIn;
        }
        
        // Transfer token in (or use ETH)
        if (tokenIn == address(0)) {
            // ETH
            if (msg.value < amountIn) revert InsufficientOutput();
        } else {
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
            IERC20(tokenIn).approve(address(kyberRouter), amountIn);
        }
        
        uint256 balBefore = ember.balanceOf(address(this));
        
        // Execute swap via Kyber
        if (tokenIn == address(0)) {
            kyberRouter.swap{value: amountIn}(
                tokenIn,
                amountIn,
                address(ember),
                minEmberOut,
                address(this),
                kyberData
            );
        } else {
            kyberRouter.swap(
                tokenIn,
                amountIn,
                address(ember),
                minEmberOut,
                address(this),
                kyberData
            );
        }
        
        emberReceived = ember.balanceOf(address(this)) - balBefore;
        
        if (emberReceived < minEmberOut) revert SlippageTooHigh();
    }
    
    /**
     * @notice Get quote for swap (view function for frontend)
     * @dev Frontend should call Kyber API for actual quote
     */
    function getExpectedEmber(
        uint256 marketId,
        uint256 voteAmount
    ) external view returns (uint256 emberNeeded) {
        return arena.getCurrentVotePrice(marketId, voteAmount);
    }
    
    // ============ Admin ============
    
    function setKyberRouter(address newRouter) external onlyOwner {
        kyberRouter = IKyberRouter(newRouter);
    }
    
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }
    
    receive() external payable {}
}
