@echo off
chcp 65001 > nul 2>&1
cls
echo.
echo   Agenda de Compras  -  Service Farma
echo   Instalador de Atalho para Area de Trabalho
echo   ============================================
echo.

:: URL direta do portal (sem redirect para evitar demora na abertura)
set "URL=https://agenda-compras-cliente.vercel.app"

:: Destino do atalho — Desktop funciona em qualquer idioma do Windows
set "SHORTCUT=%USERPROFILE%\Desktop\Agenda de Compras.lnk"

:: Procura Edge em todos os locais possiveis
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"       ( set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"       & goto :criar )
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"  ( set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"  & goto :criar )
if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe"        ( set "BROWSER=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"        & goto :criar )

:: Procura Chrome em todos os locais possiveis
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe"         ( set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"         & goto :criar )
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"   ( set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"   & goto :criar )
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe"         ( set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"         & goto :criar )

echo   ERRO: Microsoft Edge ou Google Chrome nao encontrado.
echo.
echo   Alternativa: abra o portal no Edge, clique em "..." (tres pontos),
echo   depois em Aplicativos e "Instalar este site como aplicativo".
echo.
pause
exit /b 1

:criar
echo   Criando atalho na area de trabalho...

powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$ws=New-Object -ComObject WScript.Shell; $sc=$ws.CreateShortcut('%SHORTCUT%'); $sc.TargetPath='%BROWSER%'; $sc.Arguments='--app=%URL% --no-first-run'; $sc.Description='Agenda de Compras - Service Farma'; $sc.Save()"

if %errorlevel% neq 0 (
    echo.
    echo   Erro ao criar o atalho.
    echo   Clique com botao direito neste arquivo e escolha
    echo   "Executar como administrador".
    echo.
    pause
    exit /b 1
)

echo.
echo   ============================================
echo   Atalho criado na area de trabalho!
echo   ============================================
echo.
echo   Procure o icone "Agenda de Compras" na area
echo   de trabalho e clique duas vezes para abrir.
echo.
pause
