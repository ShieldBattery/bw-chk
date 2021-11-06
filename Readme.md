# bw-chk

Brood war map file parsing library.

[![NPM](https://img.shields.io/npm/v/bw-chk.svg?style=flat)](https://www.npmjs.org/package/bw-chk)

[![NPM](https://nodei.co/npm/bw-chk.png)](https://www.npmjs.org/package/bw-chk)

This library only read the uncompressed `scenario.chk` files, which must be extracted
from the `.scx` or `.scm` files first.

### Features
- Map size, title, description, tileset
- UMS force layout
- Position/type/owner of units
- Sprite coordinates
- Image generation

### Notable missing features
- Map-specific player colors (The image rendering functionality has hardcoded colors)
- Locations
- Tech restrictions
- Special unit flags

See `examples/singlemap.js` for an example that uses
[scm-extrator](https://github.com/tec27/scm-extractor) to open a complete map, and
display its information. If you have bw's data files extracted to disk, it can also
generate a image of the map.

## Class: Chk
### Constructor(buffer, [options])
Parses the chk synchronously. If the buffer is not a valid chk, an exception with `name`
`ChkError` is thrown.

`options` can be used to specify encoding:

```javascript
{
  encoding: 'auto',
}
```

Setting encoding to `auto` causes the library to use a simple heuristic for determining between
Western (cp1252), Korean (cp949) and UTF-8 (utf8) encodings. If `auto` is specified, the guessed
encoding can be read from `chk.encoding`

### static Chk.createStream([callback])
A convinience function that creates a `Duplex` stream, outputting a `Chk` object. If
`callback(err, chk)` is passed, it will also be called once the `Chk` has been parsed.

### chk.size
Map size in tiles `[width, height]`

### chk.title
Map title

### chk.description
Map description

### chk.tileset
Map tileset as a integer.

### chk.tilesetName
Map tileset as a human-friendly string. This does *not* correspond 1:1 to the tileset data
file names.

### chk.forces
The force layout. Only relevant in UMS games. It is an array of 4 forces, where each
force has the following properties:

- `name` Force name
- `flags` Raw force flags:
  - `0x1` Random start locations
  - `0x2` Start as allied
  - `0x4` Start with allied victory
  - `0x8` Start with shared vision
- `players` Array of players, or empty if the force is unused. Players have the following
  properties:
  - `id` Player id, 0-based.
  - `computer` Boolean, is the slot is owned by a computer?
    This is same as `type !== 'human'`, though the details of various non-human types
    have differences.
  - `type` Gives some idea of player's type:
    - `computer`, `human`, and `rescueable` are common ones
    - `neutral` is a computer that spawns in game, is not shown in lobby,
      and is allied to everyone
    - `unknown` is used for various odd ones which seem to behave inconsistently
  - `typeId` is the type as integer, as seen by the game.
  - `race` Race as a integer. Only `0x5` allows players to select their race in UMS games.
    - `0x0` Zerg
    - `0x1` Terran
    - `0x2` Protoss
    - `0x5` User selectable
    - `0x6` Forced random

### chk.units
Array of all units in the map. Each unit has the following properties:
- `x`, `y` are the coordinates in pixels
- `unitId` is the unit type (integer)
- `player` is the owning player (0-based, player 11 is neutral)
- `resourceAmt` is the amount of resources, or `undefined` if `unitId` is not a resource

### chk.sprites
Array of sprites/doodads/map decorations. Note that the 'Unit sprites' are part of
`chk.units`, as the game treats them almost same as 'true' units (They just get loaded
before the map is properly initialized).
Each sprite has the following properties:
- `x`, `y` are the coordinates in pixels
- `spriteId` is the sprite type (integer)

### chk.encoding()
The encoding specified in constructor, or the heuristically determined one if `'auto'` was
specified. Note that most English maps may be reported to have Korean (cp949) encoding, as
both encodings are ASCII-compatible. If the map was detected to use multiple encodings,
`'mixed'` will be returned.

### chk.maxPlayers(isUms)
Returns the amount of *human* players that can play the map. As the player limit can be
different between UMS and melee, the mode has to be specified in `isUms` parameter.

Note that even though UMS player count can also be determined from counting human players
in `chk.forces`, melee games may allow more players than there are computer and
human slots combined.

### chk.image(fileAccess, width, height, options)
Asynchronously generates a 24-bit RGB `Buffer` containing a image of the map, with
dimensions of `width` and `height`.

As this requires using bw's tileset and sprite files, it is handled by using a `fileAccess` object.
If the files have been extracted to a directory, they can be simply used with

```javascript
chk.image(Chk.fsFileAccess('path/to/root/directory'), width, height)
```

If there is a need for creating several images, using a single `fileAccess` object for all
image() calls will cache some of the file parsing work.

`options` is an object containing additional options. The currently supported options
(and their defaults) are:
```
{
  // Whether to render only units which exist in melee games: Start locations, neutral
  // resources and neutral unit sprites.
  melee: false,
  // Whether to render player start locations.
  startLocations: true,
}
```

### chk.triggers()
Returns an object which is `Iterable`, producting `Trigger` objects.
The returned object also has `size` property for retrieving total amount of triggers,
and `iterateFrom(n)` method for iterating starting from `n`th trigger.

### chk.isEudMap()
Iterates through triggers of the map, returning `true`, if any of the triggers use EUD
conditions or actions. The check is done in a way that is 100% compatible with SC:R's check,
which includes checking conditions and actions that could never be executed by the game.

### static Chk.fsFileAccess(directory)
Creates a FileAccess object, which can be passed to `chk.image()` for accessing bw's files which
have been extracted to `directory`.

### static Chk.customFileAccess(func)
Creates a FileAccess object with a custom function for reading files.

The function takes in a string containing the filename (e.g. 'unit\\terran\\marine.grp'),
and must return a promise which resolves to a `Buffer` containing the file's data.

### static Chk.actionIds()
Returns an object with constants for action ID integers. See [Constants.md](./Constants.md) for
a list of the constant names and their values.

### static Chk.conditionIds()
Returns an object with constants for condition ID integers. See [Constants.md](./Constants.md) for
a list of the constant names and their values.

## Class: Trigger
Triggers are returned by calling `chk.triggers()`.

### trigger.players()
Returns array containing player and group ids representing the players that get a copy
of this trigger.

### trigger.conditions()
Returns an object which is `Iterable`, producting `Condition` objects for the trigger.

### trigger.allConditions()
Returns an object which is `Iterable`, producting `Condition` objects for the trigger,
including any disabled conditions.

### trigger.actions()
Returns an object which is `Iterable`, producting `Action` objects for the trigger.

### trigger.allActions()
Returns an object which is `Iterable`, producting `Action` objects for the trigger,
including any disabled actions.

### trigger.rawByteView()
Returns a shared `Buffer` slice to the 2400 raw bytes of the trigger structure.
Modifying this slice will affect any other `Trigger` referring to this trigger;
none of the trigger objects in this library take private copies of the trigger bytes.

## Class: TriggerAction

### action.id()
Returns integer ID for the action type.
See `Chk.actionIds` for action ID constants.

### action.isDisabled()
Returns `true` if the action is disabled
(Game will not execute disabled actions)

Only necessary when using `trigger.allActions()`; `trigger.actions()` already filters
out any disabled actions.

### action.params()
Returns object containing parameters of the action.
Only fields that the action uses (Based on action ID) will be set.
Any of the enumeration fields can have 'Unknown' as a value if the raw bytes
contain an unexpected value.

```
{
  // Location ID used by the action. Source location for Move Unit, Issue Order.
  // Location to be searched for unit to be centered on for Move Location.
  //
  // NOTE: The index here is converted to be 0-based, even though internally in the map file the
  // value 1 refers to the first location and value 0 makes action do nothing.
  // If a map regardless has 0 for the raw location byte of a action, it becomes -1 here.
  location,
  // Destination location ID for Give Unit, Issue Order.
  // Index is converted to be 0-based as with `location`.
  destLocation,
  // Location to be moved for Move Location.
  // Index is converted to be 0-based as with `location`.
  movedLocation,
  // Text string for Display Text, Transmission, Comment.
  text,
  // Sound filename for Play Sound, Transmission.
  soundFile,
  // Time in milliseconds for Wait, Talking Portrait;
  // Sound time in milliseconds for Play Sound, Transmission.
  // Note that Countdown Timer action's time value and Transmission action's transmission time
  // modifier is not in this field, but in `amount` (and in seconds in Countdown Timer's case).
  time,
  // Player or group the action is limited to.
  player,
  // Receiving player for Give Unit.
  destPlayer,
  // Numeric amount for the action.
  amount,
  // 'Add', 'Set', 'Subtract' for any action which uses `amount`.
  modifierType,
  // Unit ID for the action.
  unitId,
  // Amount of units affected by the action. 0 for 'All Units'.
  unitAmount,
  // One of 'Move', 'Attack', 'Patrol', used by Issue Order
  unitOrder,
  // One of 'Enemy', 'Ally', 'AlliedVictory', used by Set Alliance
  allianceStatus,
  // Switch ID for Set Switch.
  switchId,
  // One of 'Set', 'Clear', 'Toggle', 'Randomize', used by Set Switch
  switchState,
  // One of 'Set', 'Clear', 'Toggle', used by Set Doodad State, Set Invincibility,
  // Leaderboard Computers.
  state,
  // One of 'Ore', 'Gas', 'OreAndGas', for actions using resources.
  resourceType,
  // One of 'Total', 'Units', 'Buildings', 'UnitsAndBuildings', 'Kills', 'Razings',
  // 'KillsAndRazings', 'Custom' for score actions.
  scoreType,
  // Bool for specifying if the text is shown when subtitles are disabled,
  // Used by Display Text, Transmission.
  alwaysDisplay,
  // 4-byte ID for an AI script. All scripts in unmodded game have IDs with meaningful
  // string representation. For example the "Expansion Terran Campaign Medium" script has
  // ID 0x544d4578, corresponding to ASCII 'TMEx'
  aiScript,
}
```

### action.rawByteView()

Returns a shared `Buffer` slice containing the 32 raw bytes of the action structure.
Modifying this slice will affect any other `TriggerAction` referring to this same action,
none of the trigger objects in this library take private copies of the trigger bytes.

## Class: TriggerCondition

### condition.id()

Returns integer ID for the condition type.
See `Chk.conditionIds` for condition ID constants.

### condition.isDisabled()

Returns `true` if the condition is disabled.
(Game skips over disabled conditions without requiring them to pass)

Only necessary when using `trigger.allConditions()`; `trigger.conditions()` already filters
out any disabled conditions.

### condition.params()

Returns object containing parameters of the condition.
Only fields that the condition uses (Based on condition ID) will not be `undefined`.
Any of the enumeration fields can have 'Unknown' as a value if the raw bytes
contain an unexpected value.

```
{
  // Location ID used by the condition. 1-based index, 0 here makes conditions always fail.
  //
  // NOTE: The index here is converted to be 0-based, even though internally in the map file the
  // value 1 refers to the first location and value 0 makes condition always fail.
  // If a map regardless has 0 for the raw location byte of a action, it becomes -1 here.
  location,
  // Player or group the condition is checking.
  player,
  // Numeric amount for the condition.
  amount,
  // 'AtLeast', 'AtMost', 'Exactly' for any condition which uses `amount`.
  comparisionType,
  // Unit ID for the condition.
  unitId,
  // Switch ID for the Switch condition.
  switchId,
  // 'Set' or 'Clear' for the Switch condition.
  switchState,
  // One of 'Ore', 'Gas', 'OreAndGas', for conditions using resources.
  resourceType,
  // One of 'Total', 'Units', 'Buildings', 'UnitsAndBuildings', 'Kills', 'Razings',
  // 'KillsAndRazings', 'Custom' for score conditions.
  scoreType,
}
```

### condition.rawByteView()

Returns a shared `Buffer` slice containing the 20 raw bytes of the condition structure.
Modifying this slice will affect any other `TriggerCondition` referring to this same condition,
none of the trigger objects in this library take private copies of the trigger bytes.

## License
MIT
