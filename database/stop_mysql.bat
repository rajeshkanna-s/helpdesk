@echo off
echo Stopping Kuwy HelpDesk MySQL Server...
sc query MySQL80 >nul 2>&1
if %ERRORLEVEL% equ 0 (
    net stop MySQL80
    goto :done
)
if exist "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqladmin.exe" (
    "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqladmin.exe" -u root -proot shutdown
    goto :done
)
if exist "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqladmin.exe" (
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqladmin.exe" -u root -proot shutdown
    goto :done
)
:done
echo MySQL stopped.
