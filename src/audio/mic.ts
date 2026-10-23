// Opening the mic, shared by vocal pitch correction (src/vocal/vocal.ts) and REC MIC
// (src/audio/recorder.ts). Echo cancelling, noise suppression and auto gain are off, so both get
// the raw sound: the tuner needs the real pitch, and a recorded sample its real attack.

import type { MicStatus } from '../vocal/types';

/** The mic row text, and a longer note for Luke when something is wrong. */
export const MIC_TEXT: Record<MicStatus, [string, string]> = {
  off: ['Mic off', ''],
  asking: ['Asking for the mic…', ''],
  on: ['Mic on', ''],
  denied: ['Mic blocked', 'The mic was blocked. Allow the microphone for this site in the browser settings, then try again.'],
  nomic: ['No mic', 'No microphone was found, or another app is using it.'],
  unsupported: ['Not available', "This browser can't use the mic here."],
  error: ['Mic error', "The mic couldn't start. Try again."],
};

export function micSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia;
}

/** Asks for the mic (the browser may show its permission prompt). Throws what getUserMedia throws. */
export function openMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
}

/** What went wrong, from an error openMic() threw. */
export function micStatusOf(err: unknown): MicStatus {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'nomic';
  return 'error';
}
