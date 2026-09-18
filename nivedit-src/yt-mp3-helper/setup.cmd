@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 goto usepython
py -3 setup.py
goto finish
:usepython
python setup.py
:finish
if errorlevel 1 echo Setup failed. Install Python 3.10+ from python.org, then try again.
pause
