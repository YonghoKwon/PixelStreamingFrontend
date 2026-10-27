import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createSession } from './streaming/session';
import type { ViewerSession } from './streaming/session';
import { initialAddress, rememberAddress, signalingUrl } from './streaming/connection';

type Stage = 'idle' | 'connecting' | 'waiting' | 'negotiating' | 'playing' | 'disconnected' | 'error';
const stageLabel: Record<Stage, string> = { idle: '연결 대기', connecting: '서버 연결 중', waiting: '3D 준비 대기', negotiating: '영상 연결 중', playing: '실시간 연결', disconnected: '연결 종료', error: '연결 확인 필요' };
const emptyStats = { resolution: '—', fps: '—', bitrate: '—', latency: '—', frames: 0 };

function Icon({ name }: { name: 'arrow' | 'screen' | 'sound' | 'mute' | 'refresh' | 'link' | 'stop' }) {
  const paths = { arrow: 'M5 12h14m-6-6 6 6-6 6', screen: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5', sound: 'm11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14', mute: 'm11 5-6 4H2v6h3l6 4V5Zm5 4 5 6m0-6-5 6', refresh: 'M20 7v5h-5m4-1a7 7 0 1 0-1 7M20 4v3', link: 'm10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 2 2-2a4 4 0 0 0-6-6L6 5', stop: 'M6 6h12v12H6z' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function App() {
  const parent = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const current = useRef<ViewerSession | null>(null);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [address, setAddress] = useState(initialAddress);
  const [streamer, setStreamer] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [stage, setStage] = useState<Stage>('idle');
  const [message, setMessage] = useState('시그널링 서버 주소를 입력하고 연결해 주세요.');
  const [stats, setStats] = useState(emptyStats);
  const [muted, setMuted] = useState(true);
  const [playRequired, setPlayRequired] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<{ time: string; text: string }[]>([]);
  const active = ['connecting', 'waiting', 'negotiating', 'playing'].includes(stage);
  const log = useCallback((text: string) => setLogs(old => [{ time: new Date().toLocaleTimeString('ko-KR', { hour12: false }), text }, ...old].slice(0, 6)), []);

  const stop = useCallback((announce = true) => {
    ++sequence.current;
    clearTimeout(timer.current);
    const previous = current.current; current.current = null;
    previous?.dispose();
    if (announce) { setStage('disconnected'); setMessage('연결을 종료했습니다. 다시 연결할 수 있습니다.'); setStats(emptyStats); setPlayRequired(false); log('세션 종료'); }
  }, [log]);
  useEffect(() => () => stop(false), [stop]);
  useEffect(() => {
    const observer = new ResizeObserver(() => current.current?.refreshLayout());
    if (parent.current) observer.observe(parent.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setExpanded(false); }
    };
    window.addEventListener('keydown', escape, true);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape, true); };
  }, [expanded]);

  function connect(event?: FormEvent) {
    event?.preventDefault();
    let target: string;
    try { target = signalingUrl(address); }
    catch (error) { setMessage((error as Error).message); if (!current.current) setStage('error'); return; }
    stop(false);
    const token = sequence.current;
    setStats(emptyStats); setMuted(true); setPlayRequired(false); setIds([]);
    setStage('connecting'); setMessage('서버에 접속하고 있습니다.'); log('연결 요청'); rememberAddress(target);
    const live = () => sequence.current === token;
    try {
      const session = createSession(parent.current!, target, streamer);
      current.current = session;
      session.addEventListener('streamerListMessage', event => {
        if (!live()) return;
        setIds(event.data.messageStreamerList.ids);
        if (!session.peer || session.peer.connectionState !== 'connected') {
          setStage('waiting'); setMessage(event.data.messageStreamerList.ids.length ? '3D와 영상 연결을 준비하고 있습니다.' : '3D 실행을 기다리고 있습니다. 준비되면 자동으로 연결합니다.');
        }
      });
      session.addEventListener('webRtcConnecting', () => { if (live()) { setStage('negotiating'); setMessage('보안 영상 연결을 협상하고 있습니다.'); } });
      session.addEventListener('webRtcConnected', () => { if (live()) { setStage('negotiating'); setMessage('연결됐습니다. 첫 영상 프레임을 기다립니다.'); log('WebRTC 연결'); } });
      session.addEventListener('statsReceived', event => {
        if (!live()) return;
        const a = event.data.aggregatedStats, v = a.inboundVideoStats;
        if (!(v.framesDecoded > 0)) return;
        clearTimeout(timer.current);
        setStage('playing'); setMessage('화면을 클릭하면 마우스와 키보드로 3D를 조작할 수 있습니다.');
        const number = (value: number, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';
        setStats({ resolution: v.frameWidth && v.frameHeight ? `${v.frameWidth} × ${v.frameHeight}` : '—', fps: number(v.framesPerSecond), bitrate: Number.isFinite(v.bitrate) ? `${(v.bitrate / 1000).toFixed(1)} Mbps` : '—', latency: Number.isFinite(a.candidatePair.currentRoundTripTime) ? `${number(a.candidatePair.currentRoundTripTime * 1000)} ms` : '—', frames: v.framesDecoded });
      });
      session.addEventListener('playStreamRejected', () => { if (live()) { setPlayRequired(true); setMessage('브라우저에서 재생 허용이 필요합니다. 화면의 재생 버튼을 눌러 주세요.'); } });
      session.addEventListener('webRtcFailed', () => { if (live()) { clearTimeout(timer.current); setStage('error'); setMessage('영상 연결에 실패했습니다. 서버와 TURN 설정을 확인한 뒤 다시 연결해 주세요.'); log('영상 연결 실패'); } });
      session.addEventListener('webRtcDisconnected', () => { if (live()) { clearTimeout(timer.current); setStage('disconnected'); setStats(emptyStats); setMessage('서버와 연결이 종료됐습니다. 다시 연결해 주세요.'); log('연결 끊김'); } });
      timer.current = setTimeout(() => { if (live()) { setMessage('아직 영상이 도착하지 않았습니다. 3D 실행 상태와 시그널링·TURN 주소를 확인해 주세요.'); log('영상 수신 대기 90초 경과'); } }, 90000);
      session.connect();
    } catch (error) { stop(false); setStage('error'); setMessage(`연결을 시작하지 못했습니다: ${(error as Error).message}`); log('연결 초기화 실패'); }
  }

  function toggleMute() {
    const next = !muted;
    parent.current?.querySelectorAll('video,audio').forEach(element => { (element as HTMLMediaElement).muted = next; });
    setMuted(next);
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="./" aria-label="Pixel Link 홈"><span className="brand-mark">P<span /></span><span>PIXEL<span className="brand-light">LINK</span></span></a>
      <div className="workspace">WORKSPACE <span>/</span> 원격 3D 뷰어</div>
      <div className="engine-tag"><span className="tiny-dot" /> UNREAL ENGINE <b>5.3</b></div>
    </header>
    <main>
      <div className="page-title"><div><p className="eyebrow">YOUR WINDOW INTO UNREAL</p><h1>원격 3D 연결</h1><p className="intro">브라우저에서 연결하고, 실시간으로 경험하세요.</p></div><div className={`status-badge ${stage}`} role="status"><span />{stageLabel[stage]}</div></div>
      <div className="workspace-grid">
        <aside className="connection-panel">
          <div className="panel-heading"><span className="step">01</span><h2>접속 설정</h2><Icon name="link" /></div>
          <form onSubmit={connect}>
            <label htmlFor="server">시그널링 서버</label>
            <input id="server" name="server" value={address} onChange={e => setAddress(e.target.value)} placeholder="wss://stream.example.com" spellCheck={false} autoComplete="off" disabled={active} />
            <p className="field-note">플레이어용 WebSocket 주소를 입력하세요.</p>
            <label htmlFor="streamer">스트리머</label>
            <input id="streamer" value={streamer} onChange={e => setStreamer(e.target.value)} placeholder="자동 선택" list="streamers" disabled={active} autoComplete="off" />
            <datalist id="streamers">{ids.map(id => <option value={id} key={id} />)}</datalist>
            <p className="field-note">비워 두면 사용 가능한 스트리머에 연결합니다.</p>
            <button className="primary-button" type="submit" disabled={active}>{active ? <><span className="pulse-dot" />{stage === 'playing' ? '연결됨' : '연결 중'}</> : <>연결하기 <Icon name="arrow" /></>}</button>
          </form>
          <div className="session-actions"><button onClick={() => connect()} disabled={!current.current} title="새 세션으로 다시 연결"><Icon name="refresh" />다시 연결</button><button onClick={() => stop()} disabled={!current.current}><Icon name="stop" />연결 종료</button></div>
          <div className="divider" />
          <div className="transport-row"><span>호환 엔진</span><strong>Unreal Engine 5.3</strong></div>
          <div className="transport-row"><span>선호 코덱</span><strong>H.264</strong></div>
          <div className="transport-row"><span>전송 방식</span><strong>WebRTC <i /></strong></div>
          <div className="connection-tip"><span>↗</span><p>3D 실행이 늦어져도 기다려 주세요.<br />준비되면 같은 화면에서 연결됩니다.</p></div>
          <details className="activity"><summary>연결 기록 <span>{logs.length.toString().padStart(2, '0')}</span></summary>{logs.length ? <ol>{logs.map((entry, i) => <li key={`${entry.time}-${i}`}><time>{entry.time}</time>{entry.text}</li>)}</ol> : <p>아직 연결 기록이 없습니다.</p>}<button className="refresh-list" disabled={!current.current} onClick={() => { current.current?.requestStreamerList(); log('스트리머 목록 새로고침'); }}>스트리머 목록 새로고침</button></details>
        </aside>
        <section className="viewer-panel" aria-label="원격 3D 화면">
          <div className="viewer-header"><div><span className={`live-dot ${stage === 'playing' ? 'on' : ''}`} /><h2>라이브 뷰포트</h2></div><span className="session-type">PIXEL STREAMING</span></div>
          <div className={`viewport ${expanded ? 'expanded' : ''}`} ref={viewport}>
            <div className="video-host" ref={parent} aria-label="스트리밍 영상" />
            {stage !== 'playing' && <div className="empty-state"><div className={`viewport-symbol ${active ? 'loading' : ''}`}><svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><path d="m40 12 24 14v28L40 68 16 54V26L40 12Z" /><path d="m16 26 24 14 24-14M40 40v28M28 19l24 14v14" /></svg></div><p className="eyebrow">{stage === 'error' ? 'CONNECTION NEEDS ATTENTION' : active ? 'ESTABLISHING YOUR SESSION' : 'READY WHEN YOU ARE'}</p><h3>{active ? '3D 공간으로 연결 중입니다' : stage === 'error' ? '접속 상태를 확인해 주세요' : '다음 장면을 연결하세요'}</h3><p>{message}</p><span className="empty-meta">UNREAL ENGINE 5.3 <span>·</span> H.264 / WEBRTC</span></div>}
            {playRequired && <button className="play-overlay" onClick={() => { current.current?.play(); setPlayRequired(false); }}>▶ 영상 재생</button>}
            {expanded && <button className="exit-expanded" onClick={() => setExpanded(false)}>화면 축소 <span>Esc</span></button>}
            <span className="viewport-corner top-left" /><span className="viewport-corner bottom-right" />
          </div>
          <div className="viewer-toolbar"><p className="viewer-message" aria-live="polite">{stage === 'playing' ? <span className="tiny-dot" /> : <span className="neutral-dot" />}{message}</p><div><button onClick={toggleMute} disabled={!current.current} aria-label={muted ? '소리 켜기' : '소리 끄기'} title={muted ? '소리 켜기' : '소리 끄기'}><Icon name={muted ? 'mute' : 'sound'} /></button><button onClick={() => setExpanded(true)} aria-label="화면 확대" title="화면 확대"><Icon name="screen" /></button></div></div>
        </section>
      </div>
      <section className="metrics" aria-label="실시간 연결 통계">{[['수신 해상도', stats.resolution, 'DISPLAY'], ['프레임 속도', stats.fps === '—' ? '—' : `${stats.fps} FPS`, 'FRAMERATE'], ['수신 비트레이트', stats.bitrate, 'BITRATE'], ['왕복 지연', stats.latency, 'ROUND TRIP']].map(([title, value, english]) => <div className="metric" key={english}><p>{title}<span>{english}</span></p><strong>{value}</strong></div>)}</section>
      <footer><span><span className="footer-square" /> PIXEL LINK <span className="footer-muted">독립형 Pixel Streaming 뷰어</span></span><span>React · UE 5.3 SDK <span className="footer-muted">/</span> <span data-testid="decoded-frames">{stats.frames}</span> frames received</span></footer>
    </main>
  </div>;
}
