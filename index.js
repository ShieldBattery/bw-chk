'use strict';

import BufferList from 'bl'
import fs from 'fs'
import iconv from 'iconv-lite'
import SpriteGroup from './grp'
import SPRITES from './sprites.json'
import UNITS from './units.json'

// Currently read sections.
// If a section is not here, it will be ignored by getSections().
// type defines how multiple sections with same id are read.
// If section is smaller than min_size, it will be ignored, but a section
// larger than max_size will just be cut off at max_size.
// (Bw might actually be stricter with max_size and failing completely?)

// The section goes over any previous read sections,
// but leaves old data there if new data is shorter.
const SECTION_PARTIAL_OVERWRITE = 1
// The section replaces fully any previous sections.
const SECTION_FULL_OVERWRITE = 2
// The section behaves as if it just were appended at the end of a previous section.
const SECTION_APPEND = 3
const SECTION_TYPES = {
  'MTXM': { type: SECTION_PARTIAL_OVERWRITE },
  'STR\x20': { type: SECTION_PARTIAL_OVERWRITE, minSize: 2 },
  'ERA\x20': { type: SECTION_FULL_OVERWRITE, minSize: 2, maxSize: 2 },
  'FORC': { type: SECTION_FULL_OVERWRITE, maxSize: 20 },
  'OWNR': { type: SECTION_FULL_OVERWRITE, minSize: 12, maxSize: 12 },
  'SIDE': { type: SECTION_FULL_OVERWRITE, minSize: 8, maxSize: 8 },
  'SPRP': { type: SECTION_FULL_OVERWRITE, minSize: 4, maxSize: 4 },
  'DIM\x20': { type: SECTION_FULL_OVERWRITE, minSize: 4, maxSize: 4 },
  'UNIT': { type: SECTION_APPEND },
  'THG2': { type: SECTION_APPEND },
}

const UNIT_ID_RHYNADON = 89
const UNIT_ID_BENGALAAS = 90
const UNIT_ID_SCANTID = 93
const UNIT_ID_KAKARU = 94
const UNIT_ID_RAGNASAUR = 95
const UNIT_ID_URSADON = 96
const UNIT_ID_MINERAL1 = 176
const UNIT_ID_MINERAL3 = 178
const UNIT_ID_GEYSER = 188
const UNIT_ID_START_LOCATION = 214

const isResource = unitId => (unitId >= UNIT_ID_MINERAL1 && unitId <= UNIT_ID_MINERAL3) ||
  unitId === UNIT_ID_GEYSER

const isCritter = unitId => (
  unitId === UNIT_ID_RHYNADON ||
  unitId === UNIT_ID_BENGALAAS ||
  unitId === UNIT_ID_RAGNASAUR ||
  unitId === UNIT_ID_SCANTID ||
  unitId === UNIT_ID_URSADON ||
  unitId === UNIT_ID_KAKARU
)

const NEUTRAL_PLAYER = 11
// The colors are stored in tunit.pcx
const PLAYER_COLORS = [
  [0x6f, 0x17, 0x17, 0x62, 0x5e, 0xab, 0xaa, 0xa8],
  [0xa5, 0xa2, 0xa2, 0x2d, 0xa0, 0x2a, 0x29, 0x28],
  [0x9f, 0x9e, 0x9e, 0x9e, 0x9d, 0x9d, 0x9d, 0xb6],
  [0xa4, 0xa4, 0xa4, 0xa3, 0xa1, 0xa1, 0xa1, 0x5a],
  [0x9c, 0xb3, 0x1c, 0x1a, 0x15, 0x12, 0x59, 0x56],
  [0x13, 0x12, 0x12, 0x5c, 0x5c, 0x59, 0x58, 0x56],
  [0x54, 0x53, 0x51, 0x4e, 0x96, 0x92, 0x90, 0x43],
  [0x87, 0xa7, 0xa6, 0x81, 0x65, 0x61, 0x5c, 0x56],
  [0xb9, 0xb8, 0xb8, 0xb8, 0xb7, 0xb7, 0xb7, 0xb6],
  [0x88, 0x88, 0x84, 0x83, 0x81, 0x93, 0x63, 0x44],
  [0x67, 0x72, 0x83, 0x82, 0x6b, 0x19, 0x16, 0x12],
  [0x33, 0x33, 0x31, 0x31, 0x2d, 0x2d, 0xa0, 0x29],
]

