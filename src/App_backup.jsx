
import { useState } from "react";
import "./App.css";

const AVATARS = ["🐱", "🐼", "🐸", "🐰", "🦊", "🐻", "🐯", "🐨"];
const COLORS = ["#fce7d6", "#dff3e4", "#e7e4ff", "#ffe5ed", "#dff2fb", "#fff0c9", "#f4e1ff", "#e6edff"];

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function App() {
  const [page, setPage] = useState("home");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [players, setPlayers] = useState([]);
  const [mode, setMode] = useState("word");
  const [seconds, setSeconds] = useState(60);
  const [question, setQuestion] = useState("说到夏天，你会想到什么？");
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState("");

  const me = nickname.trim() || "玩家 1";

  function createRoom() {
    const code = makeCode();
    setRoomCode(code);
    setRoomName("朋友的默契小屋");
    setPlayers([{ name: me, avatar: AVATARS[0], ready: true, host: true }]);
    setAnswers({});
    setRevealed(false);
    setNotice("房间已创建！把邀请码分享给朋友吧。");
    setPage("lobby");
  }

  function joinRoom() {
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setNotice("请输入朋友分享给你的房间邀请码。");
      return;
    }
    setRoomCode(code);
    setRoomName("加入的游戏房间");
    setPlayers([{ name: me, avatar: AVATARS[0], ready: true, host: true }]);
    setAnswers({});
    setRevealed(false);
    setNotice("这是本地演示房间。真正的跨设备加入功能正在开发中。");
    setPage("lobby");
  }

  function addDemoPlayer() {
    if (players.length >= 8) return;
    const n = players.length;
    setPlayers([...players, {
      name: `好友 ${n + 1}`,
      avatar: AVATARS[n % AVATARS.length],
      ready: true,
      host: false
    }]);
  }

  function startGame() {
    setAnswers({});
    setAnswer("");
    setRevealed(false);
    setQuestion(mode === "word" ? "说到夏天，你会想到什么？" : "你最想和朋友一起去哪里？");
    setPage("game");
  }

  function submitAnswer() {
    if (!answer.trim()) {
      setNotice("先写下你的答案再提交哦。");
      return;
    }
    setAnswers({ ...answers, [me]: answer.trim() });
    setAnswer("");
    setNotice("答案已提交！当前为本地演示，其他玩家的答案需要联机服务器才能同步。");
  }

  function revealAnswers() {
    setRevealed(true);
    setNotice("答案揭晓！看看大家有多默契。");
  }

  function backToLobby() {
    setNotice("");
    setPage("lobby");
  }

  const matchingCount = Object.values(answers).filter(
    (v) => v.trim().toLowerCase() === (Object.values(answers)[0] || "").trim().toLowerCase()
  ).length;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("home")} aria-label="回到首页">
          <span className="brand-icon">✳</span>
          <span>同频 <small>SAME VIBE</small></span>
        </button>
        <div className="top-right">
          <span className="online-dot" /> 朋友的默契游戏
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
                <input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="输入 6 位邀请码" maxLength={6} onKeyDown={(e) => e.key === "Enter" && joinRoom()} />
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

        {page === "lobby" && (
          <section className="lobby-page">
            <button className="back-btn" onClick={() => setPage("home")}>← 返回首页</button>
            <div className="eyebrow"><span>✦</span> GAME ROOM</div>
            <h1 className="section-title">{roomName}</h1>
            <p className="section-desc">人到齐了吗？选好玩法，开始你们的默契挑战。</p>

            <div className="room-code-card">
              <div><small>房间邀请码</small><strong>{roomCode}</strong><p>邀请朋友输入邀请码加入</p></div>
              <button className="secondary-btn" onClick={() => { navigator.clipboard?.writeText(roomCode); setNotice("邀请码已复制（如果浏览器允许剪贴板操作）。"); }}>复制邀请码 ↗</button>
            </div>

            <div className="section-heading"><b>房间玩家</b><span>{players.length} / 8 人</span></div>
            <div className="players-grid">
              {Array.from({ length: 8 }, (_, i) => {
                const player = players[i];
                return <div className={`player-card ${player ? "occupied" : "empty"}`} key={i}>
                  {player ? <>
                    <div className="player-avatar" style={{ background: COLORS[i] }}>{player.avatar}</div>
                    <b>{player.name}</b>
                    <small>{player.host ? "房主 · 你" : "已准备"}</small>
                    <span className="ready-mark">✓</span>
                  </> : <>
                    <div className="empty-avatar">＋</div>
                    <b>等待加入</b><small>空闲位置</small>
                  </>}
                </div>;
              })}
            </div>

            <div className="demo-row">
              <span>想先预览 8 人房间？</span>
              <button className="text-btn" onClick={addDemoPlayer} disabled={players.length >= 8}>{players.length >= 8 ? "已满员" : "＋ 添加演示玩家"}</button>
            </div>

            <div className="section-heading"><b>选择游戏模式</b><span>随时可以再更换</span></div>
            <div className="mode-grid">
              <button className={`mode-card ${mode === "word" ? "selected" : ""}`} onClick={() => setMode("word")}>
                <span className="mode-emoji">💭</span><span className="mode-check">{mode === "word" ? "✓" : ""}</span>
                <b>同词联想</b><small>相同的问题，写下心里的第一个词。看看谁能想到一起。</small>
                <span className="mode-tag">经典玩法</span>
              </button>
              <button className={`mode-card ${mode === "quiz" ? "selected" : ""}`} onClick={() => setMode("quiz")}>
                <span className="mode-emoji">💗</span><span className="mode-check">{mode === "quiz" ? "✓" : ""}</span>
                <b>默契问答</b><small>回答有趣的小问题，看看谁和大家最有共同语言。</small>
                <span className="mode-tag pink-tag">朋友挑战</span>
              </button>
            </div>

            <div className="settings-row">
              <div><b>回答倒计时</b><small>给大家一点思考时间</small></div>
              <div className="time-options">{[30, 60, 90].map(s => <button key={s} className={seconds === s ? "active" : ""} onClick={() => setSeconds(s)}>{s} 秒</button>)}</div>
            </div>
            <button className="primary-btn start-btn" onClick={startGame}>开始游戏 <span>→</span></button>
            {notice && <p className="notice">{notice}</p>}
            <p className="footer-note">当前版本为本地原型 · 跨设备实时联机正在开发</p>
          </section>
        )}

        {page === "game" && (
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
              <form onSubmit={(e) => { e.preventDefault(); submitAnswer(); }}>
                <input id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="写下你的第一个想法……" maxLength={60} />
                <button className="primary-btn" type="submit">提交答案 ↗</button>
              </form>
              <div className="answer-progress"><span>已提交答案</span><b>{Object.keys(answers).length} / {players.length}</b></div>
              <div className="progress-track"><div style={{ width: `${Math.min(100, Object.keys(answers).length / Math.max(1, players.length) * 100)}%` }} /></div>
            </div>
            <div className="reveal-card">
              <div><b>准备好揭晓了吗？</b><small>演示模式下房主可以提前揭晓。</small></div>
              <button className="secondary-btn" onClick={revealAnswers}>揭晓答案 ✨</button>
            </div>

            {revealed && <div className="results-card">
              <div className="eyebrow">✦ ROUND RESULTS</div>
              <h2>看看大家的答案</h2>
              <p className="result-sub">本地演示只展示当前浏览器提交的答案。</p>
              <div className="result-list">
                {players.map((p, i) => <div className="result-item" key={p.name}>
                  <span className="result-avatar" style={{ background: COLORS[i] }}>{p.avatar}</span>
                  <span className="result-name">{p.name}</span>
                  <b>{answers[p.name] || "还没有回答"}</b>
                </div>)}
              </div>
              {Object.keys(answers).length > 0 && <div className="score-note">当前提交答案中，有 {matchingCount} 个与第一份答案相同。</div>}
              <button className="primary-btn" onClick={startGame}>再来一轮 ↻</button>
              <button className="text-btn" onClick={backToLobby}>返回房间</button>
            </div>}
            {notice && <p className="notice">{notice}</p>}
          </section>
        )}
      </main>
    </div>
  );
}
