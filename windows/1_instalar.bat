@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo Instalando dependencias Python (Python do PC, sem venv)...
python -m pip install -r requirements-dev.txt || goto :erro
echo Instalando dependencias do front-end...
call npm install || goto :erro
echo Pronto.
pause
exit /b 0
:erro
echo Falhou. Veja a mensagem acima.
pause
exit /b 1
