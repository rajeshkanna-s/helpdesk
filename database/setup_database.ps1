param(
    [string]$HostName = "localhost",
    [string]$Port = "3306",
    [string]$User = "root",
    [string]$Password = ""
)

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " Kuwy HelpDesk: Local MySQL Database Provisioner" -ForegroundColor Cyan
Write-Host " Target: $User@$HostName`:$Port" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check if Python is available to run migration
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "`nRunning Python Migration Engine..." -ForegroundColor Yellow
    python "$scriptDir\init_db.py" --host $HostName --port $Port --user $User --password $Password
} else {
    Write-Host "`nPython not found. Attempting direct mysql command-line execution..." -ForegroundColor Yellow
    if (Get-Command mysql -ErrorAction SilentlyContinue) {
        $pwdArg = if ($Password) { "-p$Password" } else { "" }
        mysql -h $HostName -P $Port -u $User $pwdArg < "$scriptDir\schema.sql"
        mysql -h $HostName -P $Port -u $User $pwdArg kuwy_helpdesk < "$scriptDir\seed-data.sql"
        Write-Host "Direct MySQL execution completed." -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Neither python (with pymysql) nor mysql CLI was found." -ForegroundColor Red
        Write-Host "Please start your MySQL server or install it via: winget install Oracle.MySQL" -ForegroundColor Yellow
    }
}
