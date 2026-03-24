const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5072';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const key = localStorage.getItem('tumble_api_key') || '';
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return res.json();
}

export const api = {
  getCategories: () => request<Category[]>('/api/categories'),
  createCategory: (data: { name: string; description?: string; color?: string }) =>
    request<Category>('/api/categories', { method: 'POST', body: JSON.stringify(data) }),

  getTags: () => request<Tag[]>('/api/tags'),
  createTag: (data: { name: string; color?: string }) =>
    request<Tag>('/api/tags', { method: 'POST', body: JSON.stringify(data) }),

  getTexts: (params?: { page?: number; limit?: number; category?: string; tag?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.category) qs.set('category', params.category);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.search) qs.set('search', params.search);
    return request<TextsResponse>(`/api/texts?${qs}`);
  },
  getText: (id: string) => request<Text>(`/api/texts/${id}`),
  createText: (data: { title: string; content: string; manualTags?: string }) =>
    request<Text>('/api/texts', { method: 'POST', body: JSON.stringify(data) }),
  updateText: (id: string, data: Partial<{ title: string; content: string; tags: string[]; categories: string[] }>) =>
    request<Text>(`/api/texts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteText: (id: string) =>
    request<{ success: boolean }>(`/api/texts/${id}`, { method: 'DELETE' }),

  rewrite: (text: string, language: string, model: string, iteration?: { previousOutput: string; instruction: string }) =>
    request<RewriteResult>('/api/rewrite', { method: 'POST', body: JSON.stringify({ text, language, model, ...iteration }) }),

  getPreferences: () => request<{ preferences: string }>('/api/settings/preferences'),
  savePreferences: (preferences: string) =>
    request<{ preferences: string }>('/api/settings/preferences', { method: 'PUT', body: JSON.stringify({ preferences }) }),
};

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_auto: number;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  is_custom: number;
  created_at: string;
}

export interface Text {
  id: string;
  title: string;
  content: string;
  word_count: number;
  created_at: string;
  updated_at: string;
  categories: Category[];
  tags: Tag[];
}

export interface TextsResponse {
  data: Text[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RewriteResult {
  rewritten: string;
  inputTokens: number;
  outputTokens: number;
  examplesUsed: number;
}
