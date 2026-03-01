# Startup macro: regenerate registries once per console session.
# Wire this by uncommenting the block in User/Scripts/Macros/macros.yml.
# To force a rerun, delete User/Temp/startup_register.flag.

if exists file:User/Temp/startup_register.flag then
  echo Startup register already ran.
else
  register all
  powershell New-Item -ItemType File -Path "User/Temp/startup_register.flag" -Force | Out-Null
end
