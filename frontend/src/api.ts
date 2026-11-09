export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? undefined : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body), signal,
  }); } catch (cause) {
    if (signal?.aborted || (cause instanceof Error && cause.name === 'AbortError')) throw cause;
    throw new ApiError('서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.', 0);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(typeof data?.error === 'string' ? data.error : response.status >= 500
      ? '서버 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.' : '요청을 처리하지 못했습니다.', response.status);
  }
  return response.json() as Promise<T>;
}
