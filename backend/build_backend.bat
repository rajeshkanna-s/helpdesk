@echo off
if exist "C:\Program Files\Java\jdk-21.0.12+8" (
    set "JAVA_HOME=C:\Program Files\Java\jdk-21.0.12+8"
) else if exist "C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot" (
    set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot"
)
set "PATH=%JAVA_HOME%\bin;D:\Kuwy-HelpDesk\tools\apache-maven-3.9.9\bin;%PATH%"
echo Compiling Kuwy HelpDesk Backend (Java 21)...
cd /d "%~dp0"
mvn clean package -DskipTests
