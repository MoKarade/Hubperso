# setup_everything.ps1
# Script tout-en-un pour mettre en route le Personal Data Hub.
# A LANCER DANS POWERSHELL EN ADMIN.
#
# Ce qu'il fait :
#  1. Installe les outils prerequis via winget (UAC requis)
#  2. Te demande de te logger sur GitHub (1 fois, browser)
#  3. Push les 5 repos sur github.com/MoKarade
#  4. Clone les repos dans C:\hub (hors OneDrive)
#  5. Pull les modeles Ollama (qwen 2.5 14b + nomic-embed)
#  6. Cree les .env dans C:\hub\hub-deploy
#  7. Lance la stack docker-compose
#  8. Healthcheck final
#
# Duree totale : 30-90 minutes selon ta connexion (gros download Ollama 9 GB).

$ErrorActionPreference = "Stop"
$githubUser = "MoKarade"
$srcDir = $PSScriptRoot
$reposSrc = Join-Path $srcDir "repos"
$workDir = "C:\hub"

function Write-Step($msg) {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host " $msg" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
}

function Test-Admin {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($current)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Cmd($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Install-IfMissing($cmd, $wingetId, $label) {
    if (Test-Cmd $cmd) {
        Write-Host "  [OK] $label deja installe" -ForegroundColor Green
        return
    }
    Write-Host "  [*] Installation de $label via winget..." -ForegroundColor Yellow
    winget install --id $wingetId --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [!] winget a renvoye un code d'erreur - verifier manuellement si $label est installe" -ForegroundColor Yellow
    }
}

# === ETAPE 0 - Verif admin ===
Write-Step "Etape 0/8 - Verification des droits"
if (-not (Test-Admin)) {
    Write-Host "[X] Ce script doit etre lance en PowerShell ADMIN." -ForegroundColor Red
    Write-Host "Clic droit sur PowerShell, 'Executer en tant qu'administrateur', puis relancer." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] PowerShell est lance en admin" -ForegroundColor Green

# === ETAPE 1 - Installer outils ===
Write-Step "Etape 1/8 - Installation des outils prerequis (UAC peut apparaitre)"
Install-IfMissing "git"         "Git.Git"                "Git"
Install-IfMissing "gh"          "GitHub.cli"             "GitHub CLI"
Install-IfMissing "docker"      "Docker.DockerDesktop"   "Docker Desktop"
Install-IfMissing "ollama"      "Ollama.Ollama"          "Ollama"
Install-IfMissing "cloudflared" "Cloudflare.cloudflared" "cloudflared"
Install-IfMissing "age-keygen"  "FiloSottile.age"        "age"
Install-IfMissing "sops"        "Mozilla.sops"           "sops"

# Refresh PATH pour la session courante
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# === ETAPE 2 - Auth GitHub ===
Write-Step "Etape 2/8 - Authentification GitHub"
$null = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Une page web va s'ouvrir pour te connecter a GitHub." -ForegroundColor Yellow
    Write-Host "Compte cible : $githubUser" -ForegroundColor Yellow
    gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) { Write-Host "[X] Auth GitHub echouee" -ForegroundColor Red; exit 1 }
} else {
    Write-Host "[OK] Deja connecte a GitHub" -ForegroundColor Green
}

# === ETAPE 3 - Init Git + Push ===
Write-Step "Etape 3/8 - Push des 5 repos sur github.com/$githubUser"
$repos = @("hub-core", "hub-deploy", "hub-frontend", "hub-ingest", "hub-docs")

foreach ($repo in $repos) {
    $path = Join-Path $reposSrc $repo
    if (-not (Test-Path $path)) {
        Write-Host "  [!] $repo introuvable dans $reposSrc - skip" -ForegroundColor Yellow
        continue
    }

    Push-Location $path
    try {
        Write-Host ""
        Write-Host "=== $repo ===" -ForegroundColor Cyan

        # Clean si .git corrompu
        if (Test-Path ".git") {
            Remove-Item -Recurse -Force ".git" -ErrorAction SilentlyContinue
        }

        git init -b main 2>&1 | Out-Null
        git config user.email "marc.richard4@gmail.com"
        git config user.name "Marc"
        git add . 2>&1 | Out-Null
        git commit -m "feat: initial scaffolding" 2>&1 | Out-Null

        $description = switch ($repo) {
            "hub-core"     { "Backend FastAPI du Personal Data Hub" }
            "hub-deploy"   { "Infrastructure et docker-compose du Personal Data Hub" }
            "hub-frontend" { "UI Next.js + Tailwind du Personal Data Hub" }
            "hub-ingest"   { "Workers d'ingestion data du Personal Data Hub" }
            "hub-docs"     { "Documentation francaise du Personal Data Hub" }
        }

        # Verifie si le repo existe deja
        $null = gh repo view "$githubUser/$repo" 2>&1
        if ($LASTEXITCODE -ne 0) {
            gh repo create "$githubUser/$repo" --private --description $description --source . --push
        } else {
            $null = git remote add origin "https://github.com/$githubUser/$repo.git" 2>&1
            git push -u origin main --force
        }

        Write-Host "  [OK] $repo => https://github.com/$githubUser/$repo" -ForegroundColor Green
    } catch {
        Write-Host "  [!] Erreur sur $repo : $_" -ForegroundColor Yellow
    } finally {
        Pop-Location
    }
}

