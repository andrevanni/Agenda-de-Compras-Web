@echo off
chcp 65001 > nul 2>&1
cls
echo.
echo   Agenda de Compras  -  Service Farma
echo   Instalador de Atalho para Area de Trabalho
echo   ============================================
echo.

set "URL=https://agenda-de-compras-api.vercel.app/portal"

:: Procura Edge em todos os locais possiveis
set "E1=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "E2=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "E3=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"

:: Procura Chrome em todos os locais possiveis
set "C1=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "C2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "C3=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if exist "%E1%" ( set "BROWSER=%E1%" & goto :ok )
if exist "%E2%" ( set "BROWSER=%E2%" & goto :ok )
if exist "%E3%" ( set "BROWSER=%E3%" & goto :ok )
if exist "%C1%" ( set "BROWSER=%C1%" & goto :ok )
if exist "%C2%" ( set "BROWSER=%C2%" & goto :ok )
if exist "%C3%" ( set "BROWSER=%C3%" & goto :ok )

echo   ERRO: Microsoft Edge ou Google Chrome nao encontrado.
echo.
echo   Alternativa: abra o portal no Edge, clique em "..." (tres pontos),
echo   depois em Aplicativos e "Instalar este site como aplicativo".
echo.
pause
exit /b 1

:ok
echo   Criando atalho na area de trabalho...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $sc=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Agenda de Compras.lnk'); $sc.TargetPath='%BROWSER%'; $sc.Arguments='--app=%URL% --no-first-run'; $sc.Description='Agenda de Compras - Service Farma'; $sc.Save()"

if %errorlevel% neq 0 (
    echo   Erro. Tente clicar com o botao direito no arquivo e
    echo   escolher "Executar como administrador".
    echo.
    pause
    exit /b 1
)

echo   Atalho criado com sucesso!
echo.
echo   Procure "Agenda de Compras" na area de trabalho e
echo   clique duas vezes para abrir o sistema.
echo.
pause
