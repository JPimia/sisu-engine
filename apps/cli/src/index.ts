#!/usr/bin/env node
import { Command } from 'commander';
import { makeAgentsCommand } from './commands/agents.js';
import { makeDashboardCommand } from './commands/dashboard.js';
import { makeDoctorCommand } from './commands/doctor.js';
import { makeHealthCommand } from './commands/health.js';
import { makeInitCommand } from './commands/init.js';
import { makeMailCommand } from './commands/mail.js';
import { makeRolesCommand, makeWorkflowsCommand } from './commands/roles.js';
import { makeWorkCommand } from './commands/work.js';

const program = new Command();

program.name('sisu').description('SISU — AI agent orchestration engine CLI').version('0.1.0');

program.addCommand(makeInitCommand());
program.addCommand(makeHealthCommand());
program.addCommand(makeDoctorCommand());
program.addCommand(makeWorkCommand());
program.addCommand(makeAgentsCommand());
program.addCommand(makeMailCommand());
program.addCommand(makeRolesCommand());
program.addCommand(makeWorkflowsCommand());
program.addCommand(makeDashboardCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
