#!/usr/bin/env node
/**
 * SISU API CLI — auto-generated from openapi/sisu-v1.yaml
 *
 * DO NOT EDIT MANUALLY — regenerate with: pnpm generate
 *
 * This CLI covers all endpoints defined in openapi/sisu-v1.yaml.
 * See README.md for regeneration instructions.
 */

import { Command } from 'commander';
import { ApiError, SisuApiClient } from './client.js';
import { printJson, printTable } from './output.js';

const DEFAULT_BASE_URL = process.env.SISU_API_URL ?? 'http://localhost:3000/v1';

function makeClient(opts: { url?: string }): SisuApiClient {
  return new SisuApiClient(opts.url ?? DEFAULT_BASE_URL);
}

function handleError(err: unknown): never {
  if (err instanceof ApiError) {
    console.error(`Error ${err.status}: ${err.message}`);
  } else if (err instanceof Error) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error('Unknown error', err);
  }
  process.exit(1);
}

const program = new Command();

program
  .name('sisu-api')
  .description('SISU API CLI — auto-generated from openapi/sisu-v1.yaml')
  .version('1.0.0')
  .option('--url <url>', 'API base URL (or set SISU_API_URL)', DEFAULT_BASE_URL);

// ---------------------------------------------------------------------------
// health
// ---------------------------------------------------------------------------

const health = program.command('health').description('Health and readiness commands');

health
  .command('check')
  .description('GET /health — check service health')
  .action(async () => {
    const opts = program.opts<{ url?: string }>();
    const client = makeClient(opts);
    try {
      const result = await client.getHealth();
      printJson(result);
    } catch (err) {
      handleError(err);
    }
  });

health
  .command('ready')
  .description('GET /ready — check service readiness')
  .action(async () => {
    const opts = program.opts<{ url?: string }>();
    const client = makeClient(opts);
    try {
      const result = await client.getReady();
      printJson(result);
    } catch (err) {
      handleError(err);
    }
  });

// ---------------------------------------------------------------------------
// work-items
// ---------------------------------------------------------------------------

const workItems = program.command('work-items').alias('wi').description('Work item management');

workItems
  .command('list')
  .description('GET /work-items — list work items')
  .option('--status <status>', 'Filter by status')
  .option('--role <role>', 'Filter by assigned role')
  .option('--external-system <system>', 'Filter by external system')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const items = await client.listWorkItems({
        status: opts.status,
        assignedRole: opts.role,
        externalSystem: opts.externalSystem,
      });
      if (opts.json) {
        printJson(items);
      } else if (items.length === 0) {
        console.log('No work items found.');
      } else {
        printTable(
          ['ID', 'Title', 'Status', 'Role', 'Version'],
          items.map((i) => [i.id, i.title, i.status, i.assignedRole ?? '-', String(i.version)]),
        );
      }
    } catch (err) {
      handleError(err);
    }
  });

workItems
  .command('get <id>')
  .description('GET /work-items/:id — get a work item')
  .option('--json', 'Output as JSON')
  .action(async (id: string, _opts) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const item = await client.getWorkItem(id);
      printJson(item);
    } catch (err) {
      handleError(err);
    }
  });

workItems
  .command('create')
  .description('POST /work-items — create a work item')
  .requiredOption('--title <title>', 'Work item title')
  .option('--description <desc>', 'Description')
  .option('--status <status>', 'Initial status')
  .option('--role <role>', 'Assigned role')
  .action(async (opts) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const item = await client.createWorkItem({
        title: opts.title,
        description: opts.description,
        status: opts.status,
        assignedRole: opts.role,
      });
      printJson(item);
    } catch (err) {
      handleError(err);
    }
  });

workItems
  .command('update <id>')
  .description('PUT /work-items/:id — update a work item')
  .option('--title <title>', 'New title')
  .option('--description <desc>', 'New description')
  .option('--status <status>', 'New status')
  .option('--role <role>', 'New assigned role')
  .option('--version <version>', 'Expected version for optimistic locking', parseInt)
  .action(async (id: string, opts) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const item = await client.updateWorkItem(id, {
        title: opts.title,
        description: opts.description,
        status: opts.status,
        assignedRole: opts.role,
        version: opts.version,
      });
      printJson(item);
    } catch (err) {
      handleError(err);
    }
  });

workItems
  .command('cancel <id>')
  .description('DELETE /work-items/:id — cancel a work item')
  .action(async (id: string) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const item = await client.cancelWorkItem(id);
      printJson(item);
    } catch (err) {
      handleError(err);
    }
  });

