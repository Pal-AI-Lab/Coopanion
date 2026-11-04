"""Speech-to-script worker for the biliscript World.

Subcommands, each printing one JSON object per line on stdout:

  check            installed modules, the GPU and the device each step will use, and problems found
                   on the way: {"kind": "check", ...}
  run <job.json>   download the audio, transcribe, diarize, align; ends with {"kind": "done"} or
                   {"kind": "error", "code": ..., "message": ...}. On the way: "stage", "progress",
                   "video", "device" (the device a step runs on) and "notice" (a fallback taken).
  align            reads {"words": [...], "turns": [...]} on stdin, prints {"kind": "lines", "lines": [...]}

Heavy modules (yt_dlp, faster_whisper, pyannote.audio, torch) are imported inside the step that
needs them, so `align` runs without them. Secrets arrive in the environment: HF_TOKEN for the
gated diarization model, BILISCRIPT_COOKIE as a Cookie header for bilibili.
"""

from __future__ import annotations

import importlib
import importlib.metadata
import importlib.util
import json
import os
import sys
import time
from typing import Any

SAMPLE_RATE = 16000
# A new line starts after this much silence even when the speaker stays the same.
LINE_GAP_SEC = 1.5
# A line longer than this ends at the next sentence-final punctuation.
LINE_SOFT_MAX_CHARS = 120
SENTENCE_END = tuple("。！？!?….")


def emit(kind: str, **fields: Any) -> None:
    sys.stdout.write(json.dumps({"kind": kind, **fields}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


class StepError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------- check

MODULES = {
    "yt_dlp": "yt-dlp",
    "faster_whisper": "faster-whisper",
    "pyannote.audio": "pyannote.audio",
    "torch": "torch",
}


def module_version(module: str, dist: str) -> str | None:
    if importlib.util.find_spec(module.split(".")[0]) is None:
        return None
    try:
        return importlib.metadata.version(dist)
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


def preload_torch() -> Any:
    """Imports torch when installed, before CTranslate2 loads.

    A CUDA build of torch carries cuBLAS and cuDNN and loads them into the process on import;
    CTranslate2 (faster-whisper) then finds them there instead of needing a separate CUDA install,
    which is what makes GPU transcription work on Windows with only pip packages.
    """
    try:
        import torch  # noqa: PLC0415

        return torch
    except Exception:  # noqa: BLE001 - absent or broken torch: CTranslate2 looks for CUDA on its own
        return None


def torch_cuda() -> tuple[bool, str | None]:
    """Whether torch can run a CUDA kernel, and why not when it cannot."""
    torch = preload_torch()
    if torch is None:
        return False, None
    if not torch.cuda.is_available():
        if torch.version.cuda is None:
            return False, f"torch {torch.__version__} is a CPU-only build"
        return False, None
    name = torch.cuda.get_device_name(0)
    try:
        (torch.ones(8, device="cuda") * 2).sum().item()
    except Exception as err:  # noqa: BLE001
        major, minor = torch.cuda.get_device_capability(0)
        archs = " ".join(torch.cuda.get_arch_list())
        return False, (
            f"torch {torch.__version__} cannot run on {name} (sm_{major}{minor}; built for {archs}): {err}"
        )
    return True, None


def ctranslate2_cuda_devices() -> int:
    preload_torch()
    try:
        import ctranslate2  # noqa: PLC0415

        return int(ctranslate2.get_cuda_device_count())
    except Exception:  # noqa: BLE001 - not installed, or no driver
        return 0


def nvidia_gpus() -> list[str]:
    """GPU names from nvidia-smi; empty when it is absent."""
    import subprocess  # noqa: PLC0415

    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=10, check=True,
        ).stdout
    except Exception:  # noqa: BLE001
        return []
    return [line.strip() for line in out.splitlines() if line.strip()]


def cmd_check() -> int:
    modules = {dist: module_version(module, dist) for module, dist in MODULES.items()}
    gpus = nvidia_gpus()
    asr_cuda = ctranslate2_cuda_devices() > 0
    diar_cuda, torch_problem = torch_cuda()
    problems: list[str] = []
    if gpus and not asr_cuda and modules["faster-whisper"]:
        problems.append(f"CTranslate2 does not see {gpus[0]}; speech recognition runs on the CPU")
    if gpus and torch_problem:
        problems.append(f"{torch_problem}; speaker separation runs on the CPU")
    emit(
        "check",
        python=sys.version.split()[0],
        modules=modules,
        cuda=asr_cuda or diar_cuda,
        gpu=gpus[0] if gpus else None,
        asrDevice="cuda" if asr_cuda else "cpu",
        diarizationDevice="cuda" if diar_cuda else "cpu",
        problems=problems,
    )
    return 0


def require(module: str) -> Any:
    try:
        return importlib.import_module(module)
    except ImportError as err:
        raise StepError("missing_module", f"{MODULES.get(module, module)} is not installed ({err})") from err


# ---------------------------------------------------------------- download


def download(job: dict[str, Any], out_dir: str) -> tuple[str, dict[str, Any]]:
    yt_dlp = require("yt_dlp")
    headers = {"Referer": "https://www.bilibili.com/"}
    cookie = os.environ.get("BILISCRIPT_COOKIE", "").strip()
    if cookie:
        headers["Cookie"] = cookie if "=" in cookie else f"SESSDATA={cookie}"

    def hook(d: dict[str, Any]) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                emit("progress", stage="download", done=d.get("downloaded_bytes", 0), total=total)

    opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(out_dir, "audio.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "http_headers": headers,
        "progress_hooks": [hook],
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(job["url"], download=True)
            path = ydl.prepare_filename(info)
    except Exception as err:  # noqa: BLE001 - yt-dlp raises many types; the message is what matters
        raise StepError("download", str(err)) from err
    if not os.path.exists(path):
        candidates = [f for f in os.listdir(out_dir) if f.startswith("audio.")]
        if not candidates:
            raise StepError("download", "yt-dlp reported success but wrote no audio file")
        path = os.path.join(out_dir, candidates[0])
    video = {
        "title": info.get("title") or "",
        "uploader": info.get("uploader") or "",
        "durationSec": info.get("duration"),
        "webpageUrl": info.get("webpage_url") or job["url"],
        "id": info.get("id") or "",
    }
    return path, video


# ---------------------------------------------------------------- asr


def transcribe_on(fw: Any, audio: Any, duration: float, cfg: dict[str, Any], device: str) -> tuple[list[dict[str, Any]], str]:
    compute_type = cfg.get("computeType") or ("float16" if device == "cuda" else "int8")
    model = fw.WhisperModel(cfg["model"], device=device, compute_type=compute_type)
    segments, info = model.transcribe(
        audio,
        language=cfg.get("language") or None,
        beam_size=int(cfg.get("beamSize") or 5),
        vad_filter=True,
        word_timestamps=True,
        initial_prompt=cfg.get("initialPrompt") or None,
    )
    words: list[dict[str, Any]] = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"start": float(w.start), "end": float(w.end), "text": w.word})
        emit("progress", stage="asr", done=round(float(seg.end), 1), total=round(duration, 1))
    return words, info.language


