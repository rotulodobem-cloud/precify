@echo off
echo Iniciando Precify...
echo.

REM Verifica se Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Python nao encontrado. Instale em https://python.org
    pause
    exit /b 1
)

REM Instala dependências Python se necessário
echo Verificando dependencias Python...
pip install flask pdfplumber --quiet

REM Inicia o parser de PDF em background
echo Iniciando parser de PDF...
start /B python python\pdf_parser.py

REM Aguarda o parser iniciar
timeout /t 2 /nobreak >nul

REM Inicia o Next.js
echo Iniciando Precify...
npm run dev