const TILESET_NAMES = ['badlands', 'platform', 'install', 'ashworld', 'jungle', 'desert', 'ice',
      'twilight']
const TILESET_NICE_NAMES = ['Badlands', 'Space', 'Installation', 'Ashworld', 'Jungle', 'Desert',
      'Ice', 'Twilight']

// Handles accessing, decoding, and caching bw's files.
class FileAccess {
  constructor(cb) {
    this.read = cb
    this._tilesets = new Tilesets()
    this._sprites = new SpriteGroup(UNITS, SPRITES)
  }

  async tileset(id) {
    return await this._tilesets.tileset(id, this.read)
  }

  async unit(id) {
    return await this._sprites.unit(id, this.read)
  }

  async sprite(id) {
    return await this._sprites.sprite(id, this.read)
  }
}

class ChkError extends Error {
  constructor(desc) {
    super(desc)
    this.name = 'ChkError'
  }
}

function getSections(buf) {
  const sections = new Map()
  sections.section = function(key) {
    const result = this.get(key)
    if (result === undefined) {
      throw new ChkError(`Section ${key} does not exist`)
    }
    return result
  }

  let pos = 0
  while (pos >= 0 && buf.length - pos >= 8) {
    // Technically this is just 32-bit magic number,
    // but any valid sections have "descriptive" names.
    const sectionId = buf.toString('ascii', pos, pos + 4)
    const sectionType = SECTION_TYPES[sectionId]
    const length = buf.readInt32LE(pos + 4)
    if (sectionType !== undefined) {
      const minSize = sectionType.minSize || length
      const maxSize = sectionType.maxSize || length
      const acceptedLength = Math.min(length, maxSize)
      if (acceptedLength >= minSize) {
        const previous = sections.get(sectionId)
        let buffer = null
        if (acceptedLength < 0) {
          buffer = buf.slice(pos + 8)
        } else {
          buffer = buf.slice(pos + 8, pos + 8 + acceptedLength)
        }
        if (previous !== undefined) {
          switch (sectionType.type) {
            case SECTION_PARTIAL_OVERWRITE:
              if (previous.length > buffer.length) {
                buffer = Buffer.concat([buffer, previous.slice(buffer.length)])
              }
              break
            case SECTION_FULL_OVERWRITE:
              // Do nothing, the buffer is fine as is
              break
            case SECTION_APPEND:
              buffer = Buffer.concat([previous, buffer])
              break
            default:
              throw new Error('Not supposed to be reachable')
          }
        }
        sections.set(sectionId, buffer)
      }
    }
    pos += length + 8
  }
  return sections
}

class StrSection {
  constructor(buf) {
    this._data = buf
    if (buf.length < 2) {
      this._amount = 0
    } else {
      const maxPossibleAmt = Math.floor((buf.length - 2) / 2)
      this._amount = Math.min(buf.readUInt16LE(0), maxPossibleAmt)
    }
  }

  // String indices are 1-based.
  // 0 might be used at some parts for "no string"?
  get(index) {
    // Though bw may actually accept index 0 as well?
    if (index > this._amount || index === 0) {
      return ''
    }
    const offset = this._data.readUInt16LE(index * 2)
    if (offset >= this._data.length) {
      return ''
    }
    const end = this._data.indexOf(0, offset)
    // TODO: Support 949 as well
    return iconv.decode(this._data.slice(offset, end), 'win1252')
  }
}

