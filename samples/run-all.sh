#!/usr/bin/env bash
# Run every local sample input through the full pipeline in ONE command (-> out/all/<label>/).
# Add `--github DCode-v05/Test` (needs a PAT in .env) to include the GitHub input too.
cd "$(dirname "$0")/.."
node packages/cli/bin/cn.mjs run \
  --openapi samples/openapi/tasks-api.yaml \
  --sdk samples/sdk-typescript \
  --sdk samples/sdk-python \
  --mcp samples/mcp/tasks-tools.json \
  -o out/all
