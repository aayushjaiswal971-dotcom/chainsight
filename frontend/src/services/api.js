import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh });
          localStorage.setItem('access_token', data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

// Warehouses
export const warehouseAPI = {
  list: () => api.get('/warehouses'),
  create: (data) => api.post('/warehouses', data),
  update: (id, data) => api.put(`/warehouses/${id}`, data),
  delete: (id) => api.delete(`/warehouses/${id}`),
};

// Products
export const productAPI = {
  list: () => api.get('/products'),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
};

// Inventory
export const inventoryAPI = {
  list: () => api.get('/inventory'),
  adjust: (data) => api.post('/inventory/adjust', data),
  exportCSV: () => api.get('/inventory/export', { responseType: 'blob' }),
};

// Shipments
export const shipmentAPI = {
  list: () => api.get('/shipments'),
  get: (id) => api.get(`/shipments/${id}`),
  create: (data) => api.post('/shipments', data),
  updateStatus: (id, status, delay_days) => api.patch(`/shipments/${id}/status`, { status, delay_days }),
  addEvent: (id, data) => api.post(`/shipments/${id}/events`, data),
  parseNote: (id, note) => api.post(`/shipments/${id}/parse-note`, { note }),
};

// Dashboard
export const dashboardAPI = {
  summary: () => api.get('/dashboard/summary'),
};

// AI
export const aiAPI = {
  analyze: () => api.post('/ai/analyze-risk'),
  history: () => api.get('/ai/analyses'),
};

// Data Import
export const importAPI = {
  downloadTemplate: (entity, format = 'csv') =>
    api.get(`/import/templates/${entity}?format=${format}`, { responseType: 'blob' }),
  preview: (entity, formData) =>
    api.post(`/import/${entity}/preview`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  validate: (entity, data) => api.post(`/import/${entity}/validate`, data),
  commit: (entity, data) => api.post(`/import/${entity}/commit`, data),
  getJobs: () => api.get('/import/jobs'),
  downloadJobErrors: (jobId) =>
    api.get(`/import/jobs/${jobId}/errors`, { responseType: 'blob' }),
};

export default api;
