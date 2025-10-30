@echo off
REM Navigate to the Chronos Engine root directory
cd "C:\Users\david\Desktop\Hivemind Studio\Chronos Engine"

REM Start the Listener.py script in a new visible console window and pause on exit.
start "Chronos Listener" cmd /k "python Modules\Listener\Listener.py & pause"

exit