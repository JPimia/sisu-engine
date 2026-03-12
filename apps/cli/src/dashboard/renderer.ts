import type { AgentMail, RuntimeLease, WorkItem } from '@sisu/protocol';

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const ESC = '\x1b[';

export const ansi = {
  clear: `${ESC}2J${ESC}H`,
  hideCursor: `${ESC}?25l`,
  showCursor: `${ESC}?25h`,
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  red: `${ESC}31m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  magenta: `${ESC}35m`,
};

function colorForStatus(status: string): string {
  switch (status) {
    case 'in_progress':
    case 'active':
      return ansi.green;
    case 'blocked':
    case 'in_review':
    case 'planning':
      return ansi.yellow;
    case 'failed':
    case 'cancelled':
      return ansi.red;
    case 'done':
      return ansi.dim;
    default:
      return ansi.white;
  }
}

function pad(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

function duration(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ---------------------------------------------------------------------------
// Dashboard render
// ---------------------------------------------------------------------------

export interface DashboardData {
  agents: RuntimeLease[];
  workItems: WorkItem[];
  recentMail: AgentMail[];
}

const WIDTH = 66;

function divider(label: string): string {
  const inner = `─ ${label} `;
  const remaining = WIDTH - 2 - inner.length;
  return `├${inner}${'─'.repeat(Math.max(0, remaining))}┤`;
}

function header(): string {
  const title = ' SISU Dashboard ';
  const remaining = WIDTH - 2 - title.length;
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return `┌${'─'.repeat(left)}${title}${'─'.repeat(right)}┐`;
}

function footer(): string {
  return `└${'─'.repeat(WIDTH - 2)}┘`;
}

// Biome disallows \x1b literal in regex; use the unicode escape instead.
const ANSI_RE = new RegExp('\u001b\\[[0-9;]*m', 'g');

function row(content: string): string {
  const visible = content.replace(ANSI_RE, '');
  const padding = WIDTH - 2 - visible.length;
  return `│ ${content}${' '.repeat(Math.max(0, padding - 1))}│`;
}

export function renderDashboard(data: DashboardData): string {
  const lines: string[] = [];

  // Header
  lines.push(header());

  const activeCount = data.agents.length;
  const statusLine = `Status: ${ansi.green}running${ansi.reset} | Agents: ${ansi.bold}${activeCount}${ansi.reset} active | Work items: ${ansi.bold}${data.workItems.length}${ansi.reset}`;
  lines.push(row(statusLine));

  // Active Agents
  lines.push(divider('Active Agents'));
  lines.push(
    row(
      `${ansi.dim}${pad('St', 3)} ${pad('Run ID', 14)} ${pad('Role', 10)} ${pad('Model', 16)} ${pad('Work Item', 11)} Duration${ansi.reset}`,
    ),
  );

  if (data.agents.length === 0) {
    lines.push(row(`${ansi.dim}  (no active agents)${ansi.reset}`));
  } else {
    for (const lease of data.agents.slice(0, 5)) {
      const indicator = `${ansi.green}▶${ansi.reset}`;
      const runShort = lease.runId.slice(0, 13);
      const model = lease.model.slice(0, 15);
      const workItem = (lease.workItemId ?? '-').slice(0, 10);
      const dur = duration(lease.createdAt);
      lines.push(
        row(
          `${indicator}  ${pad(runShort, 14)} ${pad(lease.role, 10)} ${pad(model, 16)} ${pad(workItem, 11)} ${dur}`,
        ),
      );
    }
  }

  // Work Items
  lines.push(divider('Work Items'));
  lines.push(
    row(
      `${ansi.dim}${pad('ID', 12)} ${pad('Title', 22)} ${pad('Status', 12)} ${pad('Priority', 8)} Agents${ansi.reset}`,
    ),
  );

  if (data.workItems.length === 0) {
    lines.push(row(`${ansi.dim}  (no work items)${ansi.reset}`));
  } else {
    for (const item of data.workItems.slice(0, 5)) {
      const color = colorForStatus(item.status);
      const idShort = item.id.slice(0, 11);
      const title = item.title.slice(0, 21);
      const priority = `P${(item.metadata['priority'] as number | undefined) ?? '-'}`;
      const agentCount = data.agents.filter((a) => a.workItemId === item.id).length;
      lines.push(
        row(
          `${pad(idShort, 12)} ${pad(title, 22)} ${color}${pad(item.status, 12)}${ansi.reset} ${pad(priority, 8)} ${agentCount}`,
        ),
      );
    }
  }

  // Recent Mail
  lines.push(divider('Recent Mail'));

  if (data.recentMail.length === 0) {
    lines.push(row(`${ansi.dim}  (no recent mail)${ansi.reset}`));
  } else {
    for (const msg of data.recentMail.slice(0, 5)) {
      const time = fmtTime(msg.createdAt);
      const type = pad(msg.type, 14);
      const route = `${msg.from.slice(0, 10)} → ${msg.to.slice(0, 10)}`;
      const subj = msg.subject.slice(0, 18);
      lines.push(
        row(
          `${ansi.dim}${time}${ansi.reset}  ${ansi.cyan}${type}${ansi.reset} ${pad(route, 24)} "${subj}"`,
        ),
      );
    }
  }

  lines.push(footer());
  lines.push(`${ansi.dim}Press q or Ctrl+C to quit. Refreshes every 2s.${ansi.reset}`);

  return lines.join('\n');
}