export default class Chk {
  constructor(buf) {
    const sections = getSections(buf)
    this._strings = new StrSection(sections.section('STR\x20'));
    [this.title, this.description] = this._parseScenarioProperties(sections.section('SPRP'))
      .map(index => this._strings.get(index))
    this.tileset = this._parseTileset(sections.section('ERA\x20'))
    this.tilesetName = TILESET_NICE_NAMES[this.tileset]

    this.size = this._parseDimensions(sections.section('DIM\x20'))
    // FORC gets zero-padded if it is smaller than 14 bytes.
    // Do any other sections?
    let forceSection = sections.section('FORC')
    if (forceSection.length < 20) {
      const oldLength = forceSection.length
      forceSection = Buffer.concat([forceSection, new Buffer(20 - oldLength)])
      forceSection.fill(0, oldLength)
    }
    [this.forces, this._maxMeleePlayers] =
      this._parsePlayers(forceSection, sections.section('OWNR'), sections.section('SIDE'))
    this._tiles = sections.section('MTXM');

    [this.units, this.sprites] =
      this._parseUnits(sections.section('UNIT'), sections.section('THG2'))
  }

  maxPlayers(ums) {
    if (ums) {
      return this.forces.reduce((accum, force) => (
        accum + force.players.filter(player => !player.computer).length
      ), 0)
    } else {
      return this._maxMeleePlayers
    }
  }

  // Creates a FileAccess object, where `directory` contains bw's sprite and tileset files.
  //
  // Used for `Chk.image()`. Keeping the same object between multiple `image()` calls will
  // cache file accesses, reducing execution time.
  static fsFileAccess(directory) {
    return Chk.customFileAccess(fname => (
      new Promise((res, rej) => {
        fs.createReadStream(directory + '/' + fname.replace(/\\/g, '/'))
          .pipe(new BufferList((err, buf) => {
            if (err) {
              rej(err)
            } else {
              res(buf)
            }
          }))
      })
    ))
  }

  // Creates a FileAccess object with a custom file reading function `callback`.
  //
  // `callback` must return a `Promise`, which resolves to a `Buffer` (-like object, BufferList is
  // fine as well), containing the file.
  static customFileAccess(callback) {
    return new FileAccess(callback)
  }

  // Returns a 24-bit RGB buffer containing the image or throws an `Error`.
  //
  // `fileAccess` is created either from `Chk.fsFileAccess(directory)` or
  // `Chk.customFileAccess(callback)`.
  //
  // `options` is an object containing additional options. The currently supported options
  // (and their defaults) are:
  // ```
  // {
  //   // Whether to render only units which exist in melee games: Start locations, neutral
  //   // resources and neutral unit sprites.
  //   melee: false,
  //   // Whether to render player start locations.
  //   startLocations: true,
  // }
  // ```
  async image(fileAccess, width, height, options) {
    const opts = Object.assign({
      melee: false,
      startLocations: true,
    }, options)
    const out = Buffer.alloc(width * height * 3)
    const tileset = await fileAccess.tileset(this.tileset)
    this._renderTerrain(tileset, out, width, height)

    const mapWidthPixels = this.size[0] * 32
    const mapHeightPixels = this.size[1] * 32
    const scaleX = width / mapWidthPixels
    const scaleY = height / mapHeightPixels
    const palette = tileset.palette
    await this._renderSprites(fileAccess, palette, out, width, height, scaleX, scaleY, opts)
    return out
  }

