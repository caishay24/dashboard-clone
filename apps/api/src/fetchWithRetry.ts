export interface FetchWithRetryOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  onAttempt?: () => Promise<void> | void;
}

export async function fetchWithRetry(input: string | URL, options: FetchWithRetryOptions = {}) {
  const { timeoutMs = 5000, retries = 1, onAttempt, headers, ...init } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await onAttempt?.();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, {
        ...init,
        headers: {
          "Accept-Encoding": "gzip",
          ...headers
        },
        signal: controller.signal
      });
      if (!response.ok && attempt < retries) {
        lastError = new Error(`HTTP ${response.status}`);
        await delay(250 * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await delay(250 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("fetch failed");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
