$gh = 'C:\Program Files\GitHub CLI\gh.exe'
& $gh auth login --hostname github.com --git-protocol https --web
& $gh auth setup-git
Write-Host "`nDone! You can go back to Claude now." -ForegroundColor Green
