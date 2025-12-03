const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // For cookies
  };

  // Handle FormData (for file uploads)
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  } else if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Request failed');
  }

  return response.json();
}

// School Management APIs
export async function getSchools() {
  return request('/superadmin/schools/');
}

export async function createSchool(schoolData) {
  const formData = new FormData();
  
  // Add text fields
  Object.keys(schoolData).forEach(key => {
    if (schoolData[key] !== null && schoolData[key] !== undefined && 
        key !== 'logo' && key !== 'favicon') {
      formData.append(key, schoolData[key]);
    }
  });
  
  // Add files if present
  if (schoolData.logo) formData.append('logo', schoolData.logo);
  if (schoolData.favicon) formData.append('favicon', schoolData.favicon);
  
  return request('/superadmin/schools/', {
    method: 'POST',
    body: formData,
  });
}

export async function updateSchool(id, schoolData) {
  const formData = new FormData();
  
  Object.keys(schoolData).forEach(key => {
    if (schoolData[key] !== null && schoolData[key] !== undefined &&
        key !== 'logo' && key !== 'favicon') {
      formData.append(key, schoolData[key]);
    }
  });
  
  if (schoolData.logo instanceof File) formData.append('logo', schoolData.logo);
  if (schoolData.favicon instanceof File) formData.append('favicon', schoolData.favicon);
  
  return request(`/superadmin/schools/${id}/`, {
    method: 'PATCH',
    body: formData,
  });
}

export async function activateSchool(id) {
  return request(`/superadmin/schools/${id}/activate/`, { method: 'POST' });
}

export async function deactivateSchool(id) {
  return request(`/superadmin/schools/${id}/deactivate/`, { method: 'POST' });
}

export async function deleteSchool(id) {
  return request(`/superadmin/schools/${id}/`, { method: 'DELETE' });
}