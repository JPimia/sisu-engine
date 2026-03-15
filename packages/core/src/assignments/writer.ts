/**
 * Assignment file writer — serializes Assignment objects to
 * Markdown files with YAML frontmatter.
 *
 * Output path: .sisu/assignments/{taskId}.md
 * The frontmatter is the YAML block; the body is structured Markdown sections.
 */
import type {
  Assignment,
  AssignmentBody,
  AssignmentFrontmatter,
  Coordination,
  Ecosystem,
  Exploration,
  MergePlan,
  MonitoringConfig,
  ReviewTarget,
  WorkstreamPlanning,
} from '@sisu/protocol';

// ---------------------------------------------------------------------------
// YAML frontmatter serialization (no external dependency — simple key:value)
// ---------------------------------------------------------------------------

function yamlValue(val: unknown): string {
  if (typeof val === 'string') {
    // Quote strings that contain special YAML chars
    if (/[:#{}[\],&*!|>'"@`]/.test(val) || val.includes('\n')) {
      return JSON.stringify(val);
    }
    return val;
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  return JSON.stringify(val);
}

function toYamlFrontmatter(fm: AssignmentFrontmatter): string {
  const lines: string[] = ['---'];
  const order: (keyof AssignmentFrontmatter)[] = [
    'schema',
    'role',
    'taskId',
    'title',
    'parentAgent',
    'rootTaskId',
    'repoId',
    'repoPath',
    'worktreePath',
    'branch',
    'baseBranch',
    'instructionMode',
    'priority',
    'riskLevel',
    'status',
    'createdAt',
    'profile',
  ];

  for (const key of order) {
    const val = fm[key];
    if (val !== undefined) {
      lines.push(`${String(key)}: ${yamlValue(val)}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Markdown body serialization
// ---------------------------------------------------------------------------

function renderList(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function section(heading: string, content: string): string {
  return `## ${heading}\n\n${content}`;
}

function bodyToMarkdown(body: AssignmentBody): string {
  const sections: string[] = [];

  sections.push(section('Objective', body.objective));

  sections.push(section('Success Criteria', renderList(body.successCriteria)));

  if (body.fileScope) {
    let scopeContent = `**Allowed:**\n${renderList(body.fileScope.allowed)}`;
    if (body.fileScope.forbidden?.length) {
      scopeContent += `\n\n**Forbidden:**\n${renderList(body.fileScope.forbidden)}`;
    }
    sections.push(section('File Scope', scopeContent));
  }

  if (body.references?.length) {
    const refContent = body.references
      .map((r: { label: string; path: string }) => `- **${r.label}**: \`${r.path}\``)
      .join('\n');
    sections.push(section('References', refContent));
  }

  if (body.validation?.length) {
    const valContent = body.validation
      .map((v: { name: string; command: string; required: boolean }) => `- **${v.name}** (${v.required ? 'required' : 'optional'}): \`${v.command}\``)
      .join('\n');
    sections.push(section('Validation', valContent));
  }

  if (body.authority) {
    let authContent = `**Can do:**\n${renderList(body.authority.canDo)}`;
    authContent += `\n\n**Cannot do:**\n${renderList(body.authority.cannotDo)}`;
    sections.push(section('Authority', authContent));
  }

  if (body.architecture) {
    sections.push(section('Architecture', body.architecture));
  }

  if (body.ui) {
    sections.push(section('UI', body.ui));
  }

  if (body.handoff) {
    const handoffContent = [
      `- **On complete:** ${body.handoff.onComplete}`,
      `- **On block:** ${body.handoff.onBlock}`,
      `- **On failure:** ${body.handoff.onFailure}`,
    ].join('\n');
    sections.push(section('Handoff', handoffContent));
  }

  if (body.runtime) {
    const runtimeLines: string[] = [];
    if (body.runtime.model) runtimeLines.push(`- **Model:** ${body.runtime.model}`);
    if (body.runtime.modelTier) runtimeLines.push(`- **Model tier:** ${body.runtime.modelTier}`);
    if (body.runtime.timeout) runtimeLines.push(`- **Timeout:** ${body.runtime.timeout}s`);
    if (body.runtime.maxTokens) runtimeLines.push(`- **Max tokens:** ${body.runtime.maxTokens}`);
    if (body.runtime.profile) runtimeLines.push(`- **Profile:** ${body.runtime.profile}`);
    if (runtimeLines.length) {
      sections.push(section('Runtime', runtimeLines.join('\n')));
    }
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Role-specific extensions to Markdown
// ---------------------------------------------------------------------------

function reviewTargetToMarkdown(target: ReviewTarget): string {
  const lines = [
    `- **Branch:** ${target.branch}`,
    `- **Base branch:** ${target.baseBranch}`,
  ];
  if (target.prUrl) lines.push(`- **PR:** ${target.prUrl}`);
  if (target.diffScope?.length) {
    lines.push(`- **Diff scope:**\n${renderList(target.diffScope)}`);
  }
  return section('Review Target', lines.join('\n'));
}

function explorationToMarkdown(exp: Exploration): string {
  return section(
    'Exploration',
    `**Questions:**\n${renderList(exp.questions)}\n\n**Scope:**\n${renderList(exp.scope)}`,
  );
}

function coordinationToMarkdown(coord: Coordination): string {
  let content = `**Team size:** ${coord.teamSize}\n\n**Sub-tasks:**\n${renderList(coord.subTasks)}`;
  if (coord.decompositionStrategy) {
    content += `\n\n**Decomposition strategy:** ${coord.decompositionStrategy}`;
  }
  return section('Coordination', content);
}

function workstreamPlanningToMarkdown(ws: WorkstreamPlanning): string {
  return section(
    'Workstream Planning',
    `**Streams:**\n${renderList(ws.streams)}\n\n**Dependencies:**\n${renderList(ws.dependencies.length ? ws.dependencies : ['(none)'])}`,
  );
}

function mergePlanToMarkdown(mp: MergePlan): string {
  return section(
    'Merge Plan',
    `**Branches:**\n${renderList(mp.branches)}\n\n**Strategy:** ${mp.strategy}`,
  );
}

function monitoringToMarkdown(mon: MonitoringConfig): string {
  const threshLines = Object.entries(mon.thresholds).map(
    ([k, v]) => `- **${k}:** ${v}`,
  );
  return section(
    'Monitoring',
    `**Metrics:**\n${renderList(mon.metrics)}\n\n**Thresholds:**\n${threshLines.join('\n')}`,
  );
}

function ecosystemToMarkdown(eco: Ecosystem): string {
  return section(
    'Ecosystem',
    `**Active workstreams:**\n${renderList(eco.activeWorkstreams)}\n\n**Health checks:**\n${renderList(eco.healthChecks)}`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialize a validated Assignment to a Markdown string with YAML frontmatter.
 */
export function assignmentToMarkdown(assignment: Assignment): string {
  const parts: string[] = [];

  // YAML frontmatter
  parts.push(toYamlFrontmatter(assignment.frontmatter));

  // Title
  parts.push(`# ${assignment.frontmatter.title}`);

  // Body
  parts.push(bodyToMarkdown(assignment.body));

  // Role-specific extensions
  if (assignment.reviewTarget) parts.push(reviewTargetToMarkdown(assignment.reviewTarget));
  if (assignment.exploration) parts.push(explorationToMarkdown(assignment.exploration));
  if (assignment.coordination) parts.push(coordinationToMarkdown(assignment.coordination));
  if (assignment.workstreamPlanning) parts.push(workstreamPlanningToMarkdown(assignment.workstreamPlanning));
  if (assignment.mergePlan) parts.push(mergePlanToMarkdown(assignment.mergePlan));
  if (assignment.monitoring) parts.push(monitoringToMarkdown(assignment.monitoring));
  if (assignment.ecosystem) parts.push(ecosystemToMarkdown(assignment.ecosystem));

  return parts.join('\n\n') + '\n';
}

/**
 * Returns the file path for an assignment relative to the repo root.
 * Assignment files live in .sisu/assignments/{taskId}.md
 */
export function assignmentFilePath(taskId: string): string {
  return `.sisu/assignments/${taskId}.md`;
}

/**
 * Returns the absolute file path for an assignment given a repo root.
 */
export function assignmentAbsolutePath(repoPath: string, taskId: string): string {
  // Normalize trailing separators
  const base = repoPath.endsWith('/') ? repoPath.slice(0, -1) : repoPath;
  return `${base}/${assignmentFilePath(taskId)}`;
}
