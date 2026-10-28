@echo off
title Confeitto (modo desenvolvimento)
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado. Instale a versao LTS em https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Preparando o aplicativo pela primeira vez...
  call npm install
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)
echo Modo desenvolvimento: usa o banco do .env.local
echo Abrindo o Confeitto em http://localhost:3000
start "" http://localhost:3000
call npm run dev
