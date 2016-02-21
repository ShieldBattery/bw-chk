"use strict";

import iconv from 'iconv-lite'
import fs from 'fs'
import BufferList from 'bl'

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
      throw new ChkError('Section "' + key + '" does not exist')
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
        let buffer
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
    //console.log(`Section ${sectionId} @ ${pos}, len ${length}`)
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
    this.size = this._parseDimensions(sections.section('DIM\x20'));
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
    this._tiles = sections.section('MTXM')
  }

  maxPlayers(ums) {
    if (ums) {
      return this.forces.reduce((accum, force) => {
        return accum + force.players.filter(player => !player.computer).length
      }, 0)
    } else {
      return this._maxMeleePlayers
    }
  }

  // Returns a 24-bit RGB buffer containing the image or returns undefined.
  minimapImage(tilesets, width, height) {
    const tileset = tilesets._tilesets[this.tileset]
    if (!tileset) {
      return
    }

    const pixelsPerMegaX = width / this.size[0]
    const pixelsPerMegaY = height / this.size[1]
    const higher = Math.max(pixelsPerMegaX, pixelsPerMegaY)
    const pixelsPerMega = Math.pow(2, Math.ceil(Math.log2(higher)))

    const scale = pixelsPerMega / 32
    let megatiles = generateScaledMegatiles(tileset, pixelsPerMega)

    const out = Buffer(width * height * 3)
    let outPos = 0
    let yPos = 0
    const mapWidthPixels = this.size[0] * 32
    const mapHeightPixels = this.size[1] * 32
    const widthAdd = mapWidthPixels / width
    const heightAdd = mapHeightPixels / height
    for (let y = 0; y < height; y++) {
      const megaY = Math.floor(yPos / 32)
      const pixelY = Math.floor(yPos % 32)
      const scaledY = Math.floor(pixelY * scale)

      let xPos = 0
      for (let x = 0; x < width; x++) {
        const megaX = Math.floor(xPos / 32)
        const pixelX = Math.floor(xPos % 32)
        const scaledX = Math.floor(pixelX * scale)

        const maptileIndex = megaY * this.size[0] + megaX;
        let tileId
        if (maptileIndex * 2 + 2 > this._tiles.length) {
          tileId = 0
        } else {
          tileId = this._tiles.readUInt16LE(maptileIndex * 2)
        }

        const tileGroup = tileId >> 4
        const groupIndex = tileId & 0xf
        const groupOffset = 2 + tileGroup * 0x34 + 0x12 + groupIndex * 2
        let megatileId
        if (groupOffset + 2 > tileset.tilegroup.length) {
          megatileId = 0
        } else {
          megatileId = tileset.tilegroup.readUInt16LE(groupOffset)
        }

        const megaOffset = megatileId * pixelsPerMega * pixelsPerMega * 3 +
          (scaledY * pixelsPerMega + scaledX) * 3
        megatiles.copy(out, outPos, megaOffset, megaOffset + 3)
        xPos += widthAdd
        outPos += 3
      }
      yPos += heightAdd
    }
    return out
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
    for (let i = 0; i < 4; i++) {
      forces[i].name = this._strings.get(forceData.readUInt16LE(8 + i * 2))
      // 0x1 = Random start loca, 0x2 = Allied, 0x4 = Allied victory, 0x8 = Shared vision.
      forces[i].flags = this._strings.get(forceData.readUInt8(16 + i))
      forces[i].players = []
    }
    let maxPlayers = 0
    for (let i = 0; i < 8; i++) {
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
    if (playerData.length < id) throw new ChkError(`OWNR is too short (${playerData.length})`)
    if (raceData.length < id) throw new ChkError(`SIDE is too short (${raceData.length})`)

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
}

export class Tilesets {
  constructor() {
    this._tilesets = []
  }

  async addFile(tilesetId, tilegroup, megatiles, minitiles, palette) {
    const promises = [tilegroup, megatiles, minitiles, palette]
      .map(filename => new Promise((res, rej) => {
      fs.createReadStream(filename)
        .pipe(BufferList(function(err, buf) {
          if (err) {
            rej(err)
          } else {
            res(buf)
          }
      }))
    }))
    const files = await Promise.all(promises)
    this.addBuffer(tilesetId, files[0], files[1], files[2], files[3])
  }

  addBuffer(tilesetId, tilegroup, megatiles, minitiles, palette) {
    this._tilesets[tilesetId] = {
      tilegroup: tilegroup,
      megatiles: megatiles,
      minitiles: minitiles,
      palette: palette,
      scaledMegatileCache: []
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

  let color
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
  var outPos = 0
  const pixelsPerScaled = 32 / pixelsPerMega
  const centeringOffset = pixelsPerScaled / 4
  for (var i = 0; i < megatileCount; i++) {
    var top = centeringOffset
    var bottom = pixelsPerScaled - centeringOffset
    for (var y = 0; y < pixelsPerMega; y++) {
      var left = centeringOffset
      var right = pixelsPerScaled - centeringOffset
      for (var x = 0; x < pixelsPerMega; x++) {
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
