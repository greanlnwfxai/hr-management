import { ENV } from '../config/env';

export interface HealthResponse {
  status: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const url = `${ENV.API_BASE_URL}/health`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}
