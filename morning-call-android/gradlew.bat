@echo off
if exist gradle\wrapper\gradle-wrapper.jar (
  java -jar gradle\wrapper\gradle-wrapper.jar %*
  exit /b %ERRORLEVEL%
)
where gradle >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  gradle %*
  exit /b %ERRORLEVEL%
)
echo Gradle wrapper jar is not checked in and no system Gradle was found.
echo Install Gradle 9.5.1 or regenerate the wrapper with: gradle wrapper --gradle-version 9.5.1
exit /b 1
