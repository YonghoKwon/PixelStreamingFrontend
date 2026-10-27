import { Config, OptionParameters } from '@epicgames-ps/lib-pixelstreamingfrontend-ue5.3';

type OptionId = Parameters<Config['setOptionSettingValue']>[0];
type Peer = Pick<RTCPeerConnection, 'connectionState'>;

/** Compatibility boundary for the pinned UE5.3 SDK 1.0.9; no global/prototype patch. */
export class GuardedConfig extends Config {
  private readPeer?: () => Peer | undefined;

  attachPeer(readPeer: () => Peer | undefined) { this.readPeer = readPeer; }

  override setOptionSettingValue(id: OptionId, value: string): void {
    // generateStats can emit undefined before the negotiated codec appears.
    if (typeof value !== 'string' || (id === OptionParameters.PreferredCodec && !value.trim())) return;
    const peer = this.readPeer?.();
    if (id === OptionParameters.StreamerId && value && peer &&
        !['closed', 'failed'].includes(peer.connectionState) &&
        value === this.getSettingOption(id).selected) return;
    super.setOptionSettingValue(id, value);
  }
}
