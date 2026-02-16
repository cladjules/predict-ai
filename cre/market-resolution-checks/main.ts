import {
  cre,
  CronCapability,
  handler,
  Runner,
  type Runtime,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import { text, ok, HTTPSendRequester } from "@chainlink/cre-sdk";

import { PredictionMarket } from "../shared/types.js";

type Config = {
  schedule: string;
  mockMarkets?: PredictionMarket[];
};

const fetchCompletedMarkets =
  (apiKey: string, mockMarkets?: PredictionMarket[]) =>
  (sendRequester: HTTPSendRequester) => {
    let markets: PredictionMarket[] = mockMarkets ?? [];
    if (!mockMarkets) {
      // TODO: Fetch markets from DB, otherwise use mockMarkets in staging
    }

    const now = new Date();

    // Adjust resolvesAt times for markets without specific time
    const eligibleMarkets = markets.reduce<PredictionMarket[]>((vs, market) => {
      let marketDate = new Date(market.resolvesAt);
      // if the resolvesAt has no time, add 23:59:59 to avoid resolving too early
      if (marketDate.getHours() === 0) {
        marketDate = new Date(
          marketDate.getTime() +
            23 * 60 * 60 * 1000 +
            59 * 60 * 1000 +
            59 * 1000,
        );
      }

      if (marketDate > now) {
        return vs;
      }

      return [
        ...vs,
        {
          ...market,
          resolvesAt: marketDate.toISOString(),
        },
      ];
    }, []);

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

const onCronTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("Market resolution-checks workflow triggered.");

  const secretResult = runtime.getSecret({
    id: "CLAUDE_API_KEY",
  });
  const secret = secretResult.result();
  const apiKey = secret.value;

  if (!apiKey) {
    runtime.log("ERROR: CLAUDE_API_KEY not found in secrets");
    return "Error: Missing API key";
  }

  const httpClient = new cre.capabilities.HTTPClient();
  const resolvedMarkets = httpClient
    .sendRequest(
      runtime,
      fetchCompletedMarkets(apiKey, runtime.config.mockMarkets),
      consensusIdenticalAggregation<PredictionMarket[]>(),
    )()
    .result();

  console.log(resolvedMarkets);

  runtime.log(
    `Resolved ${resolvedMarkets.length} markets: ${JSON.stringify(resolvedMarkets)}`,
  );

  return `Resolved ${resolvedMarkets.length} markets`;
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();

  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
