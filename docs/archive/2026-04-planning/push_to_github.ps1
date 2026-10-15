# push_to_github.ps1
# Initialise les 5 repos en local, cree les repos GitHub prives, et push.

$ErrorActionPreference = "Continue"
$ProgressPreference    = "SilentlyContinue"

$repos       = @("hub-core", "hub-deploy", "hub-frontend", "hub-ingest", "hub-docs")
$githubUser  = "MoKarade"
$baseDir     = $PSScriptRoot
$reposDir    = Join-Path $baseDir "repos"

Write-Host "=== Push initial vers github.com/$githubUser ===" -ForegroundColor Cyan
Write-Host ""

# Verifie gh CLI
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "[X] GitHub CLI (gh) n'est pas installe." -ForegroundColor Red
    Write-Host "    winget install GitHub.cli" -ForegroundColor Yellow
    exit 1
}

# Verifie auth
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Pas connecte a GitHub. Lancement de gh auth login..." -ForegroundColor Yellow
    Write-Host "    Une page web va s'ouvrir." -ForegroundColor Yellow
    Write-Host "    IMPORTANT : choisis le scope 'repo' (necessaire pour creer des repos)." -ForegroundColor Yellow
    gh auth login --hostname github.com --git-protocol https --web --scopes "repo,workflow"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Echec auth GitHub" -ForegroundColor Red
        exit 1
    }
}

# Verifie scope 'repo'
$scopes = (gh auth status 2>&1) -join "`n"
if ($scopes -notmatch "repo") {
    Write-Host "[!] Le token gh n'a pas le scope 'repo'. Refresh..." -ForegroundColor Yellow
    gh auth refresh -h github.com -s repo,workflow
}

$created = 0
$failed  = @()

foreach ($repo in $repos) {
    $repoPath = Join-Path $reposDir $repo
    Write-Host ""
    Write-Host "=== $repo ===" -ForegroundColor Cyan

    if (-not (Test-Path $repoPath)) {
        Write-Host "  [X] Dossier $repoPath introuvable" -ForegroundColor Red
        $failed += $repo
        continue
    }

    Push-Location $repoPath

    try {
        # Nettoie un eventuel .git corrompu
        if (Test-Path ".git") {
            Write-Host "  [*] Suppression d'un ancien .git..." -ForegroundColor Yellow
            try { Remove-Item -Recurse -Force ".git" } catch {}
        }

        Write-Host "  [*] git init..." -ForegroundColor White
        git init -b main 2>&1 | Out-Null
        git config user.email "marc.richard4@gmail.com" 2>&1 | Out-Null
        git config user.name  "Marc" 2>&1 | Out-Null

        Write-Host "  [*] git add + commit..." -ForegroundColor White
        git add . 2>&1 | Out-Null
        git commit -m "feat: initial scaffolding" --quiet 2>&1 | Out-Null

        $description = switch ($repo) {
            "hub-core"     { "Backend FastAPI du Personal Data Hub" }
            "hub-deploy"   { "Infrastructure et docker-compose du Personal Data Hub" }
            "hub-frontend" { "UI Next.js + Tailwind du Personal Data Hub" }
            "hub-ingest"   { "Workers d'ingestion data du Personal Data Hub" }
            "hub-docs"     { "Documentation francaise du Personal Data Hub" }
            default        { "Personal Data Hub - $repo" }
        }

        Write-Host "  [*] gh repo create..." -ForegroundColor White

        # Tentative directe de creation. Si fail (repo existe), on push manuel.
        $createOut = gh repo create "$githubUser/$repo" --private --description $description --source "." --remote origin --push 2>&1
        $createCode = $LASTEXITCODE

        if ($createCode -eq 0) {
            Write-Host "  [OK] $repo cree et pousse" -ForegroundColor Green
            Write-Host "       https://github.com/$githubUser/$repo" -ForegroundColor Gray
            $created++
        }
        else {
            $errText = ($createOut | Out-String).Trim()

            if ($errText -match "already exists") {
                Write-Host "  [!] Le repo existe deja sur GitHub. Push direct..." -ForegroundColor Yellow
                git remote remove origin 2>&1 | Out-Null
                git remote add origin "https://github.com/$githubUser/$repo.git" 2>&1 | Out-Null
                git push -u origin main --force 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  [OK] $repo pousse" -ForegroundColor Green
                    Write-Host "       https://github.com/$githubUser/$repo" -ForegroundColor Gray
                    $created++
                } else {
                    Write-Host "  [X] Push echoue sur $repo" -ForegroundColor Red
                    $failed += $repo
                }
            }
            else {
                Write-Host "  [X] Erreur de creation :" -ForegroundColor Red
                Write-Host $errText -ForegroundColor DarkRed
                $failed += $repo
            }
        }
    }
    catch {
        Write-Host "  [X] Exception sur $repo : $_" -ForegroundColor Red
        $failed += $repo
    }
    finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Termine. $created/$($repos.Count) repo(s) pousses." -ForegroundColor Cyan
if ($failed.Count -gt 0) {
    Write-Host " Echecs : $($failed -join ', ')" -ForegroundColor Red
}
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
$url = "https://github.com/" + $githubUser + "?tab=repositories"
Write-Host "Verifie ici : $url" -ForegroundColor White
Write-Host ""
Write-Host "Prochaine etape : clone hors OneDrive et lance la stack" -ForegroundColor Cyan
Write-Host "  mkdir C:\hub" -ForegroundColor Gray
Write-Host "  cd C:\hub" -ForegroundColor Gray
foreach ($r in $repos) {
    Write-Host "  git clone https://github.com/$githubUser/$r.git" -ForegroundColor Gray
}
