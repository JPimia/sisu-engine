import { Command } from 'commander';
import { ansi, renderDashboard } from '../dashboard/renderer.js';
import { DEFAULT_DB_PATH, openStorage } from '../storage.js';

export function makeDashboardCommand(): Command {
  const cmd = new Command('dashboard');
  cmd
    .description('Live ANSI terminal dashboard (refreshes every 2s)')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--interval <ms>', 'Refresh interval in milliseconds', '2000')
    .action(async (opts: { db: string; interval: string }) => {
      const storage = openStorage(opts.db);
      const intervalMs = Number(opts.interval);

      process.stdout.write(ansi.hideCursor);
      process.stdout.write(ansi.clear);

      let running = true;

      const cleanup = () => {
        running = false;
        process.stdout.write(ansi.showCursor);
        process.stdout.write('\n');
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      // Raw keypress for 'q'
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', (chunk: Buffer) => {
          const key = chunk.toString();
          if (key === 'q' || key === 'Q' || key === '\x03') {
            cleanup();
          }
        });
      }

      const render = async () => {
        if (!running) return;

        const [agents, workItems, recentMail] = await Promise.all([
          storage.listLeases({ active: true }),
          storage.listWorkItems(),
          storage.listMail({}),
        ]);

        // Sort mail by createdAt desc, take most recent
        const sorted = [...recentMail].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

        const output = renderDashboard({
          agents,
          workItems: workItems.slice(0, 10),
          recentMail: sorted.slice(0, 5),
        });

        process.stdout.write(ansi.clear);
        process.stdout.write(output + '\n');
      };

      await render();
      const timer = setInterval(render, intervalMs);

      // Keep alive
      await new Promise<void>((resolve) => {
        process.on('exit', () => {
          clearInterval(timer);
          resolve();
        });
      });
    });

  return cmd;
}
