# TimeBlocks Documentation

## Overview
TimeBlocks are flexible schedule containers that can be used in day templates.

## Types

### Buffer Block
`yaml
type: timeblock
subtype: buffer
duration: 30
absorbable: true
`
Provides overflow space when items overrun.

### Category Block
`yaml
type: timeblock
subtype: category
category: health
duration: 60
`
Prioritizes items matching the category, accepts others if empty.

### Free Block
`yaml
type: timeblock
subtype: free
duration: 60
`
Filled with due-date items or displayed as "Free Time X min".

## Anchor Items

Items with eschedule: never cannot be trimmed, cut, or moved:
`yaml
name: Work
reschedule: never
start_time: "09:00"
duration: 480
`

## Default Free Time Block
Location: User/Timeblocks/freetime.yml
- 1 hour duration
- No category
- Can be used as buffer or for missed items

## Priority-Weighted Buffer
More important items get more buffer time when items overrun.
