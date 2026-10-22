// Hands a file to Luke: the share sheet where the browser offers one for files (Android Chrome),
// otherwise a normal download (PC). Call it straight from a tap: the share sheet needs one.

export type Delivered = 'shared' | 'downloaded' | 'cancelled';

export async function deliver(blob: Blob, name: string): Promise<Delivered> {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled'; // closed the share sheet
      console.warn('[share] falling back to a download', err); // e.g. the tap was too long ago
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
