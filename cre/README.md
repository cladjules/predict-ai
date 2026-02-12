# Predict AI workflows

AI-powered prediction market generation platform using Claude AI.

## Project Structure

- `market-generation/` - AI Agent that generates new prediction markets every hour

## Getting Started

### Prerequisites

If `bun` is not already installed, see https://bun.com/docs/installation for installing in your environment.

### Installation

Install dependencies for the market generation workflow:

```bash
cd market-generation && npm install
```

### Simulate the Workflow

Run the command from the project root directory:

```bash
cre workflow simulate market-generation
```

## Configuration

The project uses configuration files located in the `market-generation/` directory:

- `config.production.json` - Production settings (runs every hour)
- `config.staging.json` - Staging/development settings

## Git Repository

```
git@github.com:cladjules/predict-ai.git
```
