import {
  consensusIdenticalAggregation,
  HTTPClient,
  HTTPSendRequester,
  ok,
  Runtime,
  text,
} from "@chainlink/cre-sdk";
import { PredictionMarket } from "./types";

export type Config = {
  generationSchedule: string;
  resolutionSchedule: string;
  mockMarkets?: PredictionMarket[];
};

const CLAUDE_PROMPT = `You are a prediction market generator. Create 10 diverse and interesting prediction markets that people would want to bet on.

For each market, provide:
- title: A clear, concise title (max 100 chars)
- description: Detailed context and any relevant information (max 500 chars)
- options: 2-4 possible outcomes as an array of strings
- verificationUrl: A credible source URL that can be used to verify the outcome
- resolvesAt: ISO 8601 date when the market should resolve (between 1 week and 6 months from now)

Focus on diverse topics: sports, politics, technology, entertainment, economics, science, etc.
Ensure outcomes are clear, verifiable, and mutually exclusive.

Return ONLY a valid JSON array of objects matching this exact structure:
[
  {
    "title": "string",
    "description": "string",
    "options": ["string", "string"],
    "verificationUrl": "string",
    "resolvesAt": "2024-12-31T23:59:59Z"
  }
]`;

const fetchClaudeMarkets =
  (apiKey: string) => (sendRequester: HTTPSendRequester) => {
    const requestBody = Buffer.from(
      JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: CLAUDE_PROMPT,
          },
        ],
      }),
    ).toString("base64");

    const response = sendRequester
      .sendRequest({
        url: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: requestBody,
      })
      .result();

    if (!ok(response)) {
      throw new Error(
        `HTTP request failed with status: ${response.statusCode}`,
      );
    }

    return text(response);
  };

export const onGenerationTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("Market generation triggered.");

  const secretResult = runtime.getSecret({
    id: "CLAUDE_API_KEY",
  });
  const secret = secretResult.result();
  const apiKey = secret.value;

  if (!apiKey) {
    runtime.log("ERROR: CLAUDE_API_KEY not found in secrets");
    return "Error: Missing API key";
  }

  runtime.log("Calling Claude AI to generate prediction markets...");

  const httpClient = new HTTPClient();
  const responseText = httpClient
    .sendRequest(
      runtime,
      fetchClaudeMarkets(apiKey),
      consensusIdenticalAggregation<string>(),
    )()
    .result();

  runtime.log(`Claude API response: ${responseText}`);

  const apiResponse = JSON.parse(responseText);

  const content = apiResponse.content[0];

  if (content && content.type === "text") {
    const marketsJson = content.text
      .trim()
      .replace("```json", "")
      .replace("```", "");

    const markets = JSON.parse(marketsJson) as PredictionMarket[];

    runtime.log(`Successfully generated ${markets.length} prediction markets`);
    runtime.log(`Markets: ${JSON.stringify(markets, null, 2)}`);

    // TODO: Store markets in database calling our Backend REST Endpoint
    // TODO: Store markets in the contracts directly calling a CRE Capability that interacts with the contract

    return marketsJson;
  }

  runtime.log("ERROR: Unexpected response format from Claude");
  return "Error: Unexpected response format";
};
