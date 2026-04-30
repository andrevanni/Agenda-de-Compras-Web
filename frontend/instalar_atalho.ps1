# Agenda de Compras - Instalador de Atalho
# Cria atalho na area de trabalho apontando para o portal web

$AppName = "Agenda de Compras"
$AppUrl  = "https://agenda-de-compras-api.vercel.app/portal"
$IconUrl = "https://agenda-compras-cliente.vercel.app/agenda_compras.ico"
$AppDir  = Join-Path $env:LOCALAPPDATA "AgendaCompras"
$IconPath = Join-Path $AppDir "icon.ico"
$Desk    = [Environment]::GetFolderPath("Desktop")
$Lnk     = Join-Path $Desk "$AppName.lnk"

Write-Host ""
Write-Host "  Agenda de Compras - Instalador de Atalho" -ForegroundColor Cyan
Write-Host "  ===========================================" -ForegroundColor Cyan
Write-Host ""

# Cria diretório de dados do app
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

# Baixa o ícone
Write-Host "  Baixando icone..." -NoNewline
try {
    Invoke-WebRequest -Uri $IconUrl -OutFile $IconPath -UseBasicParsing -TimeoutSec 15
    Write-Host " OK" -ForegroundColor Green
} catch {
    Write-Host " (icone padrao sera usado)" -ForegroundColor Yellow
    $IconPath = $null
}

# Detecta navegador disponível — Edge tem prioridade sobre Chrome
$Candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)

$BrowserPath = $null
foreach ($c in $Candidates) {
    if (Test-Path $c) { $BrowserPath = $c; break }
}

if (-not $BrowserPath) {
    Write-Host ""
    Write-Host "  ERRO: Microsoft Edge ou Google Chrome nao encontrado." -ForegroundColor Red
    Write-Host "  Instale um deles e execute este instalador novamente." -ForegroundColor Red
    Write-Host ""
    Read-Host "  Pressione Enter para fechar"
    exit 1
}

$BrowserName = if ($BrowserPath -match "Edge") { "Microsoft Edge" } else { "Google Chrome" }
Write-Host "  Navegador detectado: $BrowserName"

# Cria o atalho na área de trabalho
Write-Host "  Criando atalho..." -NoNewline
try {
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($Lnk)
    $sc.TargetPath   = $BrowserPath
    $sc.Arguments    = "--app=$AppUrl --no-first-run"
    $sc.Description  = "Agenda de Compras - Service Farma"
    if ($IconPath -and (Test-Path $IconPath)) {
        $sc.IconLocation = "$IconPath,0"
    }
    $sc.Save()
    Write-Host " OK" -ForegroundColor Green
} catch {
    Write-Host " ERRO" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Pressione Enter para fechar"
    exit 1
}

Write-Host ""
Write-Host "  Atalho criado com sucesso na area de trabalho!" -ForegroundColor Green
Write-Host ""
Write-Host "  Clique duas vezes em '$AppName' para abrir o sistema."
Write-Host "  Faca login com seu e-mail e a senha que acabou de criar."
Write-Host ""
Read-Host "  Pressione Enter para fechar"
