# Startup macro: run sequence sync once per console session.
# Wire this by uncommenting the block in User/Scripts/Macros/macros.yml.
# To force a rerun, delete User/Temp/startup_sequence.flag.

if exists file:User/Temp/startup_sequence.flag then
  echo Startup sequence already ran.
else
  sequence sync
  powershell New-Item -ItemType File -Path "User/Temp/startup_sequence.flag" -Force | Out-Null
end
