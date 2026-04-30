@echo off
chcp 65001 > nul 2>&1
cls
echo.
echo   Agenda de Compras  ^|  Service Farma
echo   Instalador de Atalho para Area de Trabalho
echo   ============================================
echo.

set "URL=https://agenda-de-compras-api.vercel.app/portal"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%"    ( set "BROWSER=%EDGE%"    & goto :create )
if exist "%CHROME%"  ( set "BROWSER=%CHROME%"  & goto :create )
if exist "%CHROME2%" ( set "BROWSER=%CHROME2%" & goto :create )

echo   ERRO: Microsoft Edge ou Google Chrome nao encontrado.
echo   Instale um deles e execute este arquivo novamente.
echo.
pause
exit /b 1

:create
echo   Criando atalho...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell;$sc=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Agenda de Compras.lnk');$sc.TargetPath='%BROWSER%';$sc.Arguments='--app=%URL% --no-first-run';$sc.Description='Agenda de Compras - Service Farma';$sc.Save()"

if %errorlevel% neq 0 (
  echo.
  echo   Erro ao criar o atalho. Tente executar como Administrador.
  echo.
  pause
  exit /b 1
)

echo.
echo   Atalho "Agenda de Compras" criado na area de trabalho!
echo.
echo   Clique duas vezes no atalho para abrir o sistema.
echo   Faca login com seu e-mail e a senha que acabou de criar.
echo.
pause