  // Renders the terrain using hopefully-somewhat-fast method, which creates
  // low-resolution tiles and then just copies them into buffer without further scaling.
  // A drawback to this method is that the tile boundaries are easy to recognize
  // from the final image when there are large areas of flat terrain.
  _renderTerrain(tileset, out, width, height) {
    const pixelsPerMegaX = width / this.size[0]
    const pixelsPerMegaY = height / this.size[1]
    const higher = Math.max(pixelsPerMegaX, pixelsPerMegaY)
    const pixelsPerMega = Math.pow(2, Math.ceil(Math.log2(higher)))

    const scale = pixelsPerMega / 32
    const megatiles = generateScaledMegatiles(tileset, pixelsPerMega)

    let outPos = 0
    let yPos = 0
    // How many bw pixels are added for each target image pixel.
    // (Not necessarily a integer)
    const mapWidthPixels = this.size[0] * 32
    const mapHeightPixels = this.size[1] * 32
    const widthAdd = mapWidthPixels / width
    const heightAdd = mapHeightPixels / height

    const bytesPerMega = pixelsPerMega * pixelsPerMega * 3
    const bytesPerMegaRow = pixelsPerMega * 3
    let y = 0
    while (y < height) {
      const megaY = Math.floor(yPos / 32)

      // How many pixels tall is the current row of tiles.
      // Not necessarily same for all rows, if using a strange scale.
      const megaHeight = Math.ceil(((Math.floor(yPos / 32) + 1) * 32 - yPos) / heightAdd)

      const mapTilePos = megaY * this.size[0] * 2
      let xPos = 0
      let x = 0
      while (x < width) {
        const megaX = Math.floor(xPos / 32)
        const megaWidth = Math.ceil(((Math.floor(xPos / 32) + 1) * 32 - xPos) / widthAdd)

        let tileId = 0
        if (mapTilePos + megaX * 2 + 2 > this._tiles.length) {
          tileId = 0
        } else {
          tileId = this._tiles.readUInt16LE(mapTilePos + megaX * 2)
        }

        const tileGroup = tileId >> 4
        const groupIndex = tileId & 0xf
        const groupOffset = 2 + tileGroup * 0x34 + 0x12 + groupIndex * 2
        let megatileId = 0
        if (groupOffset + 2 > tileset.tilegroup.length) {
          megatileId = 0
        } else {
          megatileId = tileset.tilegroup.readUInt16LE(groupOffset)
        }
        const megaBase = megatileId * bytesPerMega

        // Draw the tile.
        let writePos = outPos + x * 3
        let currentTileY = yPos % 32
        const currentTileLeft = xPos % 32
        for (let tileY = 0; tileY < megaHeight; tileY += 1) {
          const scaledY = Math.floor(currentTileY * scale)
          const megaLineBase = megaBase + scaledY * bytesPerMegaRow

          let currentTileX = currentTileLeft
          for (let tileX = 0; tileX < megaWidth; tileX += 1) {
            const megaOffset = megaLineBase + Math.floor(currentTileX * scale) * 3
            out[writePos] = megatiles[megaOffset]
            out[writePos + 1] = megatiles[megaOffset + 1]
            out[writePos + 2] = megatiles[megaOffset + 2]
            writePos += 3
            currentTileX += widthAdd
          }
          currentTileY += heightAdd
          writePos += (width - megaWidth) * 3
        }
        x += megaWidth
        xPos += megaWidth * widthAdd
      }
      yPos += megaHeight * heightAdd
      y += megaHeight
      outPos += width * megaHeight * 3
    }
  }

  async _renderSprites(fileAccess, palette, surface, width, height, scaleX, scaleY, opts) {
    const startLocationCheck = u => u.unitId !== UNIT_ID_START_LOCATION || opts.startLocations
    const meleeCheck = u => {
      if (!opts.melee) {
        return true
      }
      if (u.sprite) {
        return u.player === NEUTRAL_PLAYER
      }
      if (u.unitId === UNIT_ID_START_LOCATION) {
        return true
      }
      if (u.player === NEUTRAL_PLAYER && (isResource(u.unitId) || isCritter(u.unitId))) {
        return true
      }
      return false
    }

    // TODO: Could order these correctly
    for (const sprite of this.sprites) {
      const grp = await fileAccess.sprite(sprite.spriteId)
      const x = sprite.x * scaleX
      const y = sprite.y * scaleY
      grp.render(0, palette, surface, x, y, width, height, scaleX, scaleY)
    }
    // Make a copy of palette to change the player colors as needed.
    const localPalette = new Buffer(palette)
    for (const unit of this.units) {
      if (!startLocationCheck(unit) || !meleeCheck(unit)) {
        continue
      }
      setToPlayerPalette(unit.player, localPalette)
      const sprite = await fileAccess.unit(unit.unitId)
      const x = unit.x * scaleX
      const y = unit.y * scaleY
      let frame = 0
      if (unit.resourceAmt !== undefined) {
        // Bw doesn't actually hardcode the frames,
        // it calls an iscript animation that sets the frame.
        if (unit.resourceAmt >= 750) {
          frame = 0
        } else if (unit.resourceAmt >= 500) {
          frame = 1
        } else if (unit.resourceAmt >= 250) {
          frame = 2
        } else {
          frame = 3
        }
      }
      // Another iscript thing.
      if (unit.unitId === UNIT_ID_GEYSER) {
        frame = this.tileset
      }
      sprite.render(frame, localPalette, surface, x, y, width, height, scaleX, scaleY)
    }
  }

