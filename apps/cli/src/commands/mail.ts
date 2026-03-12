import { Command } from 'commander';
import { outputJson, outputTable } from '../output.js';
import { DEFAULT_DB_PATH, openStorage } from '../storage.js';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

export function makeMailCommand(): Command {
  const mail = new Command('mail');
  mail.description('Manage agent mail');

  // mail list
  mail
    .command('list')
    .description('List mail messages')
    .option('--work-item <id>', 'Filter by work item ID')
    .option('--agent <runId>', 'Filter by agent run ID (to/from)')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (opts: { workItem?: string; agent?: string; db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      const filter: { workItemId?: string; to?: string } = {};
      if (opts.workItem) filter.workItemId = opts.workItem;
      if (opts.agent) filter.to = opts.agent;

      const messages = await storage.listMail(filter);

      if (opts.json) {
        outputJson(messages);
      } else if (messages.length === 0) {
        console.log('No mail found.');
      } else {
        outputTable(
          ['Time', 'Type', 'From', 'To', 'Subject'],
          messages.map((m) => [fmtDate(m.createdAt), m.type, m.from, m.to, m.subject.slice(0, 40)]),
        );
      }
    });

  // mail show
  mail
    .command('show <id>')
    .description('Show mail message payload')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (id: string, opts: { db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      // listMail doesn't support by ID directly, use to/from filter
      const all = await storage.listMail({});
      const msg = all.find((m) => m.id === id);
      if (!msg) {
        console.error(`Mail ${id} not found`);
        process.exitCode = 1;
        return;
      }
      if (opts.json) {
        outputJson(msg);
      } else {
        console.log(`ID:      ${msg.id}`);
        console.log(`Type:    ${msg.type}`);
        console.log(`From:    ${msg.from}`);
        console.log(`To:      ${msg.to}`);
        console.log(`Subject: ${msg.subject}`);
        console.log(`Time:    ${new Date(msg.createdAt).toLocaleString()}`);
        if (msg.workItemId) console.log(`WorkItem: ${msg.workItemId}`);
        console.log(`\nBody:\n${msg.body}`);
        if (msg.payload) {
          console.log(`\nPayload:\n${JSON.stringify(msg.payload, null, 2)}`);
        }
      }
    });

  return mail;
}
