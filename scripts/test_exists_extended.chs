if exists file:README.md then echo FILE_OK
if exists dir:user/Notes then echo DIR_OK
if exists env:PATH then echo ENV_OK
if exists env:__CHRONOS_FAKE then echo BAD else echo ENV_MISSING_OK

