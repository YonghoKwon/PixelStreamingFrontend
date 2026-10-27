export function signalingUrl(value: string, pageProtocol = window.location.protocol): string {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('접속 주소를 확인해 주세요. 예: ws://서버주소:8080'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname) {
    throw new Error('ws:// 또는 wss://로 시작하는 시그널링 주소를 입력해 주세요.');
  }
  if (pageProtocol === 'https:' && url.protocol !== 'wss:') {
    throw new Error('HTTPS 화면에서는 보안 연결 주소(wss://)가 필요합니다.');
  }
  if (url.username || url.password || url.hash) {
    throw new Error('주소의 사용자 정보와 # 부분을 제거해 주세요.');
  }
  return url.href;
}

export function initialAddress(): string {
  const query = new URLSearchParams(window.location.search).get('ss');
  let saved: string | null = null;
  try { saved = localStorage.getItem('pixel-link.signaling'); } catch { /* Storage can be disabled. */ }
  return query || import.meta.env.VITE_SIGNALING_URL || saved || 'ws://localhost:8080';
}

export function rememberAddress(address: string): void {
  // Query parameters can contain short-lived credentials; do not persist them.
  if (new URL(address).search) return;
  try { localStorage.setItem('pixel-link.signaling', address); } catch { /* Optional convenience. */ }
}
