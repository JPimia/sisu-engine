import type { AdapterRegistration } from '@sisu/protocol';
import type { SisuClient } from '@sisu/sdk';
import { getCapabilityIds } from './capabilities.js';
import type { McAdapterConfig } from './types.js';

// ---------------------------------------------------------------------------
// McAdapterHandshake
// ---------------------------------------------------------------------------

/**
 * Handles registration and health checking for the MC adapter.
 * Uses the SISU client to register with the server and verify connectivity.
 */
export class McAdapterHandshake {
  constructor(
    private readonly client: SisuClient,
    private readonly config: McAdapterConfig,
  ) {}

  /**
   * Register this adapter with SISU via POST /v1/adapters/register.
   */
  async register(): Promise<AdapterRegistration> {
    const capabilityIds = this.config.capabilities ?? getCapabilityIds();
    return this.client.registerAdapter({
      name: this.config.adapterName ?? 'mission-control',
      system: 'mission-control',
      webhookUrl: this.config.webhookUrl,
      subscribedEvents: this.config.subscribedEvents ?? ['work_item.status_changed'],
      capabilities: capabilityIds,
    });
  }

  /**
   * Check SISU health. Returns true if healthy, false on any error.
   */
  async checkHealth(): Promise<boolean> {
    try {
      await this.client.health();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Perform full handshake: health check then registration.
   */
  async performHandshake(): Promise<{
    registration: AdapterRegistration;
    healthy: boolean;
  }> {
    const healthy = await this.checkHealth();
    const registration = await this.register();
    return { registration, healthy };
  }
}
