const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.API_BASE_URL || 'http://localhost:4000';

export const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