# === ETAPE 4 - Clone hors OneDrive ===
Write-Step "Etape 4/8 - Clone des repos dans C:\hub (hors OneDrive)"
if (-not (Test-Path $workDir)) {
    New-Item -Path $workDir -ItemType Directory -Force | Out-Null
}
foreach ($repo in $repos) {
    $target = Join-Path $workDir $repo
    if (Test-Path $target) {
        Write-Host "  [OK] $repo deja clone" -ForegroundColor Green
        continue
    }
    git clone "https://github.com/$githubUser/$repo.git" $target
}

# === ETAPE 5 - Pull Ollama models ===
Write-Step "Etape 5/8 - Telechargement modeles Ollama (peut prendre 10-30 min, ~9 GB)"
# Wait pour Ollama soit pret si tout juste installe
Start-Sleep -Seconds 3
$models = ollama list 2>&1
if (-not ($models -match "qwen2.5:14b-instruct")) {
    ollama pull qwen2.5:14b-instruct
} else { Write-Host "  [OK] qwen2.5:14b-instruct deja present" -ForegroundColor Green }

$models = ollama list 2>&1
if (-not ($models -match "nomic-embed-text")) {
    ollama pull nomic-embed-text
} else { Write-Host "  [OK] nomic-embed-text deja present" -ForegroundColor Green }

# === ETAPE 6 - Config .env ===
Write-Step "Etape 6/8 - Configuration locale .env"
$deployPath = Join-Path $workDir "hub-deploy"
$envPath = Join-Path $deployPath ".env"
$envExample = Join-Path $deployPath ".env.example"

if (-not (Test-Path $envPath)) {
    Copy-Item $envExample $envPath
    # Genere un SECRET_KEY auto
    $secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    (Get-Content $envPath) -replace "SECRET_KEY=changeme.*", "SECRET_KEY=$secret" | Set-Content $envPath
    $pgpass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
    (Get-Content $envPath) -replace "POSTGRES_PASSWORD=.*", "POSTGRES_PASSWORD=$pgpass" | Set-Content $envPath
    Write-Host "  [OK] .env cree avec secrets aleatoires" -ForegroundColor Green
} else {
    Write-Host "  [OK] .env existe deja (pas ecrase)" -ForegroundColor Green
}

# === ETAPE 7 - Lance la stack ===
Write-Step "Etape 7/8 - Demarrage de la stack Docker"

# Verifie que Docker Desktop tourne
Write-Host "Verification que Docker Desktop est demarre..."
$dockerOk = $false
for ($i = 0; $i -lt 30; $i++) {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $dockerOk = $true; break }
    if ($i -eq 0) {
        Write-Host "  Docker Desktop semble pas demarre. Lancement..." -ForegroundColor Yellow
        Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 5
    Write-Host "  ($($i+1)/30) En attente de Docker Desktop..." -ForegroundColor Gray
}
if (-not $dockerOk) {
    Write-Host "[X] Docker Desktop ne demarre pas. Lance-le manuellement et relance le script." -ForegroundColor Red
    exit 1
}

Push-Location $deployPath
docker compose -f docker-compose.dev.yml up -d --build
Pop-Location

# === ETAPE 8 - Healthcheck ===
Write-Step "Etape 8/8 - Healthcheck"
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000/v1/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
    Write-Host "  ($($i+1)/30) Hub demarre encore..." -ForegroundColor Gray
}

if ($ok) {
    Write-Host ""
    Write-Host "*** HUB UP & RUNNING ! ***" -ForegroundColor Green
    Write-Host ""
    Write-Host "URLs locales :" -ForegroundColor Cyan
    Write-Host "  - API     : http://localhost:8000" -ForegroundColor White
    Write-Host "  - Docs    : http://localhost:8000/docs" -ForegroundColor White
    Write-Host "  - Health  : http://localhost:8000/v1/health" -ForegroundColor White
    Write-Host "  - Ready   : http://localhost:8000/v1/ready" -ForegroundColor White
    Write-Host ""
    Write-Host "Logs en live : docker compose -f $deployPath\docker-compose.dev.yml logs -f hub-core" -ForegroundColor Gray
    Write-Host "Stop : docker compose -f $deployPath\docker-compose.dev.yml down" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Prochaine etape (Phase 0 final) : configurer le tunnel Cloudflare." -ForegroundColor Cyan
    Write-Host "  Voir : C:\hub\hub-deploy\docs\SETUP.md etape 8" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "[!] Le hub a ete demarre mais le healthcheck timeout." -ForegroundColor Yellow
    Write-Host "Logs pour diagnostic :" -ForegroundColor Yellow
    Push-Location $deployPath
    docker compose -f docker-compose.dev.yml logs --tail=50 hub-core
    Pop-Location
}
