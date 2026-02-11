const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.API_BASE_URL || '';
const API_BASE_URL = rawBaseUrl || 'http://localhost:4000';

if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info('[api] using base URL:', API_BASE_URL);
}

export const getApiBaseUrl = () => API_BASE_URL;

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
