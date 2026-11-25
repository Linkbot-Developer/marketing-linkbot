# Daily content generation (run by the Windows scheduled task "Linkbot Marketing - Daily generation").
# Generates as many planned or rejected posts as today's free AI quota allows, then asks n8n to send the approval cards.
# Log: runner/out/daily-YYYY-MM-DD.log. Replaced by n8n on the server once the renderer is hosted.
$ErrorActionPreference = 'Continue'
$runner = Join-Path $PSScriptRoot '..\runner'
Set-Location $runner
New-Item -ItemType Directory -Force 'out' | Out-Null
$log = Join-Path 'out' ("daily-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))
"=== $(Get-Date -Format 's') daily run ===" | Out-File -Append -Encoding utf8 $log
& 'C:\Program Files\nodejs\node.exe' 'node_modules\tsx\dist\cli.mjs' 'src\cli.ts' '--daily' *>&1 | Out-File -Append -Encoding utf8 $log
"=== $(Get-Date -Format 's') exit $LASTEXITCODE ===" | Out-File -Append -Encoding utf8 $log
