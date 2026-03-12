import type { AdapterRegistration } from '@sisu/protocol';
import type { SisuClient } from '@sisu/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McAdapterHandshake } from '../handshake.js';
import type { McAdapterConfig } from '../types.js';

function makeRegistration(overrides?: Partial<AdapterRegistration>): AdapterRegistration {
  return {
    id: 'reg-1',
    name: 'mission-control',
    system: 'mission-control',
    webhookUrl: 'https://mc.example.com/webhook',
    subscribedEvents: ['work_item.status_changed'],
    capabilities: ['board.tasks'],
    active: true,
    registeredAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeClient(overrides?: Partial<SisuClient>): SisuClient {
  return {
    health: vi.fn().mockResolvedValue({ status: 'ok', timestamp: '2026-01-01T00:00:00Z' }),
    registerAdapter: vi.fn().mockResolvedValue(makeRegistration()),
    ...overrides,
  } as unknown as SisuClient;
}

const config: McAdapterConfig = {
  sisuBaseUrl: 'http://localhost:3000',
  mcApiBaseUrl: 'https://mc.example.com',
  webhookUrl: 'https://mc.example.com/sisu-webhook',
};

describe('McAdapterHandshake', () => {
  let client: SisuClient;

  beforeEach(() => {
    client = makeClient();
  });

  describe('checkHealth', () => {
    it('returns true when SISU is healthy', async () => {
      const handshake = new McAdapterHandshake(client, config);
      const result = await handshake.checkHealth();
      expect(result).toBe(true);
      expect(client.health).toHaveBeenCalledOnce();
    });

    it('returns false when SISU health call throws', async () => {
      client = makeClient({
        health: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });
      const handshake = new McAdapterHandshake(client, config);
      const result = await handshake.checkHealth();
      expect(result).toBe(false);
    });
  });

  describe('register', () => {
    it('calls registerAdapter with default name when not configured', async () => {
      const handshake = new McAdapterHandshake(client, config);
      const reg = await handshake.register();

      expect(client.registerAdapter).toHaveBeenCalledWith({
        name: 'mission-control',
        system: 'mission-control',
        webhookUrl: 'https://mc.example.com/sisu-webhook',
        subscribedEvents: ['work_item.status_changed'],
        capabilities: expect.arrayContaining(['board.tasks']),
      });
      expect(reg.id).toBe('reg-1');
    });

    it('uses custom adapterName when provided', async () => {
      const customConfig: McAdapterConfig = { ...config, adapterName: 'my-mc-instance' };
      const handshake = new McAdapterHandshake(client, customConfig);
      await handshake.register();

      expect(client.registerAdapter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-mc-instance' }),
      );
    });

    it('uses custom capabilities when provided', async () => {
      const customConfig: McAdapterConfig = {
        ...config,
        capabilities: ['board.tasks', 'docs.read'],
      };
      const handshake = new McAdapterHandshake(client, customConfig);
      await handshake.register();

      expect(client.registerAdapter).toHaveBeenCalledWith(
        expect.objectContaining({ capabilities: ['board.tasks', 'docs.read'] }),
      );
    });

    it('uses custom subscribedEvents when provided', async () => {
      const customConfig: McAdapterConfig = {
        ...config,
        subscribedEvents: ['work_item.status_changed', 'work_item.created'],
      };
      const handshake = new McAdapterHandshake(client, customConfig);
      await handshake.register();

      expect(client.registerAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          subscribedEvents: ['work_item.status_changed', 'work_item.created'],
        }),
      );
    });
  });

  describe('performHandshake', () => {
    it('returns registration and healthy=true', async () => {
      const handshake = new McAdapterHandshake(client, config);
      const result = await handshake.performHandshake();

      expect(result.healthy).toBe(true);
      expect(result.registration.id).toBe('reg-1');
    });

    it('returns healthy=false but still registers when health check fails', async () => {
      client = makeClient({
        health: vi.fn().mockRejectedValue(new Error('Down')),
        registerAdapter: vi.fn().mockResolvedValue(makeRegistration()),
      });
      const handshake = new McAdapterHandshake(client, config);
      const result = await handshake.performHandshake();

      expect(result.healthy).toBe(false);
      expect(result.registration.id).toBe('reg-1');
    });
  });
});
