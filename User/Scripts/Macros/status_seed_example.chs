# Seed status from vars if set; defaults to high/good
set var desired_energy @{desired_energy:=high}
set var desired_focus @{desired_focus:=good}
status energy:@{desired_energy} focus:@{desired_focus}

