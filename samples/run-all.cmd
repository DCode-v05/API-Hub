@echo off
pushd "%~dp0.."
node packages\cli\bin\cn.mjs run --openapi samples\openapi\tasks-api.yaml --sdk samples\sdk-typescript --sdk samples\sdk-python --mcp samples\mcp\tasks-tools.json -o out\all
popd