  // Returns string indices [mapTitle, mapDescription]
  _parseScenarioProperties(data) {
    return [data.readUInt16LE(0), data.readUInt16LE(2)]
  }

  // Just happens to do the same thing as parseScenarioProperties
  _parseDimensions(data) {
    return [data.readUInt16LE(0), data.readUInt16LE(2)]
  }

  _parseTileset(data) {
    return data.readUInt16LE(0) & 0x7
  }

  // Respective chk sections are FORC, OWNR, SIDE.
  _parsePlayers(forceData, playerData, raceData) {
    const forces = [{}, {}, {}, {}]
    for (let i = 0; i < 4; i += 1) {
      forces[i].name = this._strings.get(forceData.readUInt16LE(8 + i * 2))
      // 0x1 = Random start loca, 0x2 = Allied, 0x4 = Allied victory, 0x8 = Shared vision.
      forces[i].flags = this._strings.get(forceData.readUInt8(16 + i))
      forces[i].players = []
    }
    let maxPlayers = 0
    for (let i = 0; i < 8; i += 1) {
      const player = this._parsePlayer(i, playerData, raceData)
      if (player !== null) {
        maxPlayers += 1
        const playerForce = forceData.readUInt8(i)
        // If player does not belong in any of the 4 forces,
        // their slot is not available in UMS games, but
        // otherwise it works fine.
        if (playerForce < 4) {
          forces[playerForce].players.push(player)
        }
      }
    }
    return [forces, maxPlayers]
  }

  // Returns null if the player is inactive.
  _parsePlayer(id, playerData, raceData) {
    if (playerData.length < id) {
      throw new ChkError(`OWNR is too short (${playerData.length})`)
    }
    if (raceData.length < id) {
      throw new ChkError(`SIDE is too short (${raceData.length})`)
    }

    const race = raceData.readUInt8(id)
    const player = {
      id,
      race,
    }
    // TODO: Not sure which players are actually inactive
    switch (playerData.readUInt8(id)) {
      // 3 is rescueable, 5 is normal computer
      case 3:
      case 5:
        player.computer = true
        return player
      case 6:
        player.computer = false
        return player
      default:
        return null
    }
  }

  _parseUnits(unitData, spriteData) {
    const units = []
    const sprites = []
    let pos = 0
    while (pos + 36 <= unitData.length) {
      const x = unitData.readUInt16LE(pos + 4)
      const y = unitData.readUInt16LE(pos + 6)
      const unitId = unitData.readUInt16LE(pos + 8)
      const player = unitData.readUInt8(pos + 16)
      if (isResource(unitId)) {
        const resourceAmt = unitData.readUInt32LE(pos + 20)
        units.push({x, y, unitId, player, resourceAmt})
      } else {
        units.push({x, y, unitId, player})
      }
      pos += 36
    }

    pos = 0
    while (pos + 10 <= spriteData.length) {
      const x = spriteData.readUInt16LE(pos + 2)
      const y = spriteData.readUInt16LE(pos + 4)
      if ((spriteData.readUInt16LE(pos + 8) & 0x1000) === 0) {
        const unitId = spriteData.readUInt16LE(pos + 0)
        const player = spriteData.readUInt8(pos + 6)
        units.push({x, y, unitId, player, sprite: true})
      } else {
        const spriteId = spriteData.readUInt16LE(pos + 0)
        sprites.push({x, y, spriteId})
      }
      pos += 10
    }
    return [units, sprites]
  }
}

class Tilesets {
  constructor() {
    this._tilesets = []
    this._incompeleteTilesets = []
  }

  async tileset(id, readCb) {
    if (id >= TILESET_NAMES.length) {
      throw Error(`Invalid tileset id: ${id}`)
    }
    const tileset = this._tilesets[id]
    if (tileset) {
      return tileset
    }

    if (!this._incompeleteTilesets[id]) {
      this._addFiles(id, readCb)
    }
    await this._incompeleteTilesets[id]
    return this._tilesets[id]
  }

