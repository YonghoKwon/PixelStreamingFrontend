import { PixelStreaming, Flags, NumericParameters, OptionParameters, TextParameters } from '@epicgames-ps/lib-pixelstreamingfrontend-ue5.3';
import { GuardedConfig } from './GuardedConfig';

export class ViewerSession extends PixelStreaming {
  get peer() { return this._webRtcController.peerConnectionController?.peerConnection; }

  requestStreamerList() { this._webRtcController.webSocketController.requestStreamerList(); }

  selectTarget(streamerId: string) {
    if (!streamerId) return;
    const controller = this._webRtcController;
    const handle = controller.handleStreamerListMessage.bind(controller);
    // The UE5.3 SDK otherwise selects a single streamer using the page's URL.
    // Filter discovery per session so this React form owns target selection.
    controller.handleStreamerListMessage = message => handle({
      ...message, ids: message.ids.filter(id => id === streamerId),
    });
  }

  dispose() {
    // A fresh SDK instance + fresh websocket is used for explicit reconnect.
    this.disconnect();
    this.videoElementParent.replaceChildren();
  }
}

export function createSession(parent: HTMLElement, address: string, streamerId: string): ViewerSession {
  const config = new GuardedConfig({ useUrlParams: false, initialSettings: {
    [TextParameters.SignallingServerUrl]: address,
    [OptionParameters.StreamerId]: streamerId,
    [OptionParameters.PreferredCodec]: 'H264',
    [Flags.AutoConnect]: false,
    [Flags.AutoPlayVideo]: true,
    [Flags.StartVideoMuted]: true,
    [Flags.UseMic]: false,
    [Flags.HoveringMouseMode]: true,
    [Flags.MouseInput]: true,
    [Flags.KeyboardInput]: true,
    [Flags.TouchInput]: true,
    [Flags.FakeMouseWithTouches]: true,
    [Flags.MatchViewportResolution]: false,
    [Flags.WaitForStreamer]: true,
    [Flags.AFKDetection]: false,
    [NumericParameters.MaxReconnectAttempts]: 60,
    [NumericParameters.StreamerAutoJoinInterval]: 3000,
  } });
  const streaming = new ViewerSession(config, { videoElementParent: parent });
  config.attachPeer(() => streaming.peer);
  streaming.selectTarget(streamerId);
  return streaming;
}
