# Startup macro: regenerate registries once per console session.
# Wire this by uncommenting the block in user/Scripts/Macros/macros.yml.
# To force a rerun, delete user/temp/startup_register.flag.

if exists file:user/temp/startup_register.flag then
  echo Startup register already ran.
else
  register all
  powershell New-Item -ItemType File -Path "user/temp/startup_register.flag" -Force | Out-Null
end

