import {
  Runtime,
  HTTPSendRequester,
  HTTPClient,
  consensusIdenticalAggregation,
  text,
  ok,
} from "@chainlink/cre-sdk";
import { PredictionMarket } from "./types";
import { Config } from "./generationHandler";

const fetchCompletedMarkets =
  (apiKey: string, mockMarkets?: PredictionMarket[]) =>
  (sendRequester: HTTPSendRequester) => {
    // TODO: Replace with actual database API call
    // const markets = await fetch('https://api.example.com/markets/completed')

    // For now, use mock markets if provided
    const allMarkets = mockMarkets || [];

    // Filter markets where resolvesAt is in the past
    const now = new Date();
    const eligibleMarkets = allMarkets.reduce((acc, market) => {
      let resolvesAt = new Date(market.resolvesAt);

      // If the time is exactly "00:00:00", adjust to end of day
      if (
        resolvesAt.getHours() === 0 &&
        resolvesAt.getMinutes() === 0 &&
        resolvesAt.getSeconds() === 0
      ) {
        resolvesAt = new Date(
          resolvesAt.getFullYear(),
          resolvesAt.getMonth(),
          resolvesAt.getDate(),
          23,
          59,
          59,
        );
      }

      if (resolvesAt <= now) {
        return [
          ...acc,
          {
            ...market,
            resolvesAt: resolvesAt.toISOString(),
          },
        ];
      }

      return acc;
    }, [] as PredictionMarket[]);

    if (eligibleMarkets.length === 0) {
      return [];
    }

    // Build a single prompt with all markets
    const marketsList = eligibleMarkets
      .map(
        (market, idx) =>
          `${idx + 1}. Title: "${market.title}"
   Description: "${market.description}"
   Options: ${market.options.join(", ")}
   Expected Resolution: ${market.resolvesAt}`,
      )
      .join("\n\n");

    const prompt = `Check which of the following prediction markets have resolved. For each market that has resolved, provide the outcome from the available options. For markets that have not resolved yet, skip them.

${marketsList}

Return your response as a JSON array with objects containing: { "marketIndex": number (1-based), "resolved": boolean, "outcome": string (the winning option or explanation) }

Only include markets that have resolved. Return an empty array [] if none have resolved.`;

    const requestBody = Buffer.from(
      JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: prompt,
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

    const apiResponse = JSON.parse(text(response))?.content[0];

    if (!apiResponse || apiResponse.type !== "text") {
      return [];
    }

    const jsonMatch = apiResponse.text.trim().match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const results = JSON.parse(jsonMatch[0]) as Array<{
      marketIndex: number;
      resolved: boolean;
      outcome: string;
    }>;

    // Map results back to markets
    const resolvedMarkets: PredictionMarket[] = results
      .filter((r) => r.resolved)
      .map((r) => ({
        ...eligibleMarkets[r.marketIndex - 1],
        resolvedOption: r.outcome,
      }));

    return resolvedMarkets;
  };

export const onResolutionTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("Market resolution-checks triggered.");

  const secretResult = runtime.getSecret({
    id: "CLAUDE_API_KEY",
  });
  const secret = secretResult.result();
  const apiKey = secret.value;

  if (!apiKey) {
    runtime.log("ERROR: CLAUDE_API_KEY not found in secrets");
    return "Error: Missing API key";
  }

  const httpClient = new HTTPClient();
  const resolvedMarkets = httpClient
    .sendRequest(
      runtime,
      fetchCompletedMarkets(apiKey, runtime.config.mockMarkets),
      consensusIdenticalAggregation<PredictionMarket[]>(),
    )()
    .result();

  runtime.log(
    `Resolved ${resolvedMarkets.length} markets: ${JSON.stringify(resolvedMarkets)}`,
  );

  // TODO: Trigger on-chain resolution for each resolved market
  // TODO: Update database with resolution results

  return `Resolved ${resolvedMarkets.length} markets`;
};
