@echo off
REM 9amLeads - daily probate lead refresh from THIS PC's residential internet.
REM The UK Gazette blocks datacenter IPs (Render/GitHub) but allows home broadband,
REM so this is the most reliable FREE source. Run it each weekday before 9am.
REM Optionally schedule it: schtasks /create /tn "9amProbate" /tr "C:\Users\ketzm\run-probate.bat" /sc weekly /d MON,TUE,WED,THU,FRI /st 06:00
cd /d "%~dp0mission control"
node probate_daily_run.js
pause
