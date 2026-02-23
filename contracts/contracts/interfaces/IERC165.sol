// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title IERC165 - Interface for ERC165 standard interface detection
/// @notice Interface of the ERC165 standard, as defined in the
/// https://eips.ethereum.org/EIPS/eip-165[EIP].
interface IERC165 {
    /// @notice Query if a contract implements an interface
    /// @param interfaceId The interface identifier, as specified in ERC-165
    /// @return `true` if the contract implements `interfaceID` and
    /// `interfaceID` is not 0xffffffff, `false` otherwise
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