  _addFiles(tilesetId, readCb) {
    const path = `tileset/${TILESET_NAMES[tilesetId]}`
    const promises = ['.cv5', '.vx4', '.vr4', '.wpe'].map(extension => readCb(path + extension))
    const promise = Promise.all(promises)
      .then(files => {
        this._incompeleteTilesets[tilesetId] = null
        this._addBuffers(tilesetId, files[0], files[1], files[2], files[3])
      })
    this._incompeleteTilesets[tilesetId] = promise
  }

  _addBuffers(tilesetId, tilegroup, megatiles, minitiles, palette) {
    this._tilesets[tilesetId] = {
      tilegroup,
      megatiles,
      minitiles,
      palette,
      scaledMegatileCache: [],
    }
  }
}

function colorAtMega(tileset, mega, x, y) {
  const miniX = Math.floor(x / 8)
  const miniY = Math.floor(y / 8)
  const colorX = Math.floor(x % 8)
  const colorY = Math.floor(y % 8)
  const mini = tileset.megatiles.readUInt16LE(mega * 0x20 + (miniY * 4 + miniX) * 2)
  const flipped = mini & 1
  const minitile = mini & 0xfffe

  let color = 0
  if (flipped) {
    color = tileset.minitiles.readUInt8(minitile * 0x20 + colorY * 8 + (7 - colorX))
  } else {
    color = tileset.minitiles.readUInt8(minitile * 0x20 + colorY * 8 + colorX)
  }
  return tileset.palette.slice(color * 4, color * 4 + 3)
}

// Creates an array of megatiles, where each megatile has 3 * pixelsPerMega bytes,
// which are interpolated from all colors by simple average (or you could call it
// specialized bilinear :p) algorithm. pixelsPerMega must be power of 2.
// Scaling upwards doesn't generate anything sensible.
function generateScaledMegatiles(tileset, pixelsPerMega) {
  const cached = tileset.scaledMegatileCache[pixelsPerMega]
  if (cached !== undefined) {
    return cached
  }
  const megatileCount = tileset.megatiles.length / 0x20
  const out = new Buffer(pixelsPerMega * pixelsPerMega * megatileCount * 3)
  let outPos = 0
  const pixelsPerScaled = 32 / pixelsPerMega
  const centeringOffset = pixelsPerScaled / 4
  for (let i = 0; i < megatileCount; i += 1) {
    let top = centeringOffset
    let bottom = pixelsPerScaled - centeringOffset
    for (let y = 0; y < pixelsPerMega; y += 1) {
      let left = centeringOffset
      let right = pixelsPerScaled - centeringOffset
      for (let x = 0; x < pixelsPerMega; x += 1) {
        const tl = colorAtMega(tileset, i, left, top)
        const tr = colorAtMega(tileset, i, right, top)
        const bl = colorAtMega(tileset, i, left, bottom)
        const br = colorAtMega(tileset, i, right, bottom)
        out[outPos + 0] = (tl[0] + tr[0] + bl[0] + br[0]) / 4
        out[outPos + 1] = (tl[1] + tr[1] + bl[1] + br[1]) / 4
        out[outPos + 2] = (tl[2] + tr[2] + bl[2] + br[2]) / 4
        outPos += 3
        left += pixelsPerScaled
        right += pixelsPerScaled
      }
      top += pixelsPerScaled
      bottom += pixelsPerScaled
    }
  }

  tileset.scaledMegatileCache[pixelsPerMega] = out
  return out
}

function setToPlayerPalette(player, palette) {
  if (player < PLAYER_COLORS.length) {
    const colors = PLAYER_COLORS[player]
    for (const entry of colors.entries()) {
      palette[(entry[0] + 0x8) * 4 + 0] = palette[entry[1] * 4 + 0]
      palette[(entry[0] + 0x8) * 4 + 1] = palette[entry[1] * 4 + 1]
      palette[(entry[0] + 0x8) * 4 + 2] = palette[entry[1] * 4 + 2]
    }
  }
}
