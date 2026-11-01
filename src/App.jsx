import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const AVATARS = ["🐱", "🐼", "🐸", "🐰", "🦊", "🐻", "🐯", "🐨"];
const COLORS = ["#fce7d6", "#dff3e4", "#e7e4ff", "#ffe5ed", "#dff2fb", "#fff0c9", "#f4e1ff", "#e6edff"];
const PLAYER_TOKEN_KEY = "same-vibe-player-token-v1";
const SAVED_ROOM_KEY = "same-vibe-room-code-v1";

function getPlayerToken() {
  let token = localStorage.getItem(PLAYER_TOKEN_KEY);
  if (!token) {
    token = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(PLAYER_TOKEN_KEY, token);
  }
  return token;
}

// 玩家身份保存在本机；刷新网页后仍使用同一个身份令牌。
const playerToken = getPlayerToken();
// 不写地址 = 连接当前网页所在的服务器；开发模式下由 vite.config.js 代理到 3001。
const socket = io({
  autoConnect: false,
  transports: ["websocket", "polling"],
});

export default function App() {
  const [page, setPage] = useState("home");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(SAVED_ROOM_KEY) || "");
  const [room, setRoom] = useState(null);
  const [mode, setMode] = useState("word");
  const [seconds, setSeconds] = useState(60);
  const [question, setQuestion] = useState("说到夏天，你会想到什么？");
  const [answer, setAnswer] = useState("");
  const [notice, setNotice] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [connected, setConnected] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const clockOffset = useRef(0);

  // 用服务器时间校准手机和电脑之间的时钟差，倒计时才会和服务器一致。
  useEffect(() => {
    if (room?.serverNow) clockOffset.current = room.serverNow - Date.now();
  }, [room?.serverNow]);

  useEffect(() => {
    if (!room?.deadline || room.revealed || room.phase !== "game") {
      setRemaining(null);
      return undefined;
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((room.deadline - Date.now() - clockOffset.current) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [room?.deadline, room?.revealed, room?.phase]);

  // 每次进入新一轮、揭晓或结束时自动回到游戏内容顶部，避免玩家手动翻页。
  useEffect(() => {
    if (page === "game") {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    }
  }, [page, room?.round, room?.revealed, room?.phase]);

  useEffect(() => {
    let disposed = false;
    const onConnect = () => {
      setConnected(true);
      // 连接成功后尝试恢复原来的玩家身份和房间。
      socket.emit("room:resume", { token: playerToken }, (response) => {
        if (disposed) return;
        if (response?.ok && response.room) {
          setPlayerId(response.playerId || "");
          setRoom(response.room);
          setRoomCode(response.room.code);
          localStorage.setItem(SAVED_ROOM_KEY, response.room.code);
          setMode(response.room.mode);
          setSeconds(response.room.seconds);
          setQuestion(response.room.question);
          setPage(response.room.phase === "lobby" ? "lobby" : "game");
          setNotice("已自动恢复上次的房间。");
        }
      });
    };
    const onDisconnect = () => setConnected(false);
    const onRoomUpdate = (nextRoom) => {
      setRoom(nextRoom);
      setRoomCode(nextRoom.code);
      localStorage.setItem(SAVED_ROOM_KEY, nextRoom.code);
      setMode(nextRoom.mode);
      setSeconds(nextRoom.seconds);
      setQuestion(nextRoom.question);
      if (nextRoom.phase === "lobby") setPage("lobby");
      else setPage("game");
    };
    const onRoomClosed = (message) => {
      setRoom(null);
      setPage("home");
      localStorage.removeItem(SAVED_ROOM_KEY);
      setNotice(message || "房间已关闭。");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:update", onRoomUpdate);
    socket.on("room:closed", onRoomClosed);
    socket.connect();

    return () => {
      disposed = true;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:update", onRoomUpdate);
      socket.off("room:closed", onRoomClosed);
      socket.disconnect();
    };
  }, []);

  const players = room?.players || [];
  const answers = useMemo(() => {
    const result = {};
    for (const player of players) {
      if (player.answer) result[player.id] = player.answer;
    }
    return result;
  }, [players]);
  const myPlayer = players.find((player) => player.id === playerId);
  const isHost = Boolean(myPlayer?.host);
  const submittedCount = players.filter((player) => player.answer).length;
  // 本轮最多有多少人想到了同一个答案（忽略大小写和首尾空格）。
  const topGroup = useMemo(() => {
    const counts = new Map();
    for (const player of players) {
      const value = (player.answer || "").trim().toLowerCase();
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts.size ? Math.max(...counts.values()) : 0;
  }, [players]);

  function handleAck(response, successMessage) {
    if (!response?.ok) {
      setNotice(response?.error || "操作失败，请确认服务器正在运行。");
      return false;
    }
    if (successMessage) setNotice(successMessage);
    if (response.room) setRoom(response.room);
    if (response.playerId) setPlayerId(response.playerId);
    return true;
  }

  function createRoom() {
    if (!connected) {
      setNotice("还没连接到联机服务器。请先启动服务器，再刷新页面。");
      return;
    }
    const name = nickname.trim() || "玩家";
    socket.emit("room:create", { name, token: playerToken }, (response) => {
      if (handleAck(response, "房间创建成功！把邀请码分享给朋友吧。")) {
        setRoom(response.room);
        setRoomCode(response.room.code);
        localStorage.setItem(SAVED_ROOM_KEY, response.room.code);
        setPage("lobby");
      }
    });
  }

  function joinRoom() {
    if (!connected) {
      setNotice("还没连接到联机服务器。请先启动服务器，再刷新页面。");
      return;
    }
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setNotice("请输入朋友分享给你的房间邀请码。");
      return;
    }
    socket.emit("room:join", { code, name: nickname.trim() || "玩家", token: playerToken }, (response) => {
      if (handleAck(response, "成功加入房间！")) {
        setRoom(response.room);
        setRoomCode(response.room.code);
        localStorage.setItem(SAVED_ROOM_KEY, response.room.code);
        setPage(response.room.phase === "lobby" ? "lobby" : "game");
      }
    });
  }

  function leaveRoom() {
    socket.emit("room:leave", {}, (response) => {
      setRoom(null);
      setPage("home");
      setAnswer("");
      setPlayerId("");
      localStorage.removeItem(SAVED_ROOM_KEY);
      setNotice(response?.message || "已离开房间。");
    });
  }

  function updateSettings(nextSettings) {
    socket.emit("room:settings", nextSettings, (response) => {
      handleAck(response);
    });
  }

  function startGame() {
    socket.emit("game:start", {}, (response) => {
      if (handleAck(response, "游戏开始啦！")) {
        setAnswer("");
        setPage("game");
      }
    });
  }

  function submitAnswer(event) {
    event?.preventDefault();
    if (!answer.trim()) {
      setNotice("先写下你的答案再提交哦。");
      return;
    }
    socket.emit("game:answer", { answer: answer.trim() }, (response) => {
      if (handleAck(response, "答案已同步给房间里的玩家！")) setAnswer("");
    });
  }

  function submitChoice(option) {
    socket.emit("game:answer", { answer: option }, (response) => {
      handleAck(response, "已选择！等其他玩家也选好就会揭晓。");
    });
  }

  function nextRound() {
    socket.emit("game:next-round", {}, (response) => {
      if (handleAck(response, "下一轮开始！这次要从上一轮所有人的答案继续联想。")) {
        setAnswer("");
        setPage("game");
      }
    });
  }

  function backToLobby() {
    socket.emit("game:back-to-lobby", {}, (response) => {
      if (handleAck(response)) {
        setAnswer("");
        setPage("lobby");
      }
    });
  }

  function copyRoomCode() {
    const code = room?.code || roomCode;
    if (!navigator.clipboard?.writeText) {
      setNotice(`房间邀请码：${code}`);
      return;
    }
    navigator.clipboard.writeText(code)
      .then(() => setNotice("邀请码已复制，可以发给朋友啦。"))
      .catch(() => setNotice(`房间邀请码：${code}`));
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => (room ? leaveRoom() : setPage("home"))} aria-label="回到首页">
          <span className="brand-icon">✳</span>
          <span>同频 <small>SAME VIBE</small></span>
        </button>
        <div className="top-right">
          <span className="online-dot" style={{ background: connected ? "#65c59a" : "#e5a0a0" }} />
          {connected ? "联机已连接" : "正在连接服务器"}
          <span className="limit-pill">最多 8 人</span>
        </div>
      </header>

      <main>
        {page === "home" && (
          <section className="home-page">
            <div className="hero-bubble bubble-one">☁️</div>
            <div className="hero-bubble bubble-two">✦</div>
            <div className="eyebrow"><span>✦</span> FRIENDS · WORDS · CONNECTION</div>
            <h1>想到一起，<br /><span>就是默契。</span></h1>
            <p className="hero-desc">一个词，一点点心有灵犀。叫上你的朋友，<br className="desktop-only" />看看你们之间究竟有多少默契。</p>

            <div className="home-card">
              <label className="field-label" htmlFor="nickname">先给自己起个名字</label>
              <input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="输入你的昵称" maxLength={16} />
              <button className="primary-btn" onClick={createRoom}>＋ 创建游戏房间 <span>→</span></button>
              <div className="or-divider"><span />或者加入朋友的房间<span /></div>
              <div className="join-row">
                <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="输入 6 位邀请码" maxLength={6} onKeyDown={(e) => e.key === "Enter" && joinRoom()} />
                <button className="secondary-btn" onClick={joinRoom}>加入房间</button>
              </div>
            </div>

            {notice && <p className="notice" role="status" aria-live="polite">{notice}</p>}

            <div className="feature-row">
              <div><span className="feature-icon pink">♡</span><b>同词联想</b><small>猜猜彼此的想法</small></div>
              <div><span className="feature-icon yellow">✧</span><b>默契问答</b><small>看看谁最懂谁</small></div>
              <div><span className="feature-icon green">♧</span><b>最多 8 人</b><small>朋友越多越好玩</small></div>
            </div>
            <p className="footer-note">为朋友相聚而做 · 一个正在成长的小项目</p>
          </section>
        )}

        {page === "lobby" && room && (
          <section className="lobby-page">
            <button className="back-btn" onClick={leaveRoom}>← 离开房间</button>
            <div className="eyebrow"><span>✦</span> GAME ROOM</div>
            <h1 className="section-title">{room.name}</h1>
            <p className="section-desc">人到齐了吗？选好玩法，开始你们的默契挑战。</p>

            <div className="room-code-card">
              <div><small>房间邀请码</small><strong>{room.code}</strong><p>把邀请码发给朋友，让他们加入同一个房间</p></div>
              <button className="secondary-btn" onClick={copyRoomCode}>复制邀请码 ↗</button>
            </div>

            <div className="section-heading"><b>房间玩家</b><span>{players.length} / 8 人</span></div>
            <div className="players-grid">
              {Array.from({ length: 8 }, (_, i) => {
                const player = players[i];
                return <div className={`player-card ${player ? "occupied" : "empty"}`} key={player?.id || `empty-${i}`}>
                  {player ? <>
                    <div className="player-avatar" style={{ background: COLORS[i] }}>{player.avatar || AVATARS[i]}</div>
                    <b>{player.name}{player.id === playerId ? "（你）" : ""}</b>
                    <small>{player.host ? "房主" : player.connected === false ? "暂时断线，等待重连" : "已加入"}</small>
                    {player.host && <span className="ready-mark">✓</span>}
                  </> : <>
                    <div className="empty-avatar">＋</div>
                    <b>等待加入</b><small>空闲位置</small>
                  </>}
                </div>;
              })}
            </div>

            <div className="section-heading"><b>选择游戏模式</b><span>{isHost ? "房主可以更改设置" : "等待房主开始游戏"}</span></div>
            <div className="mode-grid">
              <button className={`mode-card ${mode === "word" ? "selected" : ""}`} onClick={() => updateSettings({ mode: "word" })} disabled={!isHost}>
                <span className="mode-emoji">💭</span><span className="mode-check">{mode === "word" ? "✓" : ""}</span>
                <b>同词联想</b><small>相同的问题，写下心里的第一个词。看看谁能想到一起。</small>
                <span className="mode-tag">经典玩法</span>
              </button>
              <button className={`mode-card ${mode === "quiz" ? "selected" : ""}`} onClick={() => updateSettings({ mode: "quiz" })} disabled={!isHost}>
                <span className="mode-emoji">💗</span><span className="mode-check">{mode === "quiz" ? "✓" : ""}</span>
                <b>默契问答</b><small>回答有趣的小问题，看看谁和大家最有共同语言。</small>
                <span className="mode-tag pink-tag">朋友挑战</span>
              </button>
            </div>

            <div className="settings-row">
              <div><b>回答倒计时</b><small>给大家一点思考时间</small></div>
              <div className="time-options">{[30, 60, 90].map((s) => <button key={s} className={seconds === s ? "active" : ""} onClick={() => updateSettings({ seconds: s })} disabled={!isHost}>{s} 秒</button>)}</div>
            </div>
            <button className="primary-btn start-btn" onClick={startGame} disabled={!isHost || players.length < 1}>开始游戏 <span>→</span></button>
            {!isHost && <p className="notice">房主正在准备游戏，开始后你的页面会自动切换。</p>}
            {notice && <p className="notice">{notice}</p>}
            <p className="footer-note">实时房间 · 玩家与游戏状态由服务器同步</p>
          </section>
        )}

        {page === "game" && room && (
          <section className={`game-page ${room.phase === "finished" ? "game-finished" : room.revealed ? "game-revealed" : "game-thinking"}`}>
            <div className="game-topline">
              {isHost ? <button className="back-btn" onClick={backToLobby}>← 房间</button> : <span />}
              <span className="room-mini">房间 {room.code}</span>
              <span className="round-mini">第 {room.round || 1} / {room.maxRounds || 12} 轮</span>
            </div>

            {!room.revealed && room.phase !== "finished" && <>
              <div className="play-card question-card">
                <div className="round-kicker">第 {room.round || 1} 轮 · 思考中</div>
                <div className="question-symbol">{room.mode === "quiz" ? "♡" : "✦"}</div>
                <h1>{question}</h1>
                <p>{room.mode === "quiz" ? "选一个你觉得大家也会选的答案。" : "别想太久，写下你脑海里最先出现的答案。"}</p>
                <div className={`timer-chip ${remaining !== null && remaining <= 10 ? "timer-urgent" : ""}`}>◷ {remaining === null ? `${seconds} 秒思考时间` : remaining > 0 ? `还剩 ${remaining} 秒` : "时间到，正在揭晓……"}</div>
              </div>

              <div className="answer-card answer-card-focus">
                {room.mode === "quiz" ? <div>
                  <div className="field-label">{myPlayer?.answer ? "你已选择，等待其他玩家……" : "点选你的答案"}</div>
                  <div className="option-grid">
                    {(room.options || []).map((option) => <button key={option} type="button" className={`option-btn ${myPlayer?.answer === option ? "picked" : ""}`} disabled={Boolean(myPlayer?.answer)} onClick={() => submitChoice(option)}>{option}</button>)}
                  </div>
                </div> : <form onSubmit={submitAnswer}>
                    <label className="field-label" htmlFor="answer">你的答案</label>
                    <input id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={myPlayer?.answer ? "你已提交，等待其他玩家……" : "写下你的第一个想法……"} maxLength={60} disabled={Boolean(myPlayer?.answer)} />
                    <button className="primary-btn" type="submit" disabled={Boolean(myPlayer?.answer)}>{myPlayer?.answer ? "已提交，等待对方" : "提交答案 →"}</button>
                  </form>}
                <div className="answer-progress"><span>大家正在陆续提交</span><b>{submittedCount} / {players.length}</b></div>
                <div className="progress-track"><div style={{ width: `${Math.min(100, submittedCount / Math.max(1, players.length) * 100)}%` }} /></div>
              </div>
              {notice && <p className="notice">{notice}</p>}
            </>}

            {room.revealed && room.phase !== "finished" && <div className="play-card reveal-screen">
              <div className="reveal-heading">
                <span>第 {room.round || 1} 轮 · 揭晓</span>
                <span className="reveal-status">{topGroup} / {players.length} 人想到一起</span>
              </div>
              <h1>{room.mode === "quiz" ? "看看大家选了什么" : "从这些词之间，寻找下一步"}</h1>
              <div className="answer-pair">
                {players.map((player, i) => <div className={`answer-tile ${i % 2 === 0 ? "tile-purple" : "tile-mint"}`} key={player.id}>
                  <small>{player.name}{player.id === playerId ? "（你）" : ""}</small>
                  <strong>{answers[player.id] || "未回答"}</strong>
                </div>)}
              </div>
              <p className="reveal-hint">{room.mode === "quiz" ? "还没有全员选同一个，继续下一题再试试！" : "觉得这些词说的是同一个东西？只要想到的是同一个方向，就继续联想。"}</p>
              {isHost ? <button className="primary-btn reveal-next" onClick={nextRound}>继续下一轮 <span>→</span></button> : <div className="waiting-next">房主正在准备下一轮，请稍等……</div>}
              {room.round >= (room.maxRounds || 12) && <p className="notice">已到达最大轮数，继续操作将结束本局。</p>}
              {notice && <p className="notice">{notice}</p>}
            </div>}

            {room.phase === "finished" && <div className="play-card results-card final-results">
              <div className="round-kicker">共 {room.round || (room.history || []).length} 轮 · 回顾</div>
              <div className="finish-symbol">✦</div>
              <h1>{room.finishReason === "match" ? "你们的脑回路相遇了" : "这一局，已经很有默契"}</h1>
              <p className="result-sub">房间 {room.code} · 共 {room.round || (room.history || []).length} 轮</p>
              <div className="round-history">
                {(room.history || []).map((round) => <section className="history-round" key={round.round}>
                  <div className="history-round-heading"><b>第 {round.round} 轮</b><span>{round.allMatch ? "✓ 全员同频" : "继续联想"}</span></div>
                  <p className="history-question">{round.question}</p>
                  <div className="history-answer-pair">
                    {round.answers.map((item, i) => <div className={`history-answer ${i % 2 === 0 ? "tile-purple" : "tile-mint"}`} key={`${round.round}-${item.playerId}`}>
                      <b>{item.answer}</b>
                    </div>)}
                  </div>
                </section>)}
              </div>
              {isHost && <button className="primary-btn reveal-next" onClick={backToLobby}>再来一局 <span>↻</span></button>}
              {notice && <p className="notice">{notice}</p>}
            </div>}
          </section>
        )}

        {!connected && <p className="notice" style={{ maxWidth: 600, margin: "20px auto" }}>暂时连接不上联机服务器。请确认服务器终端正在运行，然后刷新页面。</p>}
      </main>
    </div>
  );
}
