@echo off
echo.
echo ========================================
echo   Abrindo o Farol Ads...
echo ========================================
echo.

REM Roda na pasta onde este arquivo esta
cd /d "%~dp0"

node --version >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/2] Instalando dependencias - so na primeira vez, pode levar alguns minutos...
  call npm install
  if errorlevel 1 (
    echo ERRO ao instalar dependencias.
    pause
    exit /b 1
  )
)

if not exist .env.local (
  echo Criando configuracao local - login: michele / senha: farol123
  > .env.local echo PAINEL_USUARIO=michele
  >> .env.local echo PAINEL_SENHA=farol123
  >> .env.local echo PAINEL_SEGREDO=farol-local-%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%
)

echo.
echo [2/2] Iniciando o painel...
echo ========================================
echo   Acesse: http://localhost:3100
echo   Login: veja PAINEL_USUARIO e PAINEL_SENHA no arquivo .env.local
echo   Para fechar, feche esta janela.
echo ========================================
echo.
start "" cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3100"
call npm run dev
