"""Second opinion on scripts/vocal-check.mjs, in another language and method: reads the WAVs it
wrote and measures the pitch with numpy (Hann frame, FFT zero-padded 32x, parabola on the log
magnitude). Needs only numpy.

    python scripts/vocal_check.py [dir]     (the folder vocal-check.mjs printed)
"""

import json
import os
import sys
import tempfile

import numpy as np

FRAME = 2048
PAD = 2**16


def read_wav(path):
    data = open(path, "rb").read()
    rate = int.from_bytes(data[24:28], "little")
    pos = 12
    while pos < len(data):
        cid, size = data[pos : pos + 4], int.from_bytes(data[pos + 4 : pos + 8], "little")
        if cid == b"data":
            return rate, np.frombuffer(data[pos + 8 : pos + 8 + size], dtype="<f4")
        pos += 8 + size
    raise ValueError(f"no data chunk in {path}")


def peak_hz(frame, rate, lo, hi):
    spec = np.abs(np.fft.rfft(frame * np.hanning(len(frame)), PAD))
    freqs = np.arange(len(spec)) * rate / PAD
    band = np.where((freqs >= lo) & (freqs <= hi))[0]
    k = band[np.argmax(spec[band])]
    a, b, c = np.log(spec[k - 1 : k + 2] + 1e-30)
    return (k + 0.5 * (a - c) / (a - 2 * b + c)) * rate / PAD


def track(x, rate, start, end, lo, hi, hop=256):
    out = []
    for s in range(int(start * rate), int(end * rate) - FRAME, hop):
        out.append(peak_hz(x[s : s + FRAME], rate, lo, hi))
    return np.array(out)


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), "drumpad-vocal-check")
    cases = json.load(open(os.path.join(folder, "cases.json")))
    for case in cases:
        rate, x = read_wav(os.path.join(folder, case["file"]))
        expect = case["expect"]
        if expect:
            hz = track(x, rate, case["from"], case["to"], expect * 2 ** (-250 / 1200), expect * 2 ** (250 / 1200))
            c = 1200 * np.log2(hz / expect)
            print(f"{case['file']:<36} median {np.median(c):6.2f} c   p95 |err| {np.percentile(np.abs(c), 95):5.2f} c")
        else:
            hz = track(x, rate, case["from"], case["to"], 200, 280)
            midi = 69 + 12 * np.log2(hz / 440)
            if case["file"].startswith("Vibrato"):
                c = (midi - 57) * 100
                print(f"{case['file']:<36} depth +/-{(np.percentile(c, 95) - np.percentile(c, 5)) / 2:5.1f} c")
            else:
                near = np.abs(midi - np.round(midi)) < 0.1
                notes = [int(n) for i, n in enumerate(np.round(midi[near])) if i == 0 or n != np.round(midi[near])[i - 1]]
                print(f"{case['file']:<36} {near.mean() * 100:.0f} % within 10 c of a note; notes {notes}")


main()