def transcribe(audio: Any, duration: float, cfg: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    """With device `auto`, uses CUDA when CTranslate2 sees a GPU and falls back to the CPU when that run fails."""
    preload_torch()
    fw = require("faster_whisper")
    requested = cfg.get("device", "auto")
    device = requested if requested in ("cuda", "cpu") else ("cuda" if ctranslate2_cuda_devices() > 0 else "cpu")
    emit("device", stage="asr", device=device)
    try:
        return transcribe_on(fw, audio, duration, cfg, device)
    except Exception as err:  # noqa: BLE001
        if device != "cuda" or requested == "cuda":
            raise StepError("asr", f"{type(err).__name__}: {err}") from err
        emit("notice", stage="asr", message=f"GPU transcription failed ({type(err).__name__}: {err}); ran on the CPU")
        emit("device", stage="asr", device="cpu")
        try:
            return transcribe_on(fw, audio, duration, cfg, "cpu")
        except Exception as cpu_err:  # noqa: BLE001
            raise StepError("asr", f"{type(cpu_err).__name__}: {cpu_err}") from cpu_err


# ---------------------------------------------------------------- diarization


def diarize(audio: Any, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """With device `auto`, uses CUDA when torch can run on the GPU and falls back to the CPU when that run fails."""
    torch = require("torch")
    pyannote_audio = require("pyannote.audio")
    token = os.environ.get("HF_TOKEN", "").strip() or None
    try:
        try:
            pipeline = pyannote_audio.Pipeline.from_pretrained(cfg["model"], token=token)
        except TypeError:  # pyannote.audio 3.x names the argument use_auth_token
            pipeline = pyannote_audio.Pipeline.from_pretrained(cfg["model"], use_auth_token=token)
    except Exception as err:  # noqa: BLE001
        raise StepError("diarization", f"cannot load {cfg['model']}: {type(err).__name__}: {err}") from err
    if pipeline is None:
        raise StepError(
            "diarization",
            f"cannot load {cfg['model']}: accept its terms on Hugging Face and set the access token",
        )
    requested = cfg.get("device", "auto")
    device = requested if requested in ("cuda", "cpu") else ("cuda" if torch_cuda()[0] else "cpu")
    params = {k: cfg[k] for k in ("num_speakers", "min_speakers", "max_speakers") if cfg.get(k)}
    waveform = torch.from_numpy(audio).unsqueeze(0)

    def run_on(dev: str) -> Any:
        emit("device", stage="diarization", device=dev)
        pipeline.to(torch.device(dev))
        return pipeline({"waveform": waveform, "sample_rate": SAMPLE_RATE}, **params)

    try:
        out = run_on(device)
    except Exception as err:  # noqa: BLE001
        if device != "cuda" or requested == "cuda":
            raise StepError("diarization", f"{type(err).__name__}: {err}") from err
        emit("notice", stage="diarization", message=f"GPU speaker separation failed ({type(err).__name__}: {err}); ran on the CPU")
        try:
            out = run_on("cpu")
        except Exception as cpu_err:  # noqa: BLE001
            raise StepError("diarization", f"{type(cpu_err).__name__}: {cpu_err}") from cpu_err
    # pyannote.audio 4 returns an object holding annotations; 3.x returns the annotation itself.
    annotation = (
        getattr(out, "exclusive_speaker_diarization", None)
        or getattr(out, "speaker_diarization", None)
        or out
    )
    return [
        {"start": float(turn.start), "end": float(turn.end), "speaker": str(label)}
        for turn, _, label in annotation.itertracks(yield_label=True)
    ]


# ---------------------------------------------------------------- alignment


def speaker_of(word: dict[str, Any], turns: list[dict[str, Any]], previous: str | None) -> str | None:
    """The turn overlapping the word most; else the turn nearest its midpoint within 1 s; else `previous`."""
    best, best_overlap = None, 0.0
    for t in turns:
        overlap = min(word["end"], t["end"]) - max(word["start"], t["start"])
        if overlap > best_overlap:
            best, best_overlap = t["speaker"], overlap
    if best is not None:
        return best
    mid = (word["start"] + word["end"]) / 2
    nearest, distance = None, 1.0
    for t in turns:
        d = t["start"] - mid if mid < t["start"] else mid - t["end"] if mid > t["end"] else 0.0
        if d <= distance:
            nearest, distance = t["speaker"], d
    return nearest if nearest is not None else previous


def align(words: list[dict[str, Any]], turns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group timed words into lines, one speaker per line.

    Speakers are renamed S1, S2, ... in order of first appearance. With no turns every word is S1.
    """
    labels: dict[str, str] = {}
    lines: list[dict[str, Any]] = []
    previous: str | None = None
    for w in words:
        raw = speaker_of(w, turns, previous) if turns else "_"
        raw = raw if raw is not None else "_"
        previous = raw
        speaker = labels.setdefault(raw, f"S{len(labels) + 1}")
        last = lines[-1] if lines else None
        text_so_far = last["text"].strip() if last else ""
        starts_new = (
            last is None
            or last["speaker"] != speaker
            or w["start"] - last["end"] > LINE_GAP_SEC
            or (len(text_so_far) >= LINE_SOFT_MAX_CHARS and text_so_far.endswith(SENTENCE_END))
        )
        if starts_new:
            lines.append({"start": w["start"], "end": w["end"], "speaker": speaker, "text": w["text"]})
        else:
            last["end"] = w["end"]
            last["text"] += w["text"]
    for line in lines:
        line["start"] = round(line["start"], 2)
        line["end"] = round(line["end"], 2)
        line["text"] = line["text"].strip()
    return [line for line in lines if line["text"]]


def cmd_align() -> int:
    payload = json.load(sys.stdin)
    emit("lines", lines=align(payload["words"], payload.get("turns") or []))
    return 0


# ---------------------------------------------------------------- run


def cmd_run(job_file: str) -> int:
    with open(job_file, encoding="utf-8") as f:
        job = json.load(f)
    out_dir = job["outDir"]
    os.makedirs(out_dir, exist_ok=True)
    started = time.time()
    try:
        emit("stage", stage="download")
        audio_path, video = download(job, out_dir)
        emit("video", video=video)

        emit("stage", stage="decode")
        fw_audio = require("faster_whisper.audio")
        try:
            audio = fw_audio.decode_audio(audio_path, sampling_rate=SAMPLE_RATE)
        except Exception as err:  # noqa: BLE001
            raise StepError("decode", f"{type(err).__name__}: {err}") from err
        duration = len(audio) / SAMPLE_RATE

        emit("stage", stage="asr")
        words, language = transcribe(audio, duration, job["asr"])

        turns: list[dict[str, Any]] = []
        if job["diarization"].get("enabled"):
            emit("stage", stage="diarization")
            turns = diarize(audio, job["diarization"])

        emit("stage", stage="align")
        lines = align(words, turns)
        transcript = {
            "video": video,
            "language": language,
            "durationSec": round(duration, 2),
            "asrModel": job["asr"]["model"],
            "diarizationModel": job["diarization"]["model"] if job["diarization"].get("enabled") else None,
            "speakers": sorted({line["speaker"] for line in lines}, key=lambda s: int(s[1:])),
            "lines": lines,
            "elapsedSec": round(time.time() - started, 1),
        }
        transcript_file = os.path.join(out_dir, "transcript.json")
        with open(transcript_file, "w", encoding="utf-8") as f:
            json.dump(transcript, f, ensure_ascii=False, indent=1)
        if not job.get("keepAudio"):
            os.remove(audio_path)
        emit("done", transcript=transcript_file)
        return 0
    except StepError as err:
        emit("error", code=err.code, message=str(err))
        return 1


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) >= 1 and argv[0] == "check":
        return cmd_check()
    if len(argv) >= 1 and argv[0] == "align":
        return cmd_align()
    if len(argv) >= 2 and argv[0] == "run":
        return cmd_run(argv[1])
    sys.stderr.write("usage: biliscript_worker.py check | run <job.json> | align\n")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
