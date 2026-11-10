import api from './api';

export const userService = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  toggleStatus: (id) => api.patch(`/users/${id}/status`),
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
};

export const notificationService = {
  getAll: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const fileService = {
  /**
   * Requests a time-limited signed Cloudinary download URL from the backend.
   * Returns JSON: { signedUrl, expiresAt, fileName, mimeType, fileSize }
   * The backend performs authorization before generating the URL.
   */
  getSignedUrl: (id) => api.get(`/files/${id}`),
  getMeta: (id) => api.get(`/files/${id}?meta=true`),
};
