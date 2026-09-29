@echo off
cd /d "%~dp0.."
opencode run --agent orchestrator --auto < .delegation\runs\prompt-v11.txt > .delegation\runs\acceptance-v11.log 2>&1
echo EXIT=%ERRORLEVEL% >> .delegation\runs\acceptance-v11.log
