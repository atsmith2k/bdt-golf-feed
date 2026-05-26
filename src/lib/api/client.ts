// src/lib/api/client.ts
import { createExternalServiceError } from '@/lib/utils/error';
import { getGhinAuthTokenOrThrow, invalidateGhinTokenCache } from './auth';

/**
 * API client configuration
 */
interface ApiClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
  /**
   * Optional async hook returning a bearer token. When provided, the client
   * attaches `Authorization: Bearer <token>` to every request and, on a 401,
   * invokes `onUnauthorized` then retries the request once with a fresh token.
   */
  getAuthToken?: () => Promise<string | null | undefined>;
  onUnauthorized?: () => void | Promise<void>;
}

/**
 * Request options
 */
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  cache?: RequestCache;
}

/**
 * API client for making HTTP requests
 */
export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private defaultTimeout: number;
  private getAuthToken?: () => Promise<string | null | undefined>;
  private onUnauthorized?: () => void | Promise<void>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.defaultHeaders = config.headers || {};
    this.defaultTimeout = config.timeout || 10000; // 10 seconds default
    this.getAuthToken = config.getAuthToken;
    this.onUnauthorized = config.onUnauthorized;
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body: any, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  /**
   * Make a PUT request
   */
  async put<T>(path: string, body: any, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * Make a PATCH request
   */
  async patch<T>(path: string, body: any, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  /**
   * Make a request with the given options.
   *
   * If a `getAuthToken` hook is configured, the bearer token is attached
   * automatically. On a 401, the client invokes `onUnauthorized` (which
   * typically clears the cached token) and retries the request once.
   */
  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.executeRequest<T>(path, options, /* allowAuthRetry */ true);
  }

  private async executeRequest<T>(
    path: string,
    options: RequestOptions,
    allowAuthRetry: boolean,
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const method = options.method || 'GET';
    const timeout = options.timeout || this.defaultTimeout;

    // Acquire auth token if configured.
    const authToken = this.getAuthToken ? await this.getAuthToken() : null;
    const headers = this.mergeHeaders(options.headers, authToken ?? undefined);

    // Prepare the request
    const requestOptions: RequestInit = {
      method,
      headers,
      cache: options.cache || 'no-cache',
    };

    // Add body for non-GET requests
    if (method !== 'GET' && options.body) {
      requestOptions.body =
        typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timed out after ${timeout}ms`));
        }, timeout);
      });

      // Race the fetch against the timeout
      const response = (await Promise.race([
        fetch(url, requestOptions),
        timeoutPromise,
      ])) as Response;

      // Handle non-2xx responses
      if (!response.ok) {
        // Auto-refresh + single retry on 401 when using authenticated mode.
        if (response.status === 401 && allowAuthRetry && this.getAuthToken) {
          if (this.onUnauthorized) await this.onUnauthorized();
          return this.executeRequest<T>(path, options, /* allowAuthRetry */ false);
        }

        const errorData = await this.parseResponseData(response);
        const message = extractErrorMessage(errorData, response.status, response.statusText);
        // Log non-2xx responses; downgrade 404 to warn since some upstream
        // endpoints (e.g. GHIN's handicap_revisions.json) are documented as
        // optional and routinely return 404 for valid golfers.
        const log = response.status === 404 ? console.warn : console.error;
        log(
          `[api] ${method} ${url} -> ${response.status} ${response.statusText}: ${message}`,
        );
        throw createExternalServiceError('API', message, errorData);
      }

      // Parse the response
      return await this.parseResponseData(response);
    } catch (error: any) {
      // Handle network errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw createNetworkError('Network error. Please check your connection and try again.');
      }

      // Re-throw the error
      throw error;
    }
  }

  /**
   * Resolve a URL from a path
   */
  private resolveUrl(path: string): string {
    // If the path is already a full URL, return it
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    // Otherwise, join it with the base URL
    const baseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return `${baseUrl}${normalizedPath}`;
  }

  /**
   * Merge default headers with request-specific headers and an optional bearer token.
   */
  private mergeHeaders(
    requestHeaders?: Record<string, string>,
    bearerToken?: string,
  ): Record<string, string> {
    const headers = { ...this.defaultHeaders };

    // Add Content-Type header if not present
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    // Merge with request-specific headers
    if (requestHeaders) {
      Object.entries(requestHeaders).forEach(([key, value]) => {
        headers[key] = value;
      });
    }

    return headers;
  }

  /**
   * Parse response data based on content type
   */
  private async parseResponseData(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      return response.json();
    }

    if (contentType?.includes('text/')) {
      return response.text();
    }

    // For other content types, return the raw response
    return response;
  }
}

/**
 * Create a GHIN API client.
 *
 * Every outbound request attaches the cached bearer token from the GHIN auth
 * module. If the cache is empty or expired, `getGhinAuthTokenOrThrow` throws
 * a GhinAuthError instead of silently logging in — token refresh is an
 * admin-only action triggered from the CMS (see /api/ghin/auth).
 *
 * On a 401 from GHIN we clear the cache (the token must have been revoked
 * server-side) so the next request reports AUTH_EXPIRED clearly.
 */
export function createGhinApiClient(): ApiClient {
  return new ApiClient({
    baseUrl: 'https://api2.ghin.com/api/v1',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'BDTGolfNetwork/1.0',
    },
    timeout: 15000, // 15 seconds
    getAuthToken: () => getGhinAuthTokenOrThrow(),
    onUnauthorized: () => invalidateGhinTokenCache(),
  });
}

/**
 * GHIN API client instance
 */
export const ghinApiClient = createGhinApiClient();

/**
 * Function to create a network error
 */
function createNetworkError(message: string) {
  const error = new Error(message);
  error.name = 'NetworkError';
  return error;
}

/**
 * Build a useful message from an upstream error response. Tries common shapes
 * (`message`, `error`, `errors[]`, JSON-stringified body) so we don't lose
 * context like "no records found" or specific validation failures.
 */
function extractErrorMessage(
  body: unknown,
  status: number,
  statusText: string,
): string {
  const fallback = `Request failed with status ${status}${statusText ? ` ${statusText}` : ''}`;
  if (!body) return fallback;
  if (typeof body === 'string') return body.length > 0 ? body : fallback;
  if (typeof body !== 'object') return fallback;

  const obj = body as Record<string, unknown>;
  if (typeof obj.message === 'string' && obj.message) return obj.message;
  if (typeof obj.error === 'string' && obj.error) return obj.error;

  if (Array.isArray(obj.errors)) {
    const joined = obj.errors
      .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
      .filter(Boolean)
      .join('; ');
    if (joined) return `${fallback}: ${joined}`;
  } else if (obj.errors && typeof obj.errors === 'object') {
    try {
      return `${fallback}: ${JSON.stringify(obj.errors)}`;
    } catch {
      /* ignore */
    }
  }

  try {
    const serialized = JSON.stringify(obj);
    if (serialized && serialized !== '{}') return `${fallback}: ${serialized}`;
  } catch {
    /* ignore */
  }
  return fallback;
}
