import { handler, Runner, CronCapability } from "@chainlink/cre-sdk";
import { Config, onGenerationTrigger } from "./generationHandler";
import { onResolutionTrigger } from "./resolutionHandler";

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();

  return [
    handler(
      cron.trigger({ schedule: config.generationSchedule }),
      onGenerationTrigger,
    ),
    handler(
      cron.trigger({ schedule: config.resolutionSchedule }),
      onResolutionTrigger,
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
