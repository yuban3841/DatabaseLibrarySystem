import axios, { AxiosError, AxiosResponse } from 'axios';
import type { ApiEnvelope } from '../types';

/**
 * 是否启用内置演示数据。
 * 后端（成员 C/D）契约就绪后把 .env 里的 VITE_USE_MOCK 改成 false 即可，
 * 页面代码无需任何改动。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

export class ApiError extends Error {
  code: number;

  constructor(message: string, code = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器：自动附加 access token
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('clubcue_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 响应拦截器：401 视为登录态失效，清理后回登录页
http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('clubcue_token');
      localStorage.removeItem('clubcue_user');
      if (!window.location.pathname.endsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/**
 * 统一解包 { code, message, data, page } 响应体。
 * 业务码 >= 400 视为失败，抛 ApiError 由页面 message.error 展示。
 */
export async function unwrap<T>(promise: Promise<AxiosResponse<ApiEnvelope<T>>>): Promise<T> {
  const { data } = await promise;
  if (typeof data.code === 'number' && data.code >= 400) {
    throw new ApiError(data.message || `请求失败（${data.code}）`, data.code);
  }
  return data.data;
}

/** 文件下载（Excel 导出等）——不走统一解包，直接拿二进制流 */
export async function downloadBlob(
  promise: Promise<AxiosResponse<Blob>>,
  filename: string
): Promise<void> {
  const { data, headers } = await promise;
  const disposition = headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const name = match?.[1] ?? filename;
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default http;
