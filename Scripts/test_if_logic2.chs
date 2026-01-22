set var target:Alice
if status:energy eq high xor status:emotion eq sad then echo XOR_OK
if status:energy eq high nor status:emotion eq happy then echo NOR_FALSE else echo NOR_OK
