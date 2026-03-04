import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { type Hex, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface JSONRPCRequest {
  jsonrpc: string;
  id: string;
  method: string;
  params: {
    input: any;
    workflow: any;
  };
}

export const createJWT = async (
  request: JSONRPCRequest,
  privateKey: Hex,
): Promise<string> => {
  const account = privateKeyToAccount(privateKey);
  const address = account.address;

  // Create JWT header
  const header = {
    alg: "ETH",
    typ: "JWT",
  };

  // Create JWT payload with request and metadata
  const now = Math.floor(Date.now() / 1000);

  // Note: Request needs to be in the following order:
  // Version string  `json:"jsonrpc"`
  // ID      string  `json:"id"`
  // Method  string  `json:"method"`
  // Params  *Params `json:"params"`

  const payload = {
    digest: `0x${sha256(request)}`,
    iss: address,
    iat: now,
    exp: now + 300, // 5 minutes expiration
    jti: uuidv4(),
  };

  // Encode header and payload to base64url
  const encodedHeader = base64URLEncode(
    Buffer.from(JSON.stringify(header), "utf8").toString("base64"),
  );
  const encodedPayload = base64URLEncode(
    Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
  );
  const rawMessage = `${encodedHeader}.${encodedPayload}`;

  // Sign the message - viem's signMessage handles the Ethereum Signed Message prefix and hashing
  const signature = await account.signMessage({
    message: rawMessage,
  });

  // Convert signature to JWT format (r, s, v components)
  const { r, s, v, yParity } = parseSignature(signature);
  // Use yParity if v is undefined (yParity is 0 or 1)
  const recoveryId = v !== undefined ? (v >= 27n ? v - 27n : v) : yParity;

  if (recoveryId === undefined) {
    throw new Error("Unable to extract recovery ID from signature");
  }

  // Combine r, s, and adjusted v into a single buffer
  // Ensure r and s are exactly 32 bytes each by padding with leading zeros if needed
  const rBuffer = Buffer.from(r.slice(2).padStart(64, "0"), "hex"); // 32 bytes = 64 hex chars
  const sBuffer = Buffer.from(s.slice(2).padStart(64, "0"), "hex"); // 32 bytes = 64 hex chars
  const signatureBytes = Buffer.concat([
    rBuffer,
    sBuffer,
    Buffer.from([Number(recoveryId)]),
  ]);
  const encodedSignature = base64URLEncode(signatureBytes.toString("base64"));
  return `${rawMessage}.${encodedSignature}`;
};

// Helper function to compute SHA256 hash
export const sha256 = (data: any): string => {
  const jsonString =
    typeof data === "string" ? data : (JSON.stringify(data) ?? "");
  return createHash("sha256").update(jsonString).digest("hex");
};

// Helper function to convert base64 string to base64url by replacing URL-unsafe characters
export const base64URLEncode = (str: string): string =>
  str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

/**
 * Get deployed contract address from local deployment config
 *
 * Run 'npm run sync-deployment' in the contracts folder to update the config
 */
export const getDeployedContractAddress = (): string => {
  const network = process.env.NETWORK as `${string}:${string}` | undefined;

  if (!network) {
    console.warn("⚠️  NETWORK env variable not set");
    return "";
  }

  // Extract chain ID from network (e.g., "eip155:8453" -> "8453")
  const chainId = network.split(":")[1];

  try {
    const fs = require("fs");
    const path = require("path");

    // Path to local deployment config
    const configPath = path.join(__dirname, "deployed-contracts.json");

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const chainConfig = config[chainId];

      if (chainConfig?.PredictionMarket) {
        console.log(
          `✅ Loaded contract address for chain ${chainId}: ${chainConfig.PredictionMarket}`,
        );
        return chainConfig.PredictionMarket;
      }
    }

    console.warn(
      `⚠️  No deployment found for chain ${chainId}, using env fallback`,
    );
  } catch (error) {
    console.error("❌ Error reading deployment config:", error);
  }

  return "";
};
