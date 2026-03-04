// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ReceiverTemplateUpgradeable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PredictionMarket
 * @dev A decentralized prediction market contract where users can bet on outcomes
 * Supports both native ETH and any ERC20 token (e.g., USDC) for payments
 * Integrates with Chainlink CRE workflows via ReceiverTemplateUpgradeable
 * Uses UUPS proxy pattern for upgradeability
 */
contract PredictionMarket is ReceiverTemplateUpgradeable {
    using Address for address payable;
    using SafeERC20 for IERC20;

    struct Market {
        uint256 id;
        uint8 outcomeCount;
        uint256[] outcomePools; // Total amount bet on each outcome
        uint256 totalPool;
        uint256 finishesAt;
        uint8 winningOutcome;
        bool isResolved;
        address creator;
        address paymentToken; // address(0) for ETH, token address for ERC20
        bytes32 contentHash; // Hash of (question, description, creator, outcomes, finishesAt, paymentToken)
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

    // Reserve storage gap for future upgrades (50 slots)
    uint256[50] private __gap;

    // Events
    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        uint8 outcomeCount,
        uint256 finishesAt,
        address paymentToken,
        bytes32 contentHash
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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializer replaces constructor for upgradeable contracts
    /// @param _forwarderAddress The address of the Chainlink KeystoneForwarder contract
    function initialize(address _forwarderAddress) public initializer {
        __ReceiverTemplate_init(_forwarderAddress);
    }

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
     * @param _finishesAt Timestamp when betting ends
     * @param _paymentToken Token address (address(0) for native ETH, token address for ERC20)
     */
    function createMarket(
        uint8 _outcomeCount,
        uint256 _finishesAt,
        address _paymentToken
    ) external onlyOwner returns (uint256) {
        return
            _createMarket(
                _outcomeCount,
                _finishesAt,
                _paymentToken,
                msg.sender,
                bytes32(0) // No content hash for manual creation
            );
    }

    /**
     * @dev Internal function to create a new market
     * @param _outcomeCount Number of possible outcomes (2-4)
     * @param _finishesAt Timestamp when betting ends
     * @param _paymentToken Token address for payments (address(0) for ETH)
     * @param _creator Address of the market creator
     * @param _contentHash Hash of market content for matching with off-chain database
     * @notice Called by createMarket() after ownership check or by _processReport() for CRE workflow
     */
    function _createMarket(
        uint8 _outcomeCount,
        uint256 _finishesAt,
        address _paymentToken,
        address _creator,
        bytes32 _contentHash
    ) internal returns (uint256) {
        require(_outcomeCount >= 2, "Must have at least 2 outcomes");
        require(
            _finishesAt > block.timestamp,
            "Finish time must be in the future"
        );

        uint256 marketId = marketCount++;

        Market storage newMarket = markets[marketId];
        newMarket.id = marketId;
        newMarket.outcomeCount = _outcomeCount;
        newMarket.outcomePools = new uint256[](_outcomeCount);
        newMarket.totalPool = 0;
        newMarket.finishesAt = _finishesAt;
        newMarket.winningOutcome = 0;
        newMarket.isResolved = false;
        newMarket.creator = _creator;
        newMarket.paymentToken = _paymentToken;
        newMarket.contentHash = _contentHash;

        emit MarketCreated(
            marketId,
            _creator,
            _outcomeCount,
            _finishesAt,
            _paymentToken,
            _contentHash
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
    ) external payable {
        Market storage market = markets[_marketId];

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

        // Call internal _predictMarket with msg.sender as predictor
        _predictMarket(msg.sender, _marketId, _outcome, betAmount);
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
    ) external onlyOwner {
        require(
            msg.sender == markets[_marketId].creator,
            "Only creator can resolve"
        );
        require(
            block.timestamp > markets[_marketId].finishesAt,
            "Market not finished yet"
        );

        _resolveMarket(_marketId, _winningOutcome);
    }

    /**
     * @dev Internal function to resolve a market with the winning outcome and auto-payout winners
     * @param _marketId The market ID
     * @param _winningOutcome The winning outcome index
     * @notice Called by resolveMarket() after ownership checks or by _processReport() for CRE workflow
     */
    function _resolveMarket(
        uint256 _marketId,
        uint8 _winningOutcome
    ) internal marketExists(_marketId) marketNotResolved(_marketId) {
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
    ) external view marketExists(_marketId) returns (Market memory) {
        Market storage market = markets[_marketId];
        return market;
    }

    /**
     * @dev Get prediction details
     * @param _predictionId The prediction ID
     */
    function getPrediction(
        uint256 _predictionId
    ) external view returns (Prediction memory) {
        Prediction storage prediction = predictions[_predictionId];
        return prediction;
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
    function _predictMarket(
        address _predictor,
        uint256 _marketId,
        uint8 _outcome,
        uint256 _amount
    ) internal marketExists(_marketId) marketNotResolved(_marketId) {
        Market storage market = markets[_marketId];

        require(_predictor != address(0), "Invalid predictor address");
        require(_outcome < market.outcomeCount, "Invalid outcome");
        require(_amount > 0, "Amount must be greater than 0");
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
     * @dev Process incoming reports from Chainlink CRE workflows
     * Supports predictions, market resolutions, and market creation
     * @param report The encoded data from the CRE workflow
     * Format: (uint8 opType, ...data)
     *   opType 0: Prediction - (address predictor, uint256 marketId, uint8 outcome, uint256 amount, address paymentToken)
     *   opType 1: Resolution - (uint256 marketId, uint8 winningOutcome)
     *   opType 2: Market Creation - (uint8 outcomeCount, uint256 finishesAt, address paymentToken, address creator, bytes32 contentHash)
     * @notice This function is called by KeystoneForwarder after signature validation
     * @notice For predictions: Payment is assumed to have been collected via X402 before the report is sent
     * @notice For resolutions: Validation and authorization is performed by the CRE workflow
     * @notice For market creation: Creator address and contentHash are provided by the CRE workflow
     */
    function _processReport(bytes calldata report) internal override {
        // Decode operation type from first byte
        uint8 opType = abi.decode(report[:32], (uint8));

        if (opType == 0) {
            // Prediction operation
            (
                ,
                address predictor,
                uint256 marketId,
                uint8 outcome,
                uint256 amount,
                address paymentToken
            ) = abi.decode(
                    report,
                    (uint8, address, uint256, uint8, uint256, address)
                );

            // Check paymentToken matches market payment token
            require(
                paymentToken == markets[marketId].paymentToken,
                "Payment token mismatch"
            );

            // Call the internal _predictMarket function
            _predictMarket(predictor, marketId, outcome, amount);
        } else if (opType == 1) {
            // Resolution operation
            (, uint256 marketId, uint8 winningOutcome) = abi.decode(
                report,
                (uint8, uint256, uint8)
            );

            // Validate market exists and is not resolved
            require(marketId < marketCount, "Market does not exist");
            require(!markets[marketId].isResolved, "Market already resolved");

            // Call the internal resolution function
            _resolveMarket(marketId, winningOutcome);
        } else if (opType == 2) {
            // Market creation operation
            (
                ,
                uint8 outcomeCount,
                uint256 finishesAt,
                address paymentToken,
                address creator,
                bytes32 contentHash
            ) = abi.decode(
                    report,
                    (uint8, uint8, uint256, address, address, bytes32)
                );

            // Call the internal market creation function
            _createMarket(
                outcomeCount,
                finishesAt,
                paymentToken,
                creator,
                contentHash
            );
        } else {
            revert("Invalid operation type");
        }
    }
}
