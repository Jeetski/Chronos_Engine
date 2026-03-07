# Startup macro: run sequence sync once per console session.
# Wire this by uncommenting the block in user/Scripts/Macros/macros.yml.
# To force a rerun, delete user/Temp/startup_sequence.flag.

if exists file:user/Temp/startup_sequence.flag then
  echo Startup sequence already ran.
else
  sequence sync
  powershell New-Item -ItemType File -Path "user/Temp/startup_sequence.flag" -Force | Out-Null
end

