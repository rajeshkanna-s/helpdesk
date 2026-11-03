@echo off
echo Starting Kuwy HelpDesk MySQL Server...
sc query MySQL80 >nul 2>&1
if %ERRORLEVEL% equ 0 (
    net start MySQL80
    goto :done
)
if exist "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" (
    "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --defaults-file="C:\ProgramData\MySQL\MySQL Server 8.4\my.ini" --console
    goto :done
)
if exist "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" (
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" --defaults-file="C:\ProgramData\MySQL\MySQL Server 8.0\my.ini" --console
    goto :done
)
:done
