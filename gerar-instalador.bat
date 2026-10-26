@echo off
chcp 65001 >nul
title Confeitto - Gerar instalador
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado. Instale a versao LTS em https://nodejs.org/
  pause
  exit /b 1
)

echo.
echo [1/2] Instalando dependencias (pode demorar alguns minutos na primeira vez)...
call npm install
if errorlevel 1 (
  echo.
  echo Nao foi possivel instalar as dependencias.
  pause
  exit /b 1
)

echo.
echo [2/2] Gerando o instalador do Confeitto...
call npm run desktop:instalador
if errorlevel 1 (
  echo.
  echo Falha ao gerar o instalador. Se a mensagem falar em "privilegio" ou
  echo "symbolic link", feche esta janela e rode este arquivo com o botao
  echo direito ^> "Executar como administrador".
  pause
  exit /b 1
)

echo.
echo Pronto! O instalador esta na pasta "instalador" (Confeitto-Setup.exe).
start "" "%~dp0instalador"
pause
