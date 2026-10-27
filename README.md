# Pixel Streaming Frontend

React + TypeScript + Vite로 만든 독립형 UE 5.3 Pixel Streaming 뷰어입니다.
`@epicgames-ps/lib-pixelstreamingfrontend-ue5.3` 공식 1.0.9 기반 IME 포크를 고정해 사용합니다.
화면과 자산은 이 저장소에서 빌드하며 Infrastructure/Frontend 또는 서버의 Public/player.js를 사용하지 않습니다.

## 실행

Node.js 22.12 이상(운영 환경과 맞추려면 24.22.1 이상)을 준비합니다.

```powershell
cd 'C:\Unreal Projects\PixelStreamingFrontend'
npm ci
npm run dev
```

`http://localhost:5173`에서 시그널링 서버의 **플레이어용** WebSocket 주소를 입력합니다.
예: `ws://localhost:8080`, `wss://stream.example.com`.
Unreal이 접속하는 streamer 포트 8888과는 다릅니다.
주소를 비워 두지 말고, 실제 사용자의 브라우저에서 접근할 수 있는 호스트를 사용합니다.
`localhost`는 각 사용자의 PC를 뜻합니다.

환경별 기본 주소는 `.env.example`을 `.env.local`로 복사해 지정할 수 있습니다.
또는 `http://localhost:5173/?ss=ws%3A%2F%2Flocalhost%3A8080` 형태로 초기 주소를 전달합니다.
연결은 화면의 버튼으로 시작합니다. 주소의 query는 저장하지 않습니다.
스트리머를 비우면 하나의 스트리머를 자동 선택하고, 여러 스트리머가 있으면 ID를 입력해 접속합니다.

## 빌드와 배포

```powershell
npm test
npm run build
npm run preview
```

빌드 결과는 `dist/`, 로컬 빌드 미리보기는 `http://localhost:4173`입니다.
`dist/`를 별도 Nginx/IIS 등의 정적 웹서버 루트에 배포합니다.
시그널링 서버에는 복사할 필요가 없습니다. `VITE_SIGNALING_URL`은 빌드 시점 값입니다.
HTTPS로 제공하는 화면에서는 `wss://` 시그널링 주소와 유효한 인증서가 필요합니다.
WebRTC의 실제 미디어 경로에는 서버 측 ICE/STUN/TURN 설정과 네트워크 접근성이 별도로 필요합니다.
이 화면은 TURN 자격증명을 임의로 하드코딩하거나 시그널링 서버의 인증을 우회하지 않습니다.

## 제공 기능

- 연결, 새 세션으로 재연결, 종료 및 스트리머 지정
- 3D 준비 대기, 자동 재생 차단 시 사용자 재생, 음소거 및 브라우저 내 화면 확대
- 마우스·키보드·터치 입력과 반응형 레이아웃
- 실제 SDK 통계 기반 해상도·FPS·수신 비트레이트·RTT·디코딩 프레임 수
- 연결 기록, 스트리머 목록 새로고침

연결 협상 성공만으로 영상 수신을 표시하지 않고, 실제 디코딩 프레임이 있을 때 실시간 상태로 바뀝니다.
미수신 통계는 임의의 숫자 대신 `—`로 표시합니다.
원격 화면 자체의 프레임 속도는 UE/GPU/인코더/네트워크 환경에 좌우됩니다.

## UE 5.3 SDK 호환성 방어

한글 입력 수정본은 `YonghoKwon/PixelStreamingFrontendLib`의 `cf9173fee88be89646385f467f173046e25fde83` 커밋입니다.
의존성은 이 커밋의 HTTPS 아카이브와 lockfile 무결성 값으로 고정해 SSH 키 없이 설치됩니다.
3D 입력칸을 클릭한 뒤 바로 입력하며, 별도 IME 포커스 버튼은 필요하지 않습니다.
표준 조합 이벤트와 입력 교체 이벤트만 오는 환경을 모두 처리합니다.
Windows 창 자동화 제약으로 실기 타이핑은 사용자 보조로 진행했고 React·기본 화면 모두 정상 입력을 확인했습니다.

이 저장소의 `src/streaming/GuardedConfig.ts`가 **SDK 인스턴스별로** 다음을 처리합니다.

1. 같은 StreamerId를 다시 선택할 때 진행 중/정상인 peer를 재생성하지 않습니다.
   늦게 도착한 streamerList가 영상 연결을 끊는 문제를 막습니다.
2. 코덱 통계가 없는 동안 undefined/빈 문자열을 PreferredCodec 선택기에 전달하지 않습니다.
   `SettingOption.selected`의 `undefined.split()` 경로를 방어합니다.

의존성 파일이나 전역 prototype은 수정하지 않습니다. v3 서버도 이 작업에서 변경하지 않습니다.
명시적 재연결은 SDK 인스턴스와 WebSocket을 새로 만들어 수행합니다.
라이브러리를 올릴 때는 이 어댑터의 실제 Config 회귀 검사와 실시간 연결 검증을 함께 실행해야 합니다.
서버가 없는 상태, 중복·지연 목록, 첫 기동, 종료, 재연결 및 스트리머 전환을 검증 대상으로 유지합니다.

검증은 기존 Linux 패키지를 사용합니다. 물리 센서, 외부 Broker, 운영 인증, 실제 SFU 경로와 성능 수용은 별도입니다.
