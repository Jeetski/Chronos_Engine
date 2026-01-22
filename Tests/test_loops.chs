repeat count:2 then
  echo Script repeat @i
end

for n in notes then
  echo Script note @n
end

while exists note:commands_cheatsheet max:2 then
  echo Script while @i
end
