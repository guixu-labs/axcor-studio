"""Forward a Docker exec stdio stream to a TCP port inside the container."""

import os
import select
import socket
import sys
import threading
import time

target = socket.create_connection(('127.0.0.1', int(sys.argv[1])), timeout=5)
target.setblocking(True)
eof = threading.Event()


def upload():
    try:
        while chunk := os.read(0, 65536):
            target.sendall(chunk)
        target.shutdown(socket.SHUT_WR)
    except OSError:
        pass
    finally:
        eof.set()


# Upload independently so large requests and streaming responses can overlap.
threading.Thread(target=upload, daemon=True).start()
deadline = None
with target:
    while True:
        if eof.is_set() and deadline is None:
            # Bound the wait for the response after stdin closes.
            deadline = time.monotonic() + 30
        if deadline is not None and time.monotonic() >= deadline:
            break
        if not select.select([target], [], [], 1)[0]:
            continue
        chunk = target.recv(65536)
        if not chunk:
            break
        sys.stdout.buffer.write(chunk)
        sys.stdout.buffer.flush()
