@echo off
echo.
echo ========================================
echo   Atualizando o sistema Precify...
echo ========================================
echo.

REM Ir para a pasta do projeto
cd /d "%USERPROFILE%\Downloads\precify"
if errorlevel 1 (
  echo ERRO: Pasta precify nao encontrada em Downloads.
  echo Verifique se o sistema esta na pasta correta.
  pause
  exit /b 1
)

echo [1/3] Atualizando banco de dados...
call npx prisma db push --accept-data-loss
if errorlevel 1 (
  echo ERRO ao atualizar banco de dados.
  pause
  exit /b 1
)

echo.
echo [2/3] Gerando cliente do banco...
call npx prisma generate
if errorlevel 1 (
  echo ERRO ao gerar cliente.
  pause
  exit /b 1
)

echo.
echo [3/3] Iniciando o sistema...
echo.
echo ========================================
echo   Sistema atualizado com sucesso!
echo   Acesse: http://localhost:3000
echo ========================================
echo.
call npm run dev
