# Git's credential manager needs sh.exe, which isn't on this machine's PATH.
$env:PATH = "C:\Program Files\Git\bin;C:\Program Files\Git\usr\bin;" + $env:PATH
git push -u origin main
