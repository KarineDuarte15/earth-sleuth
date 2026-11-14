@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo Baixando series reais da NASA POWER (precisa de internet)...
python scripts\fetch_nasa_cases.py
pause
