import iconv from 'iconv-lite'

// TODO: Does not yet handle multiple sections with same id
function getSections(buf) {
  let sections = new Map()
  let pos = 0
  while (pos >= 0 && buf.length - pos >= 8) {
    // Technically this is just 32-bit magic number,
    // but any valid sections have "descriptive" names.
    const sectionId = buf.toString('ascii', pos, pos + 4)
    const length = buf.readInt32LE(pos + 4)
    if (length < 0) {
      sections.set(sectionId, buf.slice(pos + 8))
    } else {
      sections.set(sectionId, buf.slice(pos + 8, pos + 8 + length))
    }
    pos += length + 8
  }
  if (pos != buf.length) {
    console.log('Parse error? Sections go past end of file')
  }
  return sections
}

class StrSection {
  constructor(buf) {
    this._data = buf
    if (buf.length < 2) {
      this._amount = 0
    } else {
      const maxPossibleAmt = Math.floor((buf.length - 2) / 2);
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
    this._strings = new StrSection(sections.get('STR\x20'));
    [this.title, this.description] = this._parseScenarioProperties(sections.get('SPRP'))
      .map(index => this._strings.get(index))
    this.tileset = this._parseTileset(sections.get('ERA\x20'))
    this.size = this._parseDimensions(sections.get('DIM\x20'));
    [this.forces, this._maxMeleePlayers] =
      this._parsePlayers(sections.get('FORC'), sections.get('OWNR'), sections.get('SIDE'))
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
    if (data.length < 4) return
    return [data.readUInt16LE(0), data.readUInt16LE(2)]
  }

  // Just happens to do the same thing as parseScenarioProperties
  _parseDimensions(data) {
    if (data.length < 4) return
    return [data.readUInt16LE(0), data.readUInt16LE(2)]
  }

  _parseTileset(data) {
    if (data.length < 2) return
    return data.readUInt16LE(0) & 0x7
  }

  // Respective chk sections are FORC, OWNR, SIDE.
  _parsePlayers(forceData, playerData, raceData) {
    if (forceData.length < 20) return

    let forces = [{}, {}, {}, {}]
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
    if (playerData.length < id) return
    if (raceData.length < id) return

    const race = raceData.readUInt8(id)
    let player = {
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
