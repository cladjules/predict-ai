import { getNetwork as _getNetwork } from "@chainlink/cre-sdk";

export const getNetwork = (chainSelectorName: string) =>
  _getNetwork({
    chainFamily: "evm",
    // See chain selectors in https://github.com/smartcontractkit/chain-selectors/blob/main/all_selectors.yml
    chainSelectorName: chainSelectorName,
    isTestnet: [
      "testnet",
      "sepolia",
      "goerli",
      "rinkeby",
      "ropsten",
      "kovan",
    ].some((testnet) => chainSelectorName.includes(testnet)),
  });
