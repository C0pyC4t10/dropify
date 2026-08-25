@echo off
:: Launch the dev server detached so closing this window (or any window) does NOT kill it.
:: All output is redirected to startup.log / startup.err.log under the project dir.
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'C:\Bazarey2.0\Meat Delivery\_run-dev.bat' -WorkingDirectory 'C:\Bazarey2.0\Meat Delivery' -WindowStyle Hidden -RedirectStandardOutput 'C:\Bazarey2.0\Meat Delivery\startup.log' -RedirectStandardError 'C:\Bazarey2.0\Meat Delivery\startup.err.log'"
exit /b
