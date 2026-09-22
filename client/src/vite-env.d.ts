/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端 API 地址，留空则走 Vite 代理（推荐开发环境） */
  readonly VITE_API_BASE_URL?: string;
  /** 'true' 时启用内置演示数据（后端未就绪期间可独立运行） */
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
