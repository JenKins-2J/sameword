# 同频 SAME VIBE

多人联机的「同词相遇」小游戏：2–8 人，手机浏览器直接玩。

- **同词联想**：大家各写一个词，不一致就用上一轮的所有答案继续联想，直到全员写出同一个词（最多 12 轮）。
- **默契问答**：每轮一道 4 选 1 的题，全员选同一项就算默契；不一致就换下一题。
- 每轮有服务器端倒计时（30/60/90 秒），时间到了没答的人记为「未回答」，自动揭晓，不会卡住。

## 第一次使用（Windows / PowerShell）

```powershell
cd E:\sameword-8
npm install
npm run build     # 构建网页，生成 dist 目录（改过前端代码后要重新运行）
npm start         # 启动：网页 + 联机，全在 3001 端口
```

## 让手机玩

**同一个 Wi-Fi（最简单）**
1. 电脑运行 `ipconfig`，找到「IPv4 地址」，例如 `192.168.1.23`
2. 手机连同一个 Wi-Fi，浏览器打开 `http://192.168.1.23:3001`
3. 第一次启动时 Windows 防火墙会弹窗，选「允许专用网络」

**不在同一个 Wi-Fi（临时公网网址）**
```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3001
```
命令会打印一个 `https://xxxx.trycloudflare.com` 网址，发给朋友即可（电脑和 `npm start` 必须一直开着）。

**长期固定网址（部署到 Render / Railway 等）**
- 把项目推到 GitHub（`node_modules`、`dist` 已在 .gitignore 里）
- 新建 Web Service，Build Command：`npm install --include=dev && npm run build`
- Start Command：`npm start`（平台会自动提供 `PORT`，服务器已支持）
- 房间数据存在服务器内存里，只能运行 1 个实例；服务重启后房间会消失。

## 开发模式（改代码时）

开两个终端：`npm start`（后端，3001）和 `npm run dev`（前端，5173，自动代理联机到 3001）。
手机用 `http://电脑IP:5173` 访问。

## 修改题库

都在 `server.mjs` 顶部：`WORD_QUESTIONS`（同词联想）和 `QUIZ_QUESTIONS`（默契问答，每题 4 个选项）。
