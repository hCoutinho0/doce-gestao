@echo off
chcp 65001 >nul
title Confeitto - Publicar atualizacao
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado. Instale a versao LTS em https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)

call npm run publicar
if errorlevel 1 (
  echo.
  echo A publicacao falhou. Veja a mensagem acima.
  pause
  exit /b 1
)

echo.
pause
