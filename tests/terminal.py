"""Optional real-fzf/compiled-binary check. No Herdr server is contacted."""
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import tempfile
import termios
import time

BASE = Path(__file__).resolve().parent.parent
(BASE / ".test-tmp").mkdir(exist_ok=True)

with tempfile.TemporaryDirectory(dir=BASE / ".test-tmp") as tmp:
    base = Path(tmp)
    root = base / "Projects"
    root.mkdir()
    (root / "My Project").mkdir()
    config = base / "config"
    config.mkdir()
    (config / "config.json").write_text(json.dumps({"projectRoot": str(root)}))
    log = base / "calls.jsonl"
    mock = base / "herdr"
    mock.write_text('#!/usr/bin/env python3\nimport json, os, sys\nwith open(os.environ["CALL_LOG"], "a") as f: f.write(json.dumps(sys.argv[1:]) + "\\n")\nprint("{}")\n')
    mock.chmod(0o755)

    def run(keys):
        pid, fd = pty.fork()
        if pid == 0:
            fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 100, 0, 0))
            env = {**os.environ, "TERM": "xterm-256color", "HERDR_ENV": "1",
                   "HERDR_PLUGIN_CONFIG_DIR": str(config), "HERDR_BIN_PATH": str(mock),
                   "CALL_LOG": str(log), "FZF_DEFAULT_OPTS": "--filter=wrong --select-1",
                   "FZF_DEFAULT_OPTS_FILE": "/does/not/exist"}
            os.execve(BASE / "dist/herdr-project-switcher", ["herdr-project-switcher", "pick"], env)
        transcript = b""

        def drain(seconds):
            nonlocal transcript
            end = time.monotonic() + seconds
            while time.monotonic() < end:
                if select.select([fd], [], [], min(.05, max(0, end-time.monotonic())))[0]:
                    try:
                        chunk = os.read(fd, 65536)
                        if not chunk:
                            return
                        transcript += chunk
                    except OSError:
                        return

        try:
            drain(.6)
            for key in keys:
                os.write(fd, key)
                drain(.4)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                found, status = os.waitpid(pid, os.WNOHANG)
                if found:
                    assert os.waitstatus_to_exitcode(status) == 0, transcript[-2000:]
                    return
                drain(.1)
            raise AssertionError(f"Picker did not exit: {transcript[-2000:]!r}")
        finally:
            try:
                os.kill(pid, signal.SIGKILL)
                os.waitpid(pid, 0)
            except (ProcessLookupError, ChildProcessError):
                pass
            os.close(fd)

    run([b"\x1b"])
    run([b"New Project", b"\r", b"\x1b"])
    run([b"New Project", b"\r", b"\x1b[B", b"\r"])  # Explicit Cancel.
    assert not log.exists()
    assert sorted(p.name for p in root.iterdir()) == ["My Project"]
    run([b"My Project", b"\r"])
    run([b"My Project", b"\r"])
    run([b"New Project", b"\r", b"\r"])  # Create project is the default.
    assert (root / "New Project").is_dir()
    assert list((root / "New Project").iterdir()) == []
    calls = [json.loads(line) for line in log.read_text().splitlines()]
    assert calls == [["workspace", "create", "--cwd", str(root / name), "--focus"]
                     for name in ["My Project", "My Project", "New Project"]], calls
    print("PASS: real fzf selection, repeated workspace creation, no-match confirmation, cancellation and hostile defaults")
