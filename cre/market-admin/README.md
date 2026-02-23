# Market Admin Workflow

Consolidated workflow for administrative market operations.

## Features

### Market Generation

- **Trigger**: Cron schedule (configurable)
- **Function**: Generates new prediction markets using Claude AI
- **Frequency**: Every hour (staging), every 12 hours (production)
- **Output**: 10 diverse prediction markets

### Market Resolution

- **Trigger**: Cron schedule (configurable)
- **Function**: Checks and resolves completed markets using Claude AI
- **Frequency**: Every 30 minutes (staging), every hour (production)
- **Output**: Resolution outcomes for eligible markets

## Configuration

### Schedules

- `generationSchedule`: Cron expression for market generation
- `resolutionSchedule`: Cron expression for market resolution checks
- `mockMarkets`: Array of mock markets for testing (staging only)

### Secrets

- `CLAUDE_API_KEY`: API key for Claude AI (Anthropic)

## Deployment

```bash
# Deploy to staging
cre workflow deploy staging-settings

# Deploy to production
cre workflow deploy production-settings
```

## TODO

- Implement database API for storing generated markets
- Implement on-chain resolution trigger via CRE capabilities
- Add monitoring and alerting for failed generations/resolutions
