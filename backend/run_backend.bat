@echo off
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot"
set "PATH=%JAVA_HOME%\bin;D:\Kuwy-HelpDesk\tools\apache-maven-3.9.9\bin;%PATH%"
echo Starting Kuwy HelpDesk Spring Boot Backend (Java 21 + MySQL 8.4)...
cd /d "%~dp0"
mvn spring-boot:run
