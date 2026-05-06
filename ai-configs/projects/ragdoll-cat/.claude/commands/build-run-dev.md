Run `.claude/scripts/build-run-dev.sh` in the background with the argument `$ARGUMENTS` (default: `edlaStagDebug`).

Steps:
1. Run the script as a background Bash command: `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" .claude/scripts/build-run-dev.sh $ARGUMENTS`
2. Report the background task ID to the user and notify when complete.
