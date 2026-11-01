import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 开发模式：网页跑在 5173，联机服务跑在 3001；这里把 /socket.io 代理过去，
// 这样前端代码里不用写死地址，手机用电脑的局域网 IP 打开 5173 也能联机。
const socketProxy = {
  '/socket.io': { target: 'http://localhost:3001', ws: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { host: true, proxy: socketProxy },
  preview: { host: true, proxy: socketProxy },
})
