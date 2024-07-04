import { RetryOptions } from './type';
/**
 * Attempts to execute a function that returns a promise and retries if the function throws an error.
 *
 * @param {Function} fn - A function that returns a promise to be executed.
 * @param {RetryOptions} options - Configuration options for the retry behavior.
 * @returns {Promise<void>} The result of the function execution if successful.
 */
export async function retry<T>(
    fn: (retryCount: number) => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const { retries = 1, delay = 0 } = options;
    let lastError: Error | null = null;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn(i);
        } catch (error) {
            lastError = error as Error;
            if (delay > 0) {
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}  