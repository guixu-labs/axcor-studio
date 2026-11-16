"""Install the bundled workspace helper and serve requests over the existing SSH stream."""

import hashlib
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile

try:
    source = json.loads(sys.stdin.buffer.readline()).encode('utf-8')
    directory = Path.home() / '.local' / 'share' / 'axcor-studio' / 'helpers'
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    helper = directory / (hashlib.sha256(source).hexdigest() + '.py')
    if helper.is_symlink() or not helper.is_file() or helper.read_bytes() != source:
        staging = tempfile.NamedTemporaryFile(dir=directory, delete=False)
        temporary = Path(staging.name)
        try:
            with staging:
                staging.write(source)
            os.replace(temporary, helper)
        finally:
            temporary.unlink(missing_ok=True)
except (OSError, ValueError, AttributeError) as error:
    sys.exit(f'Could not install axcor-workspace-helper: {error}')

# Run in this interpreter so any buffered SSH input remains available.
sys.argv = [str(helper), '--stdio']
runpy.run_path(str(helper), run_name='__main__')
