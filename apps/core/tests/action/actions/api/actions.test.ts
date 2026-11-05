import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dereferenceMock: vi.fn(),
  authenticateMock: vi.fn(),
  OAuth2ClientMock: vi.fn(),
}));

mocks.OAuth2ClientMock.mockImplementation(function (this: any) {
  this.authenticate = mocks.authenticateMock;
});

vi.mock('@apidevtools/swagger-parser', () => ({
  default: { dereference: mocks.dereferenceMock },
}));

vi.mock('@/action/actions/api/OAuth2Client', () => ({
  OAuth2Client: mocks.OAuth2ClientMock,
}));

import { GroupApi } from '@/action/actions/api/actions';

const { dereferenceMock, authenticateMock, OAuth2ClientMock } = mocks;

describe('GroupApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).fetch = vi.fn();
  });

  describe('load', () => {
    const apiDoc = {
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/pets': {
          get: { operationId: 'listPets' },
          post: { operationId: 'createPet' },
        },
        '/pets/{id}': {
          get: { operationId: 'getPet' },
        },
      },
    };

    it('maps operationIds to endpoint configs', async () => {
      dereferenceMock.mockResolvedValue(apiDoc);
      const result = await GroupApi.load({ url: 'https://spec.example.com/openapi.json' } as any);

      expect(dereferenceMock).toHaveBeenCalledWith('https://spec.example.com/openapi.json');
      expect(result).toEqual({
        listPets: { baseUrl: 'https://api.example.com', method: 'get', path: '/pets' },
        createPet: { baseUrl: 'https://api.example.com', method: 'post', path: '/pets' },
        getPet: { baseUrl: 'https://api.example.com', method: 'get', path: '/pets/{id}' },
      });
    });

    it('filters to only the included operationIds', async () => {
      dereferenceMock.mockResolvedValue(apiDoc);
      const result = await GroupApi.load({
        url: 'https://spec.example.com/openapi.json',
        include: ['listPets'],
      } as any);

      expect(Object.keys(result)).toEqual(['listPets']);
    });

    it('excludes the given operationIds', async () => {
      dereferenceMock.mockResolvedValue(apiDoc);
      const result = await GroupApi.load({
        url: 'https://spec.example.com/openapi.json',
        exclude: ['createPet'],
      } as any);

      expect(Object.keys(result).sort()).toEqual(['getPet', 'listPets']);
    });

    it('propagates a rejection from SwaggerParser', async () => {
      dereferenceMock.mockRejectedValue(new Error('invalid spec'));
      await expect(
        GroupApi.load({ url: 'https://spec.example.com/openapi.json' } as any)
      ).rejects.toThrow('invalid spec');
    });

    it('throws when url is not a valid URL', async () => {
      await expect(GroupApi.load({ url: 'not-a-url' } as any)).rejects.toThrow();
    });
  });

  describe('invoke', () => {
    const endpoints = {
      getPet: { baseUrl: 'https://api.example.com', method: 'get', path: '/pets/{id}' },
    };

    it('calls the resolved endpoint and returns parsed JSON', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 42, name: 'Rex' }),
      });

      const result = await GroupApi.invoke({
        endpoints,
        method: 'getPet',
        args: { id: '42' },
      } as any);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/pets/42',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual({ id: 42, name: 'Rex' });
    });

    it('throws when the method is not in the loaded endpoints', async () => {
      await expect(GroupApi.invoke({ endpoints, method: 'missingOp' } as any)).rejects.toThrow(
        'Endpoint "missingOp" not found in loaded endpoints'
      );
    });

    it('propagates an error response from fetch as a thrown error', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '',
      });

      await expect(
        GroupApi.invoke({ endpoints, method: 'getPet', args: { id: '1' } } as any)
      ).rejects.toThrow('Request failed: 404 Not Found');
    });

    it('throws when method is missing', async () => {
      await expect(GroupApi.invoke({ endpoints } as any)).rejects.toThrow();
    });

    it('throws a friendly error instead of a raw TypeError when endpoints is missing', async () => {
      await expect(GroupApi.invoke({ method: 'getPet' } as any)).rejects.toThrow(
        'Endpoint "getPet" not found in loaded endpoints'
      );
    });
  });

  describe('request', () => {
    it('makes a GET request with query parameters', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

      const result = await GroupApi.request({
        url: 'https://api.example.com/items',
        method: 'GET',
        parameters: { limit: '5' },
      } as any);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/items?limit=5',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual({ items: [] });
    });

    it('sends a JSON body for POST', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ created: true }) });

      await GroupApi.request({
        url: 'https://api.example.com/v1/items',
        method: 'POST',
        parameters: { name: 'widget' },
      } as any);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'widget' }),
        })
      );
    });

    it('leaves braces in the URL alone instead of treating them as path arguments', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });

      await GroupApi.request({
        url: 'https://api.example.com/items/{literal}',
        method: 'GET',
      } as any);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/items/{literal}',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('prefers body over parameters when both are provided', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });

      await GroupApi.request({
        url: 'https://api.example.com/items',
        method: 'POST',
        parameters: { name: 'ignored' },
        body: { name: 'used' },
      } as any);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/items',
        expect.objectContaining({ body: JSON.stringify({ name: 'used' }) })
      );
    });

    it('propagates a rejection from fetch', async () => {
      (global.fetch as any).mockRejectedValue(new Error('network down'));
      await expect(
        GroupApi.request({ url: 'https://api.example.com/items', method: 'GET' } as any)
      ).rejects.toThrow('network down');
    });

    it('throws for an unsupported method', async () => {
      await expect(
        GroupApi.request({ url: 'https://api.example.com/items', method: 'OPTIONS' as any })
      ).rejects.toThrow();
    });
  });

  describe('auth', () => {
    const authParams = {
      type: 'oauth2' as const,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      scopes: ['scope1'],
      authEndpoint: 'https://accounts.example.com/auth',
      tokenEndpoint: 'https://accounts.example.com/token',
    };

    it('constructs an OAuth2Client and returns its tokens', async () => {
      authenticateMock.mockResolvedValue({ access_token: 'abc', expires_in: 3600 });

      const result = await GroupApi.auth(authParams as any);

      expect(OAuth2ClientMock).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-id',
          clientSecret: 'client-secret',
          scopes: ['scope1'],
          authEndpoint: 'https://accounts.example.com/auth',
          tokenEndpoint: 'https://accounts.example.com/token',
        })
      );
      expect(result).toEqual({ access_token: 'abc', expires_in: 3600 });
    });

    it('propagates a rejection from authenticate', async () => {
      authenticateMock.mockRejectedValue(new Error('token exchange failed'));
      await expect(GroupApi.auth(authParams as any)).rejects.toThrow('token exchange failed');
    });

    it('throws when type is not oauth2', async () => {
      await expect(GroupApi.auth({ ...authParams, type: 'basic' } as any)).rejects.toThrow();
    });
  });
});
