param([Parameter(Position=0)][string]$Task = 'dev', [Parameter(ValueFromRemainingArguments=$true)][string[]]$TaskArguments)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$runtimePath = Join-Path $workspacePath '.tools\node-v24.21.0-win-x64'
if (-not (Test-Path -LiteralPath (Join-Path $runtimePath 'node.exe'))) { throw 'Install Node 24.21.0 or download its official Windows archive into .tools/node-v24.21.0-win-x64. See README.' }
$previousPath = $env:PATH
try {
  $env:PATH = $runtimePath + ';' + $env:PATH
  Push-Location -LiteralPath $workspacePath
  & (Join-Path $runtimePath 'node.exe') (Join-Path $runtimePath 'node_modules\npm\bin\npm-cli.js') run $Task @TaskArguments
  $taskExitCode = $LASTEXITCODE
} finally { Pop-Location; $env:PATH = $previousPath }
exit $taskExitCode
