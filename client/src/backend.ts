// 本地开发默认连接固定后端端口，避免前端端口变化时连错服务。
const LOCAL_BACKEND_PORT = "45170";
const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

export const BACKEND_URL = import.meta.env.VITE_BACKEND_WS_URL
    || (isLocalHost
        ? `ws://${window.location.hostname}:${LOCAL_BACKEND_PORT}`
        : `${window.location.protocol.replace("http", "ws")}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`);

export const BACKEND_HTTP_URL = import.meta.env.VITE_BACKEND_HTTP_URL || BACKEND_URL.replace("ws", "http");
