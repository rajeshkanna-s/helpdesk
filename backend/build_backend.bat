@echo off
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot"
set "PATH=%JAVA_HOME%\bin;D:\Kuwy-HelpDesk\tools\apache-maven-3.9.9\bin;%PATH%"
echo Compiling Kuwy HelpDesk Backend (Java 21)...
cd /d "%~dp0"
mvn clean package -DskipTests
