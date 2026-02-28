// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/PredictionMarket.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock USDC token for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1000000 * 10 ** 6); // 1M USDC (6 decimals)
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PredictionMarketTest is Test {
    PredictionMarket public market;
    MockUSDC public usdc;

    address public creator = address(1);
    address public user1 = address(2);
    address public user2 = address(3);
    address public user3 = address(4);
    address public mockForwarder = address(0x999); // Mock Chainlink forwarder for testing

    uint256 constant FINISH_TIME = 2000;

    function setUp() public {
        market = new PredictionMarket(mockForwarder);
        usdc = new MockUSDC();

        // Fund test accounts with ETH
        vm.deal(creator, 100 ether);
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);

        // Fund test accounts with USDC (using 6 decimals)
        usdc.mint(creator, 100000 * 10 ** 6); // 100k USDC
        usdc.mint(user1, 100000 * 10 ** 6);
        usdc.mint(user2, 100000 * 10 ** 6);
        usdc.mint(user3, 100000 * 10 ** 6);

        // Set initial timestamp
        vm.warp(START_TIME - 100);
    }

    function testCreateMarket() public {
        vm.startPrank(creator);

        uint256 marketId = market.createMarket(
            2, // outcomeCount
            START_TIME,
            FINISH_TIME,
            address(0) // ETH market
        );

        assertEq(marketId, 0);
        assertEq(market.marketCount(), 1);

        PredictionMarket.Market memory marketData = market.getMarket(marketId);

        assertEq(marketData.id, 0);
        assertEq(marketData.outcomeCount, 2);
        assertEq(marketData.totalPool, 0);
        assertEq(marketData.finishesAt, FINISH_TIME);
        assertEq(marketData.isResolved, false);
        assertEq(marketData.creator, creator);
        assertEq(marketData.paymentToken, address(0));

        vm.stopPrank();
    }

    function testPlacePrediction() public {
        // Create market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(0)
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // Place prediction
        vm.startPrank(user1);
        market.predict{value: 1 ether}(marketId, 0, 0); // 0 amount for ETH (uses msg.value)

        assertEq(market.predictionCount(), 1);

        PredictionMarket.Prediction memory predictionData = market
            .getPrediction(0);

        assertEq(predictionData.marketId, marketId);
        assertEq(predictionData.predictor, user1);
        assertEq(predictionData.outcome, 0);
        assertEq(predictionData.amount, 1 ether);

        vm.stopPrank();
    }

    function testMultiplePredictions() public {
        // Create market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(0)
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // User1 bets 2 ETH on outcome 0
        vm.prank(user1);
        market.predict{value: 2 ether}(marketId, 0, 0);

        // User2 bets 3 ETH on outcome 1
        vm.prank(user2);
        market.predict{value: 3 ether}(marketId, 1, 0);

        // User3 bets 1 ETH on outcome 0
        vm.prank(user3);
        market.predict{value: 1 ether}(marketId, 0, 0);

        // Check market pools
        PredictionMarket.Market memory marketData = market.getMarket(marketId);

        assertEq(marketData.totalPool, 6 ether);
        assertEq(marketData.outcomePools[0], 3 ether); // Outcome 0 pool
        assertEq(marketData.outcomePools[1], 3 ether); // Outcome 1 pool
    }

    function testResolveMarket() public {
        // Create market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(0)
        );
        vm.stopPrank();

        // Warp past finish time
        vm.warp(FINISH_TIME + 1);

        // Resolve market
        vm.startPrank(creator);
        market.resolveMarket(marketId, 0); // Outcome 0 wins

        PredictionMarket.Market memory marketData = market.getMarket(marketId);

        assertEq(marketData.isResolved, true);
        assertEq(marketData.winningOutcome, 0);

        vm.stopPrank();
    }

    function testAutoPayoutOnResolve() public {
        // Create market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(0)
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // Record balances before betting
        uint256 user1BalanceBefore = user1.balance;
        uint256 user2BalanceBefore = user2.balance;
        uint256 user3BalanceBefore = user3.balance;

        // Place predictions
        vm.prank(user1);
        market.predict{value: 2 ether}(marketId, 0, 0); // Prediction ID 0

        vm.prank(user2);
        market.predict{value: 3 ether}(marketId, 1, 0); // Prediction ID 1

        vm.prank(user3);
        market.predict{value: 1 ether}(marketId, 0, 0); // Prediction ID 2

        // Warp past finish time and resolve (auto-payout happens here)
        vm.warp(FINISH_TIME + 1);
        vm.prank(creator);
        market.resolveMarket(marketId, 0); // Outcome 0 wins

        // Check balances after resolution (winnings automatically paid)
        uint256 user1BalanceAfter = user1.balance;
        uint256 user2BalanceAfter = user2.balance;
        uint256 user3BalanceAfter = user3.balance;

        // User1 bet 2 ETH out of 3 ETH on winning outcome
        // Net: -2 ETH (bet) + 4 ETH (winnings) = +2 ETH
        assertEq(user1BalanceAfter - user1BalanceBefore, 2 ether);

        // User2 bet on losing outcome, lost 3 ETH
        assertEq(user2BalanceBefore - user2BalanceAfter, 3 ether);

        // User3 bet 1 ETH out of 3 ETH on winning outcome
        // Net: -1 ETH (bet) + 2 ETH (winnings) = +1 ETH
        assertEq(user3BalanceAfter - user3BalanceBefore, 1 ether);

        // Verify predictions were paid (check balances changed)
        // Auto-payout happened during resolveMarket
    }

    function testCannotResolveNonCreator() public {
        // Create market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(0)
        );
        vm.stopPrank();

        // Warp past finish time
        vm.warp(FINISH_TIME + 1);

        // Try to resolve as non-creator
        vm.prank(user1);
        vm.expectRevert("Only creator can resolve");
        market.resolveMarket(marketId, 0);
    }

    function testCannotResolveBeforeFinish() public {
        // Create market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(0)
        );
        vm.stopPrank();

        // Try to resolve before finish time
        vm.warp(FINISH_TIME - 1);
        vm.prank(creator);
        vm.expectRevert("Market not finished yet");
        market.resolveMarket(marketId, 0);
    }

    function testCannotBetBeforeStart() public {
        // Create market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(0)
        );
        vm.stopPrank();

        // Try to bet before start time
        vm.warp(START_TIME - 1);
        vm.prank(user1);
        vm.expectRevert("Market not started");
        market.predict{value: 1 ether}(marketId, 0, 0);
    }

    function testCannotBetAfterFinish() public {
        // Create market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(0)
        );
        vm.stopPrank();

        // Try to bet after finish time
        vm.warp(FINISH_TIME + 1);
        vm.prank(user1);
        vm.expectRevert("Market finished");
        market.predict{value: 1 ether}(marketId, 0, 0);
    }

    function testCalculatePotentialWinnings() public {
        // Create market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(0)
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // Preview: What if I bet 1 ETH on outcome 0 when pool is empty?
        uint256 previewEmpty = market.calculatePotentialWinnings(
            marketId,
            0,
            1 ether
        );
        assertEq(previewEmpty, 1 ether); // Would win entire pool (just your bet)

        // User1 places 2 ETH on outcome 0
        vm.prank(user1);
        market.predict{value: 2 ether}(marketId, 0, 0);

        // Preview: What if user2 bets 4 ETH on outcome 0?
        // Current pool: 2 ETH on outcome 0, total 2 ETH
        // After bet: 6 ETH on outcome 0, total 6 ETH
        // Potential: (4 / 6) * 6 = 4 ETH
        uint256 preview = market.calculatePotentialWinnings(
            marketId,
            0,
            4 ether
        );
        assertEq(preview, 4 ether);

        // User2 actually places that bet
        vm.prank(user2);
        market.predict{value: 4 ether}(marketId, 0, 0);

        // Now check actual winnings after resolution
        vm.warp(FINISH_TIME + 1);
        vm.prank(creator);
        market.resolveMarket(marketId, 0);

        // User1 winnings: (2/6) * 6 = 2 ETH (gets their bet back)
        uint256 user1Winnings = market.calculateWinnings(0);
        assertEq(user1Winnings, 2 ether);

        // User2 winnings: (4/6) * 6 = 4 ETH (gets their bet back)
        uint256 user2Winnings = market.calculateWinnings(1);
        assertEq(user2Winnings, 4 ether);
    }

    function testNoWinnersPayout() public {
        // Create market with 3 outcomes
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            3,
            START_TIME,
            FINISH_TIME,
            address(0)
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // Users only bet on outcomes 0 and 1
        vm.prank(user1);
        market.predict{value: 2 ether}(marketId, 0, 0);

        vm.prank(user2);
        market.predict{value: 3 ether}(marketId, 1, 0);

        // Warp past finish time and resolve with outcome 2 (no one bet on it)
        vm.warp(FINISH_TIME + 1);
        vm.prank(creator);
        market.resolveMarket(marketId, 2); // Outcome 2 wins, but no one bet on it

        // Contract should handle this gracefully (no payouts to make)
        PredictionMarket.Market memory marketData = market.getMarket(marketId);

        assertEq(marketData.isResolved, true);
        assertEq(marketData.winningOutcome, 2);
    }

    // ==================== ERC20 (USDC) Payment Tests ====================

    function testCreateUSDCMarket() public {
        vm.startPrank(creator);

        uint256 marketId = market.createMarket(
            2, // outcomeCount
            START_TIME,
            FINISH_TIME,
            address(usdc) // USDC market
        );

        assertEq(marketId, 0);
        assertEq(market.marketCount(), 1);

        PredictionMarket.Market memory marketData = market.getMarket(marketId);

        assertEq(marketData.paymentToken, address(usdc));

        vm.stopPrank();
    }

    function testPlacePredictionUSDC() public {
        // Create USDC market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(usdc)
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // User1 approves and bets 100 USDC on outcome 0
        uint256 betAmount = 100 * 10 ** 6; // 100 USDC
        vm.startPrank(user1);
        usdc.approve(address(market), betAmount);
        market.predict(marketId, 0, betAmount);
        vm.stopPrank();

        // Verify prediction
        PredictionMarket.Prediction memory predictionData = market
            .getPrediction(0);

        assertEq(predictionData.marketId, marketId);
        assertEq(predictionData.predictor, user1);
        assertEq(predictionData.outcome, 0);
        assertEq(predictionData.amount, betAmount);

        // Verify market pool
        PredictionMarket.Market memory marketData = market.getMarket(marketId);

        assertEq(marketData.totalPool, betAmount);
        assertEq(marketData.outcomePools[0], betAmount);
    }

    function testMultiplePredictionsUSDC() public {
        // Create USDC market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(usdc)
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // User1 bets 200 USDC on outcome 0
        uint256 bet1 = 200 * 10 ** 6;
        vm.startPrank(user1);
        usdc.approve(address(market), bet1);
        market.predict(marketId, 0, bet1);
        vm.stopPrank();

        // User2 bets 300 USDC on outcome 1
        uint256 bet2 = 300 * 10 ** 6;
        vm.startPrank(user2);
        usdc.approve(address(market), bet2);
        market.predict(marketId, 1, bet2);
        vm.stopPrank();

        // User3 bets 100 USDC on outcome 0
        uint256 bet3 = 100 * 10 ** 6;
        vm.startPrank(user3);
        usdc.approve(address(market), bet3);
        market.predict(marketId, 0, bet3);
        vm.stopPrank();

        // Check market pools
        PredictionMarket.Market memory marketData = market.getMarket(marketId);

        assertEq(marketData.totalPool, bet1 + bet2 + bet3);
        assertEq(marketData.outcomePools[0], bet1 + bet3); // 300 USDC
        assertEq(marketData.outcomePools[1], bet2); // 300 USDC
        assertEq(marketData.totalPool, bet1 + bet2 + bet3);
    }

    function testAutoPayoutOnResolveUSDC() public {
        // Create USDC market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(usdc)
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // Record balances before betting
        uint256 user1BalanceBefore = usdc.balanceOf(user1);
        uint256 user2BalanceBefore = usdc.balanceOf(user2);
        uint256 user3BalanceBefore = usdc.balanceOf(user3);

        // User1 bets 200 USDC on outcome 0 (winner)
        uint256 bet1 = 200 * 10 ** 6;
        vm.startPrank(user1);
        usdc.approve(address(market), bet1);
        market.predict(marketId, 0, bet1);
        vm.stopPrank();

        // User2 bets 300 USDC on outcome 1 (loser)
        uint256 bet2 = 300 * 10 ** 6;
        vm.startPrank(user2);
        usdc.approve(address(market), bet2);
        market.predict(marketId, 1, bet2);
        vm.stopPrank();

        // User3 bets 100 USDC on outcome 0 (winner)
        uint256 bet3 = 100 * 10 ** 6;
        vm.startPrank(user3);
        usdc.approve(address(market), bet3);
        market.predict(marketId, 0, bet3);
        vm.stopPrank();

        // Warp past finish time
        vm.warp(FINISH_TIME + 1);

        // Resolve market with outcome 0 as winner
        vm.prank(creator);
        market.resolveMarket(marketId, 0);

        // Check that winners received their payouts automatically
        uint256 user1BalanceAfter = usdc.balanceOf(user1);
        uint256 user3BalanceAfter = usdc.balanceOf(user3);

        // Total pool = 600 USDC
        // Winning pool (outcome 0) = 300 USDC
        // User1 winnings: (200 / 300) * 600 = 400 USDC
        // User3 winnings: (100 / 300) * 600 = 200 USDC
        uint256 expectedUser1Winnings = (bet1 * (bet1 + bet2 + bet3)) /
            (bet1 + bet3);
        uint256 expectedUser3Winnings = (bet3 * (bet1 + bet2 + bet3)) /
            (bet1 + bet3);

        assertEq(
            user1BalanceAfter,
            user1BalanceBefore - bet1 + expectedUser1Winnings
        );
        assertEq(
            user3BalanceAfter,
            user3BalanceBefore - bet3 + expectedUser3Winnings
        );

        // User2 should only have lost their bet
        uint256 user2BalanceAfter = usdc.balanceOf(user2);
        assertEq(user2BalanceAfter, user2BalanceBefore - bet2);
    }

    function testCannotSendETHToUSDCMarket() public {
        // Create USDC market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(usdc)
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // Try to send ETH to USDC market (should fail)
        vm.startPrank(user1);
        vm.expectRevert("Do not send ETH for token markets");
        market.predict{value: 1 ether}(marketId, 0, 100 * 10 ** 6);
        vm.stopPrank();
    }

    function testCannotUseUSDCWithoutApproval() public {
        // Create USDC market
        vm.startPrank(creator);
        uint256 marketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(usdc)
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // Try to bet without approval (should fail)
        vm.startPrank(user1);
        vm.expectRevert();
        market.predict(marketId, 0, 100 * 10 ** 6);
        vm.stopPrank();
    }

    function testMixedETHAndUSDCMarkets() public {
        // Create both ETH and USDC markets
        vm.startPrank(creator);
        uint256 ethMarketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(0) // ETH
        );
        uint256 usdcMarketId = market.createMarket(
            2,
            START_TIME,
            FINISH_TIME,
            address(usdc) // USDC
        );
        vm.stopPrank();

        // Warp to betting period
        vm.warp(START_TIME + 50);

        // Bet on ETH market
        vm.prank(user1);
        market.predict{value: 1 ether}(ethMarketId, 0, 0);

        // Bet on USDC market
        uint256 usdcBet = 100 * 10 ** 6;
        vm.startPrank(user2);
        usdc.approve(address(market), usdcBet);
        market.predict(usdcMarketId, 0, usdcBet);
        vm.stopPrank();

        // Verify both markets work independently
        PredictionMarket.Market memory marketEth = market.getMarket(
            ethMarketId
        );
        PredictionMarket.Market memory marketUsdc = market.getMarket(
            usdcMarketId
        );

        assertEq(marketEth.totalPool, 1 ether);
        assertEq(marketEth.paymentToken, address(0));
        assertEq(marketUsdc.totalPool, usdcBet);
        assertEq(marketUsdc.paymentToken, address(usdc));
    }
}
