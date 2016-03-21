# bw-chk

Brood war map file parsing library.

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
### Constructor(buffer)
Parses the chk synchronously. If the buffer is not a valid chk, an exception with `name`
`ChkError` is thrown.

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

### chk.maxPlayers(isUms)
Returns the amount of *human* players that can play the map. As the player limit can be
different between UMS and melee, the mode has to be specified in `isUms` parameter.

Note that even though UMS player count can also be determined from counting human players
in `chk.forces`, melee games may allow more players than there are computer and
human slots combined.

### chk.image(tilesets, sprites, width, height)
Asynchronously generates a 24-bit RGB `Buffer` containing a image of the map, with
dimensions of `width` and `height`.

It requires two helper classes, `Tilesets` and `SpriteGroup`, which must be initialized
with bw's data files:

## Class: Tilesets

Wraps the several tileset files in a single object.

### tilesets.init(dataDir)

Asynchronously loads all 8 tilesets used by bw, from the directory `dataDir`, which has
same layout as the .mpq files. For example, if `dataDir` is `scdata`, then there should be
`scdata/tileset/jungle.wpe`, `scdata/tileset/jungle.vx4` and so on.

This method returns a promise, which can be waited on, but it is not necessary as
`chk.image` will do it anyways if necessary.

### tilesets.addFiles(tilesetId, cv5, vx4, vr4, wpe)

Asynchronously reads the 4 tileset files from disc, and registers it to id `tilesetId`.

### tilesets.addBuffers(tilesetId, cv5, vx4, vr4, wpe)

Registers the 4 buffers to `tilesetId`. (Synchronous, does not parse anything)

## Class: SpriteGroup

Contains mapping of unit/sprite ids to .grp files used by bw.

### spriteGroup.addUnit(unitId, path) spriteGroup.addSprite(spriteId, path)

Registers a .grp sprite to unit or sprite id. If the sprite is not accessed during
`chk.image()`, it will not be loaded from disk. If there are several units/sprites
sharing the same .grp file, the file will be read only once.

The path's validity is not checked, and passing invalid paths will only cause failures
when `chk.image()` needs to render the sprite.

Unless you wish to be truly dynamic and parse the units/flingy/sprites/images.dat for the
id -> grp mapping, `examples/units.txt` and `examples/sprites.txt` have the default paths.

## License
MIT
