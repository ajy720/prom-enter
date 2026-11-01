export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? undefined : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body), signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(typeof data.error === 'string' ? data.error : '요청을 처리하지 못했습니다.', response.status);
  }
  return response.json() as Promise<T>;
}
