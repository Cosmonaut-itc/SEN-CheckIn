#!/usr/bin/env sh
set -eu

NODE_BIN="$(which -a node | grep -v '/.bun/bin/node' | head -n 1 || true)"

if [ -z "$NODE_BIN" ]; then
	echo "Could not find a Node.js binary outside Bun's shim." >&2
	exit 1
fi

exec "$NODE_BIN" "$@"
