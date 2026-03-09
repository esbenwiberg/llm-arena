import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import chalk from 'chalk';
import type { ModelSpec, StrategyName, RunConfig } from './types.js';
import { parseBlueprint } from './blueprint.js';
import { executeRun } from './runner.js';
import { renderScorecard, saveResults } from './scorecard.js';

const LOGO = `
${chalk.red(`    ╔═══════════════════════════════════════════════════════╗
    ║                                                       ║`)}
${chalk.red(`    ║`)}  ${chalk.bold.white(`██╗     ██╗     ███╗   ███╗`)}                        ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.bold.white(`██║     ██║     ████╗ ████║`)}                        ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.bold.white(`██║     ██║     ██╔████╔██║`)}                        ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.bold.white(`██║     ██║     ██║╚██╔╝██║`)}                        ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.bold.white(`███████╗███████╗██║ ╚═╝ ██║`)}                        ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.bold.white(`╚══════╝╚══════╝╚═╝     ╚═╝`)}                        ${chalk.red(`║`)}
${chalk.red(`    ║`)}                                                       ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.yellow.bold(`   █████╗ ██████╗ ███████╗███╗   ██╗ █████╗`)}        ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.yellow.bold(`  ██╔══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗`)}       ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.yellow.bold(`  ███████║██████╔╝█████╗  ██╔██╗ ██║███████║`)}       ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.yellow.bold(`  ██╔══██║██╔══██╗██╔══╝  ██║╚██╗██║██╔══██║`)}       ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.yellow.bold(`  ██║  ██║██║  ██║███████╗██║ ╚████║██║  ██║`)}       ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.yellow.bold(`  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝`)}       ${chalk.red(`║`)}
${chalk.red(`    ║`)}                                                       ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.dim(`   ⚔  Model vs Model  ⚔  Strategy vs Strategy  ⚔`)}  ${chalk.red(`║`)}
${chalk.red(`    ║`)}  ${chalk.dim(`        Who survives the arena? FIGHT!`)}              ${chalk.red(`║`)}
${chalk.red(`    ║`)}                                                       ${chalk.red(`║`)}
${chalk.red(`    ╚═══════════════════════════════════════════════════════╝`)}
`;

interface ParsedModelSpec {
  spec: ModelSpec;
  strategy?: StrategyName;
}

function parseModelSpec(value: string): ParsedModelSpec {
  // Support backend:model@strategy syntax for per-model strategy override
  let strategy: StrategyName | undefined;
  let raw = value;

  const atIdx = value.lastIndexOf('@');
  if (atIdx !== -1) {
    const maybeName = value.slice(atIdx + 1);
    if (['single-pass', 'retry', 'self-critique', 'adversarial'].includes(maybeName)) {
      strategy = maybeName as StrategyName;
      raw = value.slice(0, atIdx);
    }
  }

  const [backend, ...rest] = raw.split(':');
  const model = rest.join(':');
  if (!backend || !model) {
    throw new Error(`Invalid model spec: ${value}. Use format backend:model[@strategy] (e.g. anthropic:claude-haiku-4-5-20251001@retry)`);
  }
  if (backend !== 'anthropic' && backend !== 'ollama') {
    throw new Error(`Unknown backend: ${backend}. Use 'anthropic' or 'ollama'`);
  }
  return { spec: { backend: backend as 'anthropic' | 'ollama', model }, strategy };
}

const program = new Command()
  .name('arena')
  .description('LLM Arena — Model comparison harness')
  .version('0.1.0');

