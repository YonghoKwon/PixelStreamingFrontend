import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OptionParameters } from '@epicgames-ps/lib-pixelstreamingfrontend-ue5.3';
import { GuardedConfig } from './GuardedConfig';
import { signalingUrl } from './connection';

beforeEach(() => {
  vi.stubGlobal('RTCRtpReceiver', { getCapabilities: () => ({ codecs: [{ mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=42e01f' }] }) });
});

function config() {
  const c = new GuardedConfig({ useUrlParams: false });
  c.setOptionSettingOptions(OptionParameters.StreamerId, ['', 'A', 'B']);
  c.setOptionSettingValue(OptionParameters.StreamerId, 'A');
  return c;
}

describe('UE5.3 SDK compatibility boundary', () => {
  it.each(['new', 'connecting', 'connected', 'disconnected'] as const)('preserves the current peer on duplicate StreamerId while %s', state => {
    const c = config(); c.attachPeer(() => ({ connectionState: state }));
    const change = vi.fn(); c._addOnOptionSettingChangedListener(OptionParameters.StreamerId, change);
    // Actual SDK discovery path: replacing options, then auto-selecting same ID.
    c.setOptionSettingOptions(OptionParameters.StreamerId, ['', 'A', 'B']);
    c.setOptionSettingValue(OptionParameters.StreamerId, 'A');
    expect(change).not.toHaveBeenCalled();
    c.setOptionSettingValue(OptionParameters.StreamerId, 'B');
    expect(change.mock.calls.at(-1)?.[0]).toBe('B');
  });
  it('still allows first selection and replacement of an unusable peer', () => {
    const c = config(); c.attachPeer(() => ({ connectionState: 'failed' }));
    const change = vi.fn(); c._addOnOptionSettingChangedListener(OptionParameters.StreamerId, change);
    c.setOptionSettingValue(OptionParameters.StreamerId, 'A');
    expect(change.mock.calls.at(-1)?.[0]).toBe('A');
  });
  it('does not forward absent codec stats into the real SettingOption.split path', () => {
    const c = config(); const previous = c.getSettingOption(OptionParameters.PreferredCodec).selected;
    for (const value of [undefined, null, '', '   ', 42]) {
      expect(() => c.setOptionSettingValue(OptionParameters.PreferredCodec, value as unknown as string)).not.toThrow();
      expect(c.getSettingOption(OptionParameters.PreferredCodec).selected).toBe(previous);
    }
    c.setOptionSettingValue(OptionParameters.PreferredCodec, 'H264');
    expect(c.getSettingOption(OptionParameters.PreferredCodec).selected).toContain('H264');
  });
});

describe('connection address', () => {
  it('supports remote paths, ports and explicit WebSocket schemes', () => {
    expect(signalingUrl(' ws://localhost:8080 ', 'http:')).toBe('ws://localhost:8080/');
    expect(signalingUrl('wss://stream.example.com/ws', 'https:')).toBe('wss://stream.example.com/ws');
  });
  it('rejects invalid and mixed-content connections before creating a session', () => {
    for (const value of ['hello', 'http://localhost:8080', 'ws://u:p@localhost:8080', 'ws://localhost:8080/#a']) expect(() => signalingUrl(value, 'http:')).toThrow();
    expect(() => signalingUrl('ws://localhost:8080', 'https:')).toThrow('wss://');
  });
});
