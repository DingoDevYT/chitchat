# Tests + build must pass before anything is committed or pushed.
param([string]$Message = "Update")
$env:PATH = "C:\Program Files\Git\bin;C:\Program Files\Git\usr\bin;" + $env:PATH
$trailer = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

npm test 2>&1 | Select-String " (pass|fail) \d+$"
if ($LASTEXITCODE -ne 0) { Write-Host "TESTS FAILED - not shipping"; exit 1 }
npm run build 2>&1 | Select-String "built in|error" | Select-Object -First 3
if ($LASTEXITCODE -ne 0) { Write-Host "BUILD FAILED - not shipping"; exit 1 }

git add -A
git -c user.name="DingoDevYT" commit -q -m $Message -m $trailer
git push -u origin main 2>&1 | Select-Object -Last 1
