#!/bin/sh
# OpenSSH supplies the prompt as its first argument. Answer only for the
# requested target, including when a ProxyJump SSH process inherits this helper.
[ "$1" = "$AXCOR_SSH_PASSWORD_PROMPT" ] || exit 1
exec /bin/cat "$AXCOR_SSH_PASSWORD_PIPE"
