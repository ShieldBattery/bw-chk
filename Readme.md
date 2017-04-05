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
- Triggers (And locations/sounds/etc. related)
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
Western (cp1252) and Korean (cp949) encodings. If `auto` is specified, the guessed encoding can
be read from `chk.encoding`

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
The encoding specified in constructor, or the heuristically determined one if 'auto' was
specified. Note that most English maps may be reported to have Korean (cp949) encoding, as
both encodings are ASCII-compatible. May be extended in future to also return 'mixed', if
the map mixes both 1252 and 949.

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

### static Chk.fsFileAccess(directory)
Creates a FileAccess object, which can be passed to `chk.image()` for accessing bw's files which
have been extracted to `directory`.

### static Chk.customFileAccess(func)
Creates a FileAccess object with a custom function for reading files.

The function takes in a string containing the filename (e.g. 'unit\\terran\\marine.grp'),
and must return a promise which resolves to a `Buffer` containing the file's data.

## License
MIT
