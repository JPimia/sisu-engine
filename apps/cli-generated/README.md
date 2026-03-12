# @sisu/cli-generated

Auto-generated CLI for the SISU API, driven by `openapi/sisu-v1.yaml`.

> **Do not edit `src/` manually.** This package is generated from the OpenAPI spec.
> To change behaviour, update the spec and regenerate.

## Usage

```bash
# Set the API base URL (default: http://localhost:3000/v1)
export SISU_API_URL=http://localhost:3000/v1

# Health
sisu-api health check
sisu-api health ready

# Work items
sisu-api work-items list
sisu-api work-items list --status queued --json
sisu-api work-items create --title "My task" --description "Do something"
sisu-api work-items get wrk_01HQZXVB3K5DFGHJKLMNPQRSTU
sisu-api work-items update wrk_01HQZXVB3K5DFGHJKLMNPQRSTU --status in_progress
sisu-api work-items cancel wrk_01HQZXVB3K5DFGHJKLMNPQRSTU
sisu-api work-items dispatch wrk_01HQZXVB3K5DFGHJKLMNPQRSTU

# Execution plans
sisu-api plans get plan_01HQZXVB3K5DFGHJKLMNPQRSTU

# Runtime
sisu-api runtime list
sisu-api runtime list --active
sisu-api runtime stop lease_01HQZXVB3K5DFGHJKLMNPQRSTU

# Mail
sisu-api mail list
sisu-api mail list --to agent-b --unread
sisu-api mail send --type status --from agent-a --to agent-b \
  --subject "Update" --body "Work complete"

# Adapters
sisu-api adapters register  # returns 501 Not Implemented
```

## Global options

| Option | Description | Default |
|--------|-------------|---------|
| `--url <url>` | API base URL | `$SISU_API_URL` or `http://localhost:3000/v1` |

## Covered endpoints

All 14 endpoints from `openapi/sisu-v1.yaml`:

| Method | Path | Command |
|--------|------|---------|
| GET | /health | `health check` |
| GET | /ready | `health ready` |
| POST | /work-items | `work-items create` |
| GET | /work-items | `work-items list` |
| GET | /work-items/:id | `work-items get <id>` |
| PUT | /work-items/:id | `work-items update <id>` |
| DELETE | /work-items/:id | `work-items cancel <id>` |
| POST | /work-items/:id/dispatch | `work-items dispatch <id>` |
| GET | /plans/:id | `plans get <id>` |
| GET | /runtime/runs | `runtime list` |
| POST | /runtime/runs/:id/stop | `runtime stop <id>` |
| GET | /mail | `mail list` |
| POST | /mail | `mail send` |
| POST | /adapters/register | `adapters register` |

## How to regenerate after API changes

The generation process is:

1. **Update the OpenAPI spec** at `openapi/sisu-v1.yaml` to reflect new or changed endpoints.

2. **Run the generator** from the repo root:
   ```bash
   cd apps/cli-generated
   pnpm generate
   ```
   This runs `scripts/generate.js`, which reads `openapi/sisu-v1.yaml` and regenerates
   `src/client.ts` and `src/index.ts`.

3. **Review and adjust** any generated output, particularly for complex request bodies or
   custom output formatting.

4. **Run quality gates:**
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

5. **Build:**
   ```bash
   pnpm build
   ```

### Manual regeneration (without the generator script)

If you prefer to update manually:
- `src/client.ts` — mirror every new endpoint from the spec as a method on `SisuApiClient`
- `src/index.ts` — add a Commander command/subcommand per new endpoint
- Keep the "Generated from:" comment at the top of each file up to date

### Adding new endpoints

1. Add the path/operation to `openapi/sisu-v1.yaml`
2. Add the method to `SisuApiClient` in `src/client.ts`
3. Add the command to `src/index.ts`
4. Add a test to `src/client.test.ts`

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```
