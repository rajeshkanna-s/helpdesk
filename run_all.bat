@echo off
echo ========================================================
echo  Starting Kuwy HelpDesk Full Stack Platform
echo ========================================================

echo 1. Starting Backend...
start "Kuwy HelpDesk Backend (Spring Boot)" cmd /k "cd backend && run_backend.bat"

echo 2. Starting Frontend...
start "Kuwy HelpDesk Frontend (React/Vite)" cmd /k "cd frontend && run_frontend.bat"

echo.
echo Kuwy HelpDesk is launching:
echo - Backend API:  http://localhost:8080
echo - Frontend UI:  http://localhost:5173 or http://localhost:5174
echo ========================================================

