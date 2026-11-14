@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo Subindo o motor estatistico (porta 8000) em outra janela...
start "Earth Sleuths - API" cmd /k python -m uvicorn api.index:app --reload --port 8000
timeout /t 3 >nul
start "" http://localhost:3000
echo Subindo o front-end (porta 3000). Feche esta janela para parar.
call npm run dev
