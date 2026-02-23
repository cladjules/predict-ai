// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ReceiverTemplate.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PredictionMarket
 * @dev A decentralized prediction market contract where users can bet on outcomes
 * Supports both native ETH and any ERC20 token (e.g., USDC) for payments
 * Integrates with Chainlink CRE workflows via ReceiverTemplate
 */
contract PredictionMarket is ReceiverTemplate {
    using Address for address payable;
    using SafeERC20 for IERC20;
    struct Market {
        uint256 id;
        uint8 outcomeCount;
        uint256[] outcomePools; // Total amount bet on each outcome
        uint256 totalPool;
        uint256 startsAt;
        uint256 finishesAt;
        uint8 winningOutcome;
        bool isResolved;
        address creator;
        address paymentToken; // address(0) for ETH, token address for ERC20
    }

    struct Prediction {
        uint256 marketId;
        address predictor;
        uint8 outcome;
        uint256 amount;
    }

    // State variables
    uint256 public marketCount;
    uint256 public predictionCount;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => Prediction) public predictions;
    mapping(address => uint256[]) public userPredictions;
    mapping(uint256 => uint256[]) public marketPredictions;

    // Events
    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        uint8 outcomeCount,
        uint256 startsAt,
        uint256 finishesAt,
        address paymentToken
    );

    event PredictionPlaced(
        uint256 indexed predictionId,
        uint256 indexed marketId,
        address indexed predictor,
        uint8 outcome,
        uint256 amount,
        uint256 timestamp
    );

    event MarketResolved(
        uint256 indexed marketId,
        uint8 winningOutcome,
        uint256 totalPool,
        uint256 timestamp
    );

    event WinningsPaid(
        uint256 indexed predictionId,
        address indexed predictor,
        uint256 amount
    );

    event EmergencyWithdrawETH(address indexed owner, uint256 amount);

    event EmergencyWithdrawToken(
        address indexed owner,
        address indexed token,
        uint256 amount
    );

    /// @notice Constructor sets up the contract with the Chainlink forwarder address
    /// @param _forwarderAddress The address of the Chainlink KeystoneForwarder contract
    constructor(
        address _forwarderAddress
    ) ReceiverTemplate(_forwarderAddress) {}

    // Modifiers
    modifier marketExists(uint256 _marketId) {
        require(_marketId < marketCount, "Market does not exist");
        _;
    }

    modifier marketNotResolved(uint256 _marketId) {
        require(!markets[_marketId].isResolved, "Market already resolved");
        _;
    }

    modifier marketResolved(uint256 _marketId) {
        require(markets[_marketId].isResolved, "Market not yet resolved");
        _;
    }

    /**
     * @dev Create a new prediction market
     * @param _outcomeCount Number of possible outcomes
     * @param _startsAt Timestamp when betting starts
     * @param _finishesAt Timestamp when betting ends
     * @param _paymentToken Token address (address(0) for native ETH, token address for ERC20)
     */
    function createMarket(
        uint8 _outcomeCount,
        uint256 _startsAt,
        uint256 _finishesAt,
        address _paymentToken
    ) external onlyOwner returns (uint256) {
        require(_outcomeCount >= 2, "Must have at least 2 outcomes");
        require(_startsAt >= block.timestamp, "Start time must be in future");
        require(_finishesAt > _startsAt, "Finish time must be after start");

        uint256 marketId = marketCount++;

        Market storage newMarket = markets[marketId];
        newMarket.id = marketId;
        newMarket.outcomeCount = _outcomeCount;
        newMarket.outcomePools = new uint256[](_outcomeCount);
        newMarket.totalPool = 0;
        newMarket.startsAt = _startsAt;
        newMarket.finishesAt = _finishesAt;
        newMarket.winningOutcome = 0;
        newMarket.isResolved = false;
        newMarket.creator = msg.sender;
        newMarket.paymentToken = _paymentToken;

        emit MarketCreated(
            marketId,
            msg.sender,
            _outcomeCount,
            _startsAt,
            _finishesAt,
            _paymentToken
        );

        return marketId;
    }

    /**
     * @dev Place a prediction on a market outcome
     * @param _marketId The market ID
     * @param _outcome The outcome index to bet on
     * @param _amount The amount to bet (required for ERC20, ignored for ETH where msg.value is used)
     */
    function predict(
        uint256 _marketId,
        uint8 _outcome,
        uint256 _amount
    ) external payable marketExists(_marketId) marketNotResolved(_marketId) {
        Market storage market = markets[_marketId];

        require(block.timestamp >= market.startsAt, "Market not started");
        require(block.timestamp <= market.finishesAt, "Market finished");
        require(_outcome < market.outcomeCount, "Invalid outcome");

        uint256 betAmount;

        if (market.paymentToken == address(0)) {
            // Native ETH payment
            require(msg.value > 0, "Must send ETH to predict");
            betAmount = msg.value;
        } else {
            // ERC20 token payment
            require(msg.value == 0, "Do not send ETH for token markets");
            require(_amount > 0, "Must specify bet amount");
            betAmount = _amount;

            // Transfer tokens from user to contract
            IERC20(market.paymentToken).safeTransferFrom(
                msg.sender,
                address(this),
                betAmount
            );
        }

        // Call internal predictFor with msg.sender as predictor
        predictFor(msg.sender, _marketId, _outcome, betAmount);
    }

    /**
     * @dev Resolve a market with the winning outcome and auto-payout winners
     * @param _marketId The market ID
     * @param _winningOutcome The winning outcome index
     * Note: All payouts must succeed or entire transaction reverts.
     * Gas intensive for markets with many predictions. Consider batching for large markets.
     * Re-entrancy protected by Checks-Effects-Interactions: state updated before transfers.
     */
    function resolveMarket(
        uint256 _marketId,
        uint8 _winningOutcome
    ) external onlyOwner marketExists(_marketId) marketNotResolved(_marketId) {
        require(
            msg.sender == markets[_marketId].creator,
            "Only creator can resolve"
        );
        require(
            block.timestamp > markets[_marketId].finishesAt,
            "Market not finished yet"
        );
        require(
            _winningOutcome < markets[_marketId].outcomeCount,
            "Invalid outcome"
        );

        Market storage market = markets[_marketId];

        // Mark as resolved BEFORE payouts (Checks-Effects-Interactions)
        market.isResolved = true;
        market.winningOutcome = _winningOutcome;

        emit MarketResolved(
            _marketId,
            _winningOutcome,
            market.totalPool,
            block.timestamp
        );

        // Auto-payout all winners
        uint256[] memory predictionIds = marketPredictions[_marketId];
        uint256 winningPool = market.outcomePools[_winningOutcome];

        // Skip payouts if no one bet on winning outcome
        if (winningPool == 0) {
            return;
        }

        for (uint256 i = 0; i < predictionIds.length; i++) {
            Prediction storage prediction = predictions[predictionIds[i]];

            // Only process winning predictions that haven't been paid
            if (prediction.outcome == _winningOutcome) {
                // Calculate winnings using shared function
                uint256 winnings = calculateWinnings(predictionIds[i]);

                // Transfer winnings - reverts on failure
                _transferPayout(
                    market.paymentToken,
                    prediction.predictor,
                    winnings
                );

                emit WinningsPaid(
                    predictionIds[i],
                    prediction.predictor,
                    winnings
                );
            }
        }
    }

    /**
     * @dev Internal function to transfer payout (ETH or ERC20)
     * Reverts on failure to ensure all payouts succeed or entire resolution fails
     * @param _paymentToken Token address (address(0) for ETH)
     * @param _to Recipient address
     * @param _amount Amount to transfer
     */
    function _transferPayout(
        address _paymentToken,
        address _to,
        uint256 _amount
    ) internal {
        if (_paymentToken == address(0)) {
            // Native ETH: use sendValue which reverts on failure
            payable(_to).sendValue(_amount);
        } else {
            // ERC20 token: use safeTransfer which reverts on failure
            IERC20(_paymentToken).safeTransfer(_to, _amount);
        }
    }

    /**
     * @dev Get market details
     * @param _marketId The market ID
     */
    function getMarket(
        uint256 _marketId
    )
        external
        view
        marketExists(_marketId)
        marketExists(_marketId)
        returns (
            uint256 id,
            uint8 outcomeCount,
            uint256[] memory outcomePools,
            uint256 totalPool,
            uint256 startsAt,
            uint256 finishesAt,
            uint8 winningOutcome,
            bool isResolved,
            address creator,
            address paymentToken
        )
    {
        Market storage market = markets[_marketId];
        return (
            market.id,
            market.outcomeCount,
            market.outcomePools,
            market.totalPool,
            market.startsAt,
            market.finishesAt,
            market.winningOutcome,
            market.isResolved,
            market.creator,
            market.paymentToken
        );
    }

    /**
     * @dev Get prediction details
     * @param _predictionId The prediction ID
     */
    function getPrediction(
        uint256 _predictionId
    )
        external
        view
        returns (
            uint256 marketId,
            address predictor,
            uint8 outcome,
            uint256 amount
        )
    {
        Prediction storage prediction = predictions[_predictionId];
        return (
            prediction.marketId,
            prediction.predictor,
            prediction.outcome,
            prediction.amount
        );
    }

    /**
     * @dev Get all predictions for a user
     * @param _user The user address
     */
    function getUserPredictions(
        address _user
    ) external view returns (uint256[] memory) {
        return userPredictions[_user];
    }

    /**
     * @dev Get all predictions for a market
     * @param _marketId The market ID
     */
    function getMarketPredictions(
        uint256 _marketId
    ) external view marketExists(_marketId) returns (uint256[] memory) {
        return marketPredictions[_marketId];
    }

    /**
     * @dev Calculate potential winnings for a given outcome and bet amount
     * Useful for previewing winnings before placing a bet
     * @param _marketId The market ID
     * @param _outcome The outcome to bet on
     * @param _amount The amount to bet
     * @return The potential winnings if this outcome wins
     */
    function calculatePotentialWinnings(
        uint256 _marketId,
        uint8 _outcome,
        uint256 _amount
    ) external view marketExists(_marketId) returns (uint256) {
        Market storage market = markets[_marketId];

        require(_outcome < market.outcomeCount, "Invalid outcome");
        require(_amount > 0, "Amount must be greater than 0");

        // Calculate what the pools would be after this bet
        uint256 newOutcomePool = market.outcomePools[_outcome] + _amount;
        uint256 newTotalPool = market.totalPool + _amount;

        if (newOutcomePool == 0) {
            return 0;
        }

        // Return potential winnings: (user's bet / winning pool) * total pool
        return (_amount * newTotalPool) / newOutcomePool;
    }

    /**
     * @dev Calculate actual winnings for a prediction (after market resolved)
     * @param _predictionId The prediction ID
     * @return The winnings amount
     */
    function calculateWinnings(
        uint256 _predictionId
    ) public view returns (uint256) {
        Prediction storage prediction = predictions[_predictionId];
        Market storage market = markets[prediction.marketId];

        // No winnings if market not resolved or prediction lost
        if (!market.isResolved || prediction.outcome != market.winningOutcome) {
            return 0;
        }

        uint256 winningPool = market.outcomePools[market.winningOutcome];
        if (winningPool == 0) {
            return 0;
        }

        // Calculate winnings: (user's bet / winning pool) * total pool
        return (prediction.amount * market.totalPool) / winningPool;
    }

    /**
     * @dev Emergency withdraw ETH from contract
     * Only callable by owner in case of emergency
     * @param _amount Amount of ETH to withdraw
     */
    function emergencyWithdrawETH(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Amount must be greater than 0");
        require(
            address(this).balance >= _amount,
            "Insufficient contract balance"
        );

        payable(owner()).sendValue(_amount);

        emit EmergencyWithdrawETH(owner(), _amount);
    }

    /**
     * @dev Emergency withdraw ERC20 tokens from contract
     * Only callable by owner in case of emergency
     * @param _token Token address to withdraw
     * @param _amount Amount of tokens to withdraw
     */
    function emergencyWithdrawToken(
        address _token,
        uint256 _amount
    ) external onlyOwner {
        require(_token != address(0), "Invalid token address");
        require(_amount > 0, "Amount must be greater than 0");

        IERC20 token = IERC20(_token);
        require(
            token.balanceOf(address(this)) >= _amount,
            "Insufficient token balance"
        );

        token.safeTransfer(owner(), _amount);

        emit EmergencyWithdrawToken(owner(), _token, _amount);
    }

    /**
     * @dev Internal function to place a prediction (no payment collected)
     * @param _predictor The address of the user making the prediction
     * @param _marketId The market ID to predict on
     * @param _outcome The outcome being predicted
     * @param _amount The bet amount
     * @notice This function does NOT collect payment - it assumes payment was already collected
     * @notice Called by predict() after payment collection or by _processReport() for CRE workflow
     */
    function predictFor(
        address _predictor,
        uint256 _marketId,
        uint8 _outcome,
        uint256 _amount
    ) internal {
        Market storage market = markets[_marketId];

        require(_predictor != address(0), "Invalid predictor address");
        require(_outcome < market.outcomeCount, "Invalid outcome");
        require(_amount > 0, "Amount must be greater than 0");
        require(
            block.timestamp >= market.startsAt,
            "Market has not started yet"
        );
        require(block.timestamp < market.finishesAt, "Market has finished");

        // Create prediction record
        uint256 predictionId = predictionCount;
        predictions[predictionId] = Prediction({
            marketId: _marketId,
            predictor: _predictor,
            outcome: _outcome,
            amount: _amount
        });

        // Update mappings and totals
        userPredictions[_predictor].push(predictionId);
        marketPredictions[_marketId].push(predictionId);
        market.outcomePools[_outcome] += _amount;
        market.totalPool += _amount;

        predictionCount++;

        emit PredictionPlaced(
            predictionId,
            _marketId,
            _predictor,
            _outcome,
            _amount,
            block.timestamp
        );
    }

    /**
     * @dev Process incoming prediction reports from Chainlink CRE workflows
     * @param report The encoded prediction data from the CRE workflow
     * @notice This function is called by KeystoneForwarder after signature validation
     * @notice Payment is assumed to have been collected via X402 before the report is sent
     * @notice x402TxHash is tracked in backend database, not stored on-chain for gas efficiency
     */
    function _processReport(bytes calldata report) internal override {
        // Decode the prediction data from the report
        (
            address predictor,
            uint256 marketId,
            uint8 outcome,
            uint256 amount,
            address paymentToken
        ) = abi.decode(report, (address, uint256, uint8, uint256, address));

        // check paymentToken matches market payment token
        require(
            paymentToken == markets[marketId].paymentToken,
            "Payment token mismatch"
        );

        // Call the public predictFor function
        predictFor(predictor, marketId, outcome, amount);
    }
}
