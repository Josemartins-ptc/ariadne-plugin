#!/bin/sh
# Installs the outside measuring tools into .tools/, at the versions used for the report.
set -eu
cd "$(dirname "$0")"
mkdir -p .tools/bin .tools/eslint
python3 -m venv .tools/venv
.tools/venv/bin/pip install --quiet lizard==1.17.13
GOBIN="$PWD/.tools/bin" go install github.com/uudashr/gocognit/cmd/gocognit@v1.2.0
cp tools/measure.config.mjs .tools/eslint/
cd .tools/eslint
[ -f package.json ] || npm init -y >/dev/null
npm install --silent --save-exact eslint@9.39.5 eslint-plugin-sonarjs@4.2.2 @typescript-eslint/parser@8.71.2
echo "Tools ready in .tools/"
