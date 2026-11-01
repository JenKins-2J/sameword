import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const AVATARS = ["🐱", "🐼", "🐸", "🐰", "🦊", "🐻", "🐯", "🐨"];
const COLORS = ["#fce7d6", "#dff3e4", "#e7e4ff", "#ffe5ed", "#dff2fb", "#fff0c9", "#f4e1ff", "#e6edff"];

// 手机和电脑访问同一个局域网地址时，会自动连接到该地址的 3001 端口。
const socket = io(`http://${window.location.hostname}:3001`, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});

export default function App() {
  const [page, setPage] = useState("home");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [mode, setMode] = useState("word");
  const [seconds, setSeconds] = useState(60);
  const [question, setQuestion] = useState("说到夏天，你会想到什么？");
  const [answer, setAnswer] = useState("");
  const [notice, setNotice] = useState("");
  const [socketId, setSocketId] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setSocketId(socket.id || "");
    };
    const onDisconnect = () => setConnected(false);
    const onRoomUpdate = (nextRoom) => {
      setRoom(nextRoom);
      setRoomCode(nextRoom.code);
      setMode(nextRoom.mode);
      setSeconds(nextRoom.seconds);
      setQuestion(nextRoom.question);
      if (nextRoom.phase === "game") setPage("game");
      else if (nextRoom.phase === "lobby") setPage("lobby");
    };
    const onRoomClosed = (message) => {
      setRoom(null);
      setPage("home");
      setNotice(message || "房间已关闭。");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:update", onRoomUpdate);
    socket.on("room:closed", onRoomClosed);
    socket.connect();

    return () => {
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
  const myPlayer = players.find((player) => player.id === socketId);
  const isHost = Boolean(myPlayer?.host);
  const submittedCount = players.filter((player) => player.answer).length;
  const matchingCount = useMemo(() => {
    const submitted = players.map((player) => player.answer).filter(Boolean);
    if (!submitted.length) return 0;
    const first = submitted[0].trim().toLowerCase();
    return submitted.filter((value) => value.trim().toLowerCase() === first).length;
  }, [players]);

  function handleAck(response, successMessage) {
    if (!response?.ok) {
      setNotice(response?.error || "操作失败，请确认服务器正在运行。");
      return false;
    }
    if (successMessage) setNotice(successMessage);
    if (response.room) setRoom(response.room);
    return true;
  }

  function createRoom() {
    if (!connected) {
      setNotice("还没连接到联机服务器。请先启动服务器，再刷新页面。");
      return;
    }
    const name = nickname.trim() || "玩家";
    socket.emit("room:create", { name }, (response) => {
      if (handleAck(response, "房间创建成功！把邀请码分享给朋友吧。")) {
        setRoom(response.room);
        setRoomCode(response.room.code);
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
    socket.emit("room:join", { code, name: nickname.trim() || "玩家" }, (response) => {
      if (handleAck(response, "成功加入房间！")) {
        setRoom(response.room);
        setRoomCode(response.room.code);
        setPage(response.room.phase === "game" ? "game" : "lobby");
      }
    });
  }

  function leaveRoom() {
    socket.emit("room:leave", {}, (response) => {
      setRoom(null);
      setPage("home");
      setAnswer("");
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

  function revealAnswers() {
    socket.emit("game:reveal", {}, (response) => {
      handleAck(response, "答案揭晓！看看大家有多默契。");
    });
  }

  function backToLobby() {
    socket.emit("game:back-to-lobby", {}, (response) => {
      handleAck(response);
      setPage("lobby");
    });
  }

  function copyRoomCode() {
    navigator.clipboard?.writeText(room?.code || roomCode)
      .then(() => setNotice("邀请码已复制，可以发给朋友啦。"))
      .catch(() => setNotice(`房间邀请码：${room?.code || roomCode}`));
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
                    <b>{player.name}{player.id === socketId ? "（你）" : ""}</b>
                    <small>{player.host ? "房主" : "已加入"}</small>
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
          <section className="game-page">
            <button className="back-btn" onClick={backToLobby}>← 返回房间</button>
            <div className="game-status"><span className="online-dot" /> {mode === "word" ? "同词联想" : "默契问答"} <span>·</span> {players.length} 人房间</div>
            <div className="question-card">
              <div className="question-symbol">{mode === "word" ? "☁" : "♡"}</div>
              <div className="eyebrow">THIS ROUND'S QUESTION</div>
              <h1>{question}</h1>
              <p>别想太久，写下你脑海里最先出现的答案。</p>
              <div className="timer-chip">◷ {seconds} 秒思考时间</div>
            </div>
            <div className="answer-card">
              <label className="field-label" htmlFor="answer">你的答案</label>
              <form onSubmit={submitAnswer}>
                <input id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="写下你的第一个想法……" maxLength={60} disabled={room.revealed} />
                <button className="primary-btn" type="submit" disabled={room.revealed}>提交答案 ↗</button>
              </form>
              <div className="answer-progress"><span>已提交答案</span><b>{submittedCount} / {players.length}</b></div>
              <div className="progress-track"><div style={{ width: `${Math.min(100, submittedCount / Math.max(1, players.length) * 100)}%` }} /></div>
            </div>
            <div className="reveal-card">
              <div><b>{room.revealed ? "本轮答案已揭晓" : "准备好揭晓了吗？"}</b><small>{isHost ? "房主可以揭晓所有玩家的答案。" : "等待房主揭晓答案。"}</small></div>
              <button className="secondary-btn" onClick={revealAnswers} disabled={!isHost || room.revealed}>揭晓答案 ✨</button>
            </div>

            {room.revealed && <div className="results-card">
              <div className="eyebrow">✦ ROUND RESULTS</div>
              <h2>看看大家的答案</h2>
              <p className="result-sub">所有已提交答案都会实时同步到这里。</p>
              <div className="result-list">
                {players.map((player, i) => <div className="result-item" key={player.id}>
                  <span className="result-avatar" style={{ background: COLORS[i] }}>{player.avatar || AVATARS[i]}</span>
                  <span className="result-name">{player.name}</span>
                  <b>{answers[player.id] || "还没有回答"}</b>
                </div>)}
              </div>
              {submittedCount > 0 && <div className="score-note">当前提交答案中，有 {matchingCount} 个与第一份答案相同。</div>}
              {isHost && <button className="primary-btn" onClick={startGame}>再来一轮 ↻</button>}
              <button className="text-btn" onClick={backToLobby}>返回房间</button>
            </div>}
            {notice && <p className="notice">{notice}</p>}
          </section>
        )}

        {!connected && <p className="notice" style={{ maxWidth: 600, margin: "20px auto" }}>暂时连接不上联机服务器。请确认服务器终端正在运行，然后刷新页面。</p>}
      </main>
    </div>
  );
}
