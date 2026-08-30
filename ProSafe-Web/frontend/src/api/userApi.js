import { apiClient, normalizeApiError } from "./apiClient";

export async function listUsers(params) {
  try {
    const { data } = await apiClient.get("/users", { params });
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function getMe() {
  try {
    const { data } = await apiClient.get("/users/me");
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function getUserById(id) {
  try {
    const { data } = await apiClient.get(`/users/${id}`);
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

// `payload` may be a plain object (no image) or a FormData (image included) —
// axios sets the right Content-Type automatically either way.
export async function createUser(payload) {
  try {
    const { data } = await apiClient.post("/users", payload);
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function updateUser(id, payload) {
  try {
    const { data } = await apiClient.put(`/users/${id}`, payload);
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function deleteUser(id) {
  try {
    const { data } = await apiClient.delete(`/users/${id}`);
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

// Builds multipart/form-data only when a profile image file is actually
// present — plain JSON otherwise, so the common no-image path stays simple.
export function buildUserFormData(fields, imageFile) {
  if (!imageFile) {
    return fields;
  }
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });
  formData.append("profileImage", imageFile);
  return formData;
}