workItems
  .command('dispatch <id>')
  .description('POST /work-items/:id/dispatch — dispatch a work item')
  .action(async (id: string) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const plan = await client.dispatchWorkItem(id);
      printJson(plan);
    } catch (err) {
      handleError(err);
    }
  });

// ---------------------------------------------------------------------------
// plans
// ---------------------------------------------------------------------------

const plans = program.command('plans').description('Execution plan commands');

plans
  .command('get <id>')
  .description('GET /plans/:id — get an execution plan')
  .action(async (id: string) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const plan = await client.getPlan(id);
      printJson(plan);
    } catch (err) {
      handleError(err);
    }
  });

// ---------------------------------------------------------------------------
// runtime
// ---------------------------------------------------------------------------

const runtime = program.command('runtime').description('Runtime agent management');

runtime
  .command('list')
  .description('GET /runtime/runs — list agent runs')
  .option('--role <role>', 'Filter by role')
  .option('--work-item <id>', 'Filter by work item ID')
  .option('--active', 'Only active runs')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const runs = await client.listRuns({
        role: opts.role,
        workItemId: opts.workItem,
        active: opts.active ? true : undefined,
      });
      if (opts.json) {
        printJson(runs);
      } else if (runs.length === 0) {
        console.log('No runs found.');
      } else {
        printTable(
          ['Lease ID', 'Run ID', 'Role', 'Model', 'Active', 'Work Item'],
          runs.map((r) => [
            r.id,
            r.runId,
            r.role,
            r.model,
            r.active ? 'yes' : 'no',
            r.workItemId ?? '-',
          ]),
        );
      }
    } catch (err) {
      handleError(err);
    }
  });

runtime
  .command('stop <id>')
  .description('POST /runtime/runs/:id/stop — stop an agent run (use lease ID)')
  .action(async (id: string) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const lease = await client.stopRun(id);
      printJson(lease);
    } catch (err) {
      handleError(err);
    }
  });

// ---------------------------------------------------------------------------
// mail
// ---------------------------------------------------------------------------

const mail = program.command('mail').description('Agent mail commands');

mail
  .command('list')
  .description('GET /mail — list mail messages')
  .option('--to <agent>', 'Filter by recipient')
  .option('--from <agent>', 'Filter by sender')
  .option('--read', 'Only read messages')
  .option('--unread', 'Only unread messages')
  .option('--work-item <id>', 'Filter by work item ID')
  .option('--type <type>', 'Filter by message type')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const read = opts.read ? true : opts.unread ? false : undefined;
      const messages = await client.listMail({
        to: opts.to,
        from: opts.from,
        read,
        workItemId: opts.workItem,
        type: opts.type,
      });
      if (opts.json) {
        printJson(messages);
      } else if (messages.length === 0) {
        console.log('No messages found.');
      } else {
        printTable(
          ['ID', 'Type', 'From', 'To', 'Subject', 'Priority', 'Read'],
          messages.map((m) => [
            m.id,
            m.type,
            m.from,
            m.to,
            m.subject.slice(0, 40),
            m.priority,
            m.read ? 'yes' : 'no',
          ]),
        );
      }
    } catch (err) {
      handleError(err);
    }
  });

mail
  .command('send')
  .description('POST /mail — send a mail message')
  .requiredOption('--type <type>', 'Message type')
  .requiredOption('--from <agent>', 'Sender agent name')
  .requiredOption('--to <agent>', 'Recipient agent name')
  .requiredOption('--subject <subject>', 'Message subject')
  .requiredOption('--body <body>', 'Message body')
  .option('--work-item <id>', 'Associated work item ID')
  .option('--plan <id>', 'Associated plan ID')
  .option('--priority <priority>', 'Message priority (low|normal|high|urgent)')
  .action(async (opts) => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      const message = await client.sendMail({
        type: opts.type,
        from: opts.from,
        to: opts.to,
        subject: opts.subject,
        body: opts.body,
        workItemId: opts.workItem,
        planId: opts.plan,
        priority: opts.priority,
      });
      printJson(message);
    } catch (err) {
      handleError(err);
    }
  });

// ---------------------------------------------------------------------------
// adapters
// ---------------------------------------------------------------------------

const adapters = program.command('adapters').description('Adapter management');

adapters
  .command('register')
  .description('POST /adapters/register — register an adapter (not yet implemented)')
  .action(async () => {
    const globalOpts = program.opts<{ url?: string }>();
    const client = makeClient(globalOpts);
    try {
      await client.registerAdapter();
    } catch (err) {
      handleError(err);
    }
  });

program.parseAsync(process.argv).catch(handleError);
