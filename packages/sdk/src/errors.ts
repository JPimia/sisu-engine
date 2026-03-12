/**
 * Thrown when the SISU API returns a non-2xx response.
 */
export class SisuApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    super(`SISU API error ${status}: ${statusText}`);
    this.name = 'SisuApiError';
  }
}
