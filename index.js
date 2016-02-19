"use strict";

import iconv from 'iconv-lite'


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
  'FORC': { type: SECTION_FULL_OVERWRITE, minSize: 20, maxSize: 20 },
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
    [this.forces, this._maxMeleePlayers] =
      this._parsePlayers(sections.section('FORC'), sections.section('OWNR'), sections.section('SIDE'))
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
