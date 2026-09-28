@echo off
cd /d "C:\Dev\let-me-code"
opencode run --agent orchestrator --auto < "C:\Dev\let-me-code\.delegation\runs\prompt.txt" > "C:\Dev\let-me-code\.delegation\runs\acceptance.log" 2>&1
echo EXIT=%ERRORLEVEL%>> "C:\Dev\let-me-code\.delegation\runs\acceptance.log"