program
  .command('run')
  .description('Run models against a blueprint')
  .requiredOption('-b, --blueprint <path>', 'Path to blueprint markdown file')
  .option('-m, --model <spec...>', 'Model spec (backend:model), repeatable', [])
  .option('-s, --strategy <names>', 'Comma-separated strategies', 'single-pass')
  .option('--max-rounds <n>', 'Max iteration rounds per strategy', '5')
  .option('--max-tokens <n>', 'Token budget per round', '4096')
  .option('--critic <spec>', 'Critic model for adversarial strategy')
  .option('--parallel', 'Run combinations in parallel', false)
  .action(async (opts) => {
    console.log(LOGO);

    if (opts.model.length === 0) {
      console.error(chalk.red('Error: At least one --model is required'));
      process.exit(1);
    }

    const blueprintPath = resolve(opts.blueprint);
    const blueprint = await parseBlueprint(blueprintPath);
    const parsed = opts.model.map(parseModelSpec);
    const globalStrategies = (opts.strategy as string).split(',').map((s) => s.trim()) as StrategyName[];
    const maxRounds = parseInt(opts.maxRounds, 10);
    const maxTokens = parseInt(opts.maxTokens, 10);
    const criticParsed = opts.critic ? parseModelSpec(opts.critic) : undefined;
    const critic = criticParsed?.spec;

    const hasPerModelStrategies = parsed.some((p) => p.strategy);

    console.log(chalk.bold(`Blueprint: ${blueprint.name}`));
    console.log(chalk.dim(`Models: ${parsed.map((p) => `${p.spec.backend}:${p.spec.model}${p.strategy ? `@${p.strategy}` : ''}`).join(', ')}`));
    if (!hasPerModelStrategies) {
      console.log(chalk.dim(`Strategies: ${globalStrategies.join(', ')}`));
    }
    console.log(chalk.dim(`Max rounds: ${maxRounds}, Max tokens: ${maxTokens}`));
    console.log();

    // Build combinations: per-model strategy overrides the global -s
    const configs: RunConfig[] = [];
    for (const { spec: model, strategy: perModelStrategy } of parsed) {
      const strategies = perModelStrategy ? [perModelStrategy] : globalStrategies;
      for (const strategy of strategies) {
        configs.push({ blueprint, blueprintPath, model, strategy, maxRounds, maxTokens, critic });
      }
    }

    let results;
    if (opts.parallel) {
      results = await Promise.all(configs.map((c) => runWithHeader(c)));
    } else {
      results = [];
      for (const config of configs) {
        results.push(await runWithHeader(config));
      }
    }

    renderScorecard(results);

    const resultsDir = resolve('results');
    await saveResults(results, resultsDir);
  });

program
  .command('models')
  .description('List available model backends')
  .action(() => {
    console.log(LOGO);
    console.log(chalk.bold('Available backends:\n'));
    console.log('  anthropic:<model>  — Anthropic API (requires LLM_ARENA_ANTHROPIC_KEY or ANTHROPIC_API_KEY)');
    console.log('    Examples:');
    console.log('      anthropic:claude-haiku-4-5-20251001');
    console.log('      anthropic:claude-sonnet-4-6-20250514');
    console.log('      anthropic:claude-opus-4-6-20250610');
    console.log();
    console.log('  ollama:<model>     — Ollama local models (requires ollama running)');
    console.log('    Examples:');
    console.log('      ollama:qwen3-coder');
    console.log('      ollama:llama3.1');
    console.log('      ollama:codellama');
    console.log();
  });

program
  .command('results')
  .description('View results from a previous run')
  .requiredOption('--run <id>', 'Run ID to view')
  .action(async (opts) => {
    console.log(LOGO);
    const resultsDir = resolve('results');
    const filePath = join(resultsDir, `${opts.run}.json`);
    try {
      const data = JSON.parse(await readFile(filePath, 'utf-8'));
      renderScorecard(data);
      for (const result of data) {
        console.log(chalk.bold(`\n--- ${result.model.backend}:${result.model.model} / ${result.strategy} ---`));
        for (const round of result.rounds) {
          console.log(`  Round ${round.round} (${round.phase}): ${round.testsPassed ? chalk.green('PASS') : chalk.red('FAIL')}`);
          if (round.critique) {
            console.log(chalk.dim(`  Critique: ${round.critique.slice(0, 200)}...`));
          }
        }
      }
    } catch {
      console.error(chalk.red(`Results not found: ${filePath}`));
      process.exit(1);
    }
  });

async function runWithHeader(config: RunConfig) {
  console.log(chalk.bold.cyan(`\n${'='.repeat(60)}`));
  console.log(chalk.bold.cyan(`  ${config.model.backend}:${config.model.model} + ${config.strategy}`));
  console.log(chalk.bold.cyan(`${'='.repeat(60)}\n`));
  return executeRun(config);
}

program.parse();
