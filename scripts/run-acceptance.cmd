@echo off
cd /d "%~dp0.."
opencode run --agent orchestrator --auto < .delegation\runs\prompt.txt > .delegation\runs\acceptance.log 2>&1
echo EXIT=%ERRORLEVEL% >> .delegation\runs\acceptance.log
