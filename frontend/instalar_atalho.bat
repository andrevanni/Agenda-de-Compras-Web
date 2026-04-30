@echo off
chcp 65001 > nul 2>&1
cls
echo.
echo   Agenda de Compras - Instalando atalho...
echo.

set "PS_URL=https://agenda-compras-cliente.vercel.app/instalar_atalho.ps1"
set "TMP_PS=%TEMP%\ac_install_%RANDOM%.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '%PS_URL%' -OutFile '%TMP_PS%' -UseBasicParsing -TimeoutSec 30"

if exist "%TMP_PS%" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TMP_PS%"
    del "%TMP_PS%" 2>nul
) else (
    echo.
    echo   Erro ao baixar o instalador.
    echo   Verifique sua conexao com a internet e tente novamente.
    echo.
    pause
)
