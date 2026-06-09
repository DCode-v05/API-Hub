@echo off
REM Run every local sample input through the full pipeline (-> out\all\<label>\).
REM Add  --github DCode-v05/Test  (PAT from .env) to include the GitHub input too.
pushd "%~dp0.."
node packages\cli\bin\cn.mjs run --openapi samples\openapi\tasks-api.yaml --sdk samples\sdk-typescript --sdk samples\sdk-python --mcp samples\mcp\tasks-tools.json -o out\all
popd
