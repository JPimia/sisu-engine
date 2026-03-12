import { dispatch } from '@sisu/core';
import type { WorkItemStatus } from '@sisu/protocol';
import { Command } from 'commander';
import { outputJson, outputTable } from '../output.js';
import { DEFAULT_DB_PATH, openStorage } from '../storage.js';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function makeWorkCommand(): Command {
  const work = new Command('work');
  work.description('Manage work items');

  // work create
  work
    .command('create')
    .description('Create a new work item')
    .requiredOption('--title <text>', 'Work item title')
    .option('--kind <kind>', 'Work item kind (feature, bug, task, etc.)', 'task')
    .option('--priority <n>', 'Priority (1=highest)', '2')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(
      async (opts: {
        title: string;
        kind: string;
        priority: string;
        db: string;
        json?: boolean;
      }) => {
        const storage = openStorage(opts.db);
        const item = await storage.createWorkItem({
          title: opts.title,
          metadata: { kind: opts.kind, priority: Number(opts.priority) },
        });
        if (opts.json) {
          outputJson(item);
        } else {
          console.log(`Created work item ${item.id}`);
          console.log(`  Title:    ${item.title}`);
          console.log(`  Status:   ${item.status}`);
          console.log(`  Priority: ${(item.metadata['priority'] as number | undefined) ?? 2}`);
        }
      },
    );

  // work list
  work
    .command('list')
    .description('List work items')
    .option('--status <status>', 'Filter by status')
    .option('--limit <n>', 'Max results', '50')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (opts: { status?: string; limit: string; db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      const filter = opts.status ? { status: opts.status as WorkItemStatus } : undefined;
      let items = await storage.listWorkItems(filter);
      items = items.slice(0, Number(opts.limit));

      if (opts.json) {
        outputJson(items);
      } else if (items.length === 0) {
        console.log('No work items found.');
      } else {
        outputTable(
          ['ID', 'Title', 'Status', 'Priority', 'Created'],
          items.map((i) => [
            i.id,
            i.title.slice(0, 40),
            i.status,
            String((i.metadata['priority'] as number | undefined) ?? '-'),
            fmtDate(i.createdAt),
          ]),
        );
      }
    });

  // work show
  work
    .command('show <id>')
    .description('Show work item details and execution plan')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (id: string, opts: { db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      const item = await storage.getWorkItem(id);
      if (!item) {
        console.error(`Work item ${id} not found`);
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        outputJson(item);
      } else {
        console.log(`ID:       ${item.id}`);
        console.log(`Title:    ${item.title}`);
        console.log(`Status:   ${item.status}`);
        console.log(`Version:  ${item.version}`);
        console.log(`Created:  ${fmtDate(item.createdAt)}`);
        console.log(`Updated:  ${fmtDate(item.updatedAt)}`);
        if (item.assignedRole) console.log(`Role:     ${item.assignedRole}`);
        if (item.assignedRun) console.log(`Run:      ${item.assignedRun}`);
        if (item.description) console.log(`\nDescription:\n${item.description}`);
      }
    });

  // work dispatch
  work
    .command('dispatch <id>')
    .description('Dispatch a work item (select workflow, create plan, start execution)')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (id: string, opts: { db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      const item = await storage.getWorkItem(id);
      if (!item) {
        console.error(`Work item ${id} not found`);
        process.exitCode = 1;
        return;
      }

      const plan = await dispatch(id, storage);

      if (opts.json) {
        outputJson(plan);
      } else {
        console.log(`Dispatched work item ${id}`);
        console.log(`  Plan:     ${plan.id}`);
        console.log(`  Workflow: ${plan.workflowTemplateId}`);
        console.log(`  Steps:    ${plan.steps.length}`);
      }
    });

  // work cancel
  work
    .command('cancel <id>')
    .description('Cancel a work item')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (id: string, opts: { db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      const item = await storage.updateWorkItem(id, { status: 'cancelled' });
      if (opts.json) {
        outputJson(item);
      } else {
        console.log(`Cancelled work item ${id}`);
      }
    });

  // work retry
  work
    .command('retry <id>')
    .description('Retry a failed work item')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (id: string, opts: { db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      const item = await storage.updateWorkItem(id, { status: 'queued' });
      if (opts.json) {
        outputJson(item);
      } else {
        console.log(`Reset work item ${id} to queued`);
      }
    });

  return work;
}
