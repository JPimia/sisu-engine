import { workItemStatusToMcStatus } from './mapper.js';
import type { SisuStatusEvent } from './types.js';

// ---------------------------------------------------------------------------
// McCallbackHandler
// ---------------------------------------------------------------------------

export interface McCallbackHandlerConfig {
  mcApiBaseUrl: string;
  mcApiToken?: string | undefined;
}

/**
 * Handles SISU status change events by calling the MC API to update the
 * corresponding task status.
 */
export class McCallbackHandler {
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(config: McCallbackHandlerConfig) {
    this.baseUrl = config.mcApiBaseUrl.replace(/\/$/, '');
    this.token = config.mcApiToken;
  }

  /**
   * Translate a SISU status change event into an MC task status update.
   * Calls PATCH {mcApiBaseUrl}/tasks/{mcTaskId} with the new status.
   */
  async handleStatusChange(event: SisuStatusEvent, mcTaskId: string): Promise<void> {
    const mcStatus = workItemStatusToMcStatus(
      event.newStatus as Parameters<typeof workItemStatusToMcStatus>[0],
    );

    const url = `${this.baseUrl}/tasks/${mcTaskId}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token !== undefined) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: mcStatus }),
    });

    if (!res.ok) {
      throw new Error(`MC API error: PATCH ${url} returned ${res.status} ${res.statusText}`);
    }
  }
}
