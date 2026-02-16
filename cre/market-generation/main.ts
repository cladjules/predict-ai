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
};

const CLAUDE_PROMPT = `Generate 10 new prediction markets for upcoming events. For each market, provide:
- title: A clear, concise title for the prediction market
- description: A detailed description of what is being predicted
- options: An array of 2-4 possible outcomes that users can predict
- verificationUrl: A credible URL where the outcome can be verified when it resolves, it needs to be specific, not just the homepage of a news website
- resolvesAt: A date when the outcome is expected to be resolved

Focus on diverse topics like sports, politics, technology, entertainment, and economics. Make sure events will resolve within 1 week to 6 months.
We are currently in ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.

Return ONLY a valid JSON array of objects with these exact fields. No markdown, no explanation, just the JSON array.`;

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

const onCronTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("Market generation workflow triggered.");

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

  const httpClient = new cre.capabilities.HTTPClient();
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

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();

  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
