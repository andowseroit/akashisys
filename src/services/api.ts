const API_BASE_URL = "http://localhost:4000/api";

export function getAdminToken() {
  return localStorage.getItem("adminToken");
}

export function authHeader() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const api = {
  async request<T>(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    for (const [key, value] of Object.entries(authHeader())) {
      headers.set(key, value);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return response.json() as Promise<T>;
  },
};

export default api;
