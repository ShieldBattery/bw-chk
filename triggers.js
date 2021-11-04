const conditionIds = Object.freeze({
  NONE: 0,
  COUNTDOWN_TIMER: 1,
  COMMAND: 2,
  BRING: 3,
  ACCUMULATE: 4,
  KILL: 5,
  COMMAND_MOST: 6,
  COMMAND_MOST_AT: 7,
  MOST_KILLS: 8,
  HIGHEST_SCORE: 9,
  MOST_RESOURCES: 10,
  SWITCH: 11,
  ELAPSED_TIME: 12,
  OPPONENTS: 14,
  DEATHS: 15,
  COMMAND_LEAST: 16,
  COMMAND_LEAST_AT: 17,
  LEAST_KILLS: 18,
  LOWEST_SCORE: 19,
  LEAST_RESOURCES: 20,
  SCORE: 21,
  ALWAYS: 22,
  NEVER: 23,
})

const actionIds = Object.freeze({
  NONE: 0,
  VICTORY: 1,
  DEFEAT: 2,
  PRESERVE_TRIGGER: 3,
  WAIT: 4,
  PAUSE: 5,
  UNPAUSE: 6,
  TRANSMISSION: 7,
  PLAY_WAV: 8,
  DISPLAY_TEXT: 9,
  CENTER_VIEW: 10,
  CREATE_UNIT_WITH_PROPERTIES: 11,
  SET_MISSION_OBJECTIVES: 12,
  SET_SWITCH: 13,
  SET_COUNTDOWN_TIMER: 14,
  RUN_AI_SCRIPT: 15,
  RUN_AI_SCRIPT_AT_LOCATION: 16,
  LEADERBOARD_CONTROL: 17,
  LEADERBOARD_CONTROL_AT_LOCATION: 18,
  LEADERBOARD_RESOURCES: 19,
  LEADERBOARD_KILLS: 20,
  LEADERBOARD_POINTS: 21,
  KILL_UNIT: 22,
  KILL_UNIT_AT_LOCATION: 23,
  REMOVE_UNIT: 24,
  REMOVE_UNIT_AT_LOCATION: 25,
  SET_RESOURCES: 26,
  SET_SCORE: 27,
  MINIMAP_PING: 28,
  TALKING_PORTRAIT: 29,
  MUTE_UNIT_SPEECH: 30,
  UNMUTE_UNIT_SPEECH: 31,
  LEADERBOARD_COMPUTERS: 32,
  LEADERBOARD_GOAL_CONTROL: 33,
  LEADERBOARD_GOAL_CONTROL_AT_LOCATION: 34,
  LEADERBOARD_GOAL_RESOURCES: 35,
  LEADERBOARD_GOAL_KILLS: 36,
  LEADERBOARD_GOAL_POINTS: 37,
  MOVE_LOCATION: 38,
  MOVE_UNIT: 39,
  LEADERBOARD_GREED: 40,
  SET_NEXT_SCENARIO: 41,
  SET_DOODAD_STATE: 42,
  SET_INVINCIBILITY: 43,
  CREATE_UNIT: 44,
  SET_DEATHS: 45,
  ISSUE_ORDER: 46,
  COMMENT: 47,
  GIVE_UNIT: 48,
  SET_UNIT_HP: 49,
  SET_UNIT_ENERGY: 50,
  SET_UNIT_SHIELDS: 51,
  SET_UNIT_RESOURCE: 52,
  SET_UNIT_HANGAR: 53,
  PAUSE_COUNTDOWN_TIMER: 54,
  UNPAUSE_COUNTDOWN_TIMER: 55,
  DRAW: 56,
  SET_ALLIANCE: 57,
  DISABLE_DEBUG: 58,
  ENABLE_DEBUG: 59,
})

const CONDITION_PARAM_BITS = [
  // Location 0x1, player 0x2, amount/comparision 0x4, unit 0x8,
  // switch 0x10, resource 0x20, score 0x40
  0x4, // COUNTDOWN_TIMER
  0xe, // COMMAND
  0xf, // BRING
  0x26, // ACCUMULATE
  0xe, // KILL
  0x8, // COMMAND_MOST (Most / least conditions always are "Current player", no player can be set)
  0x9, // COMMAND_MOST_AT
  0x8, // MOST_KILLS
  0x40, // HIGHEST_SCORE
  0x20, // MOST_RESOURCES
  0x10, // SWITCH
  0x4, // ELAPSED_TIME
  0x0, // MISSION_BRIEFING_ALWAYS
  0x6, // OPPONENTS
  0xe, // DEATHS
  0x8, // COMMAND_LEAST
  0x9, // COMMAND_LEAST_AT
  0x8, // LEAST_KILLS
  0x40, // LOWEST_SCORE
  0x20, // LEAST_RESOURCES
  0x46, // SCORE
]

const ACTION_PARAM_BITS = [
  // Location 0x1, dest location 0x2, player 0x4, dest player 0x8,
  // time 0x10, modifier 0x20, unit 0x40, order 0x80,
  // alliance 0x100, switch 0x200, resource 0x400, score 0x800,
  // amount (countdown time) 0x1000, amount (general) 0x2000, unit amount 0x4000,
  // ai script 0x8000, text 0x10000, sound file 0x20000, state 0x40000,
  // moved location 0x80000, always display 0x100000
  0x0, // VICTORY
  0x0, // DEFEAT
  0x0, // PRESERVE_TRIGGER
  0x10, // WAIT
  0x0, // PAUSE
  0x0, // UNPAUSE
  0x132071, // TRANSMISSION
  0x20010, // PLAY_WAV
  0x110000, // DISPLAY_TEXT
  0x1, // CENTER_VIEW
  0x4045, // CREATE_UNIT_WITH_PROPERTIES
  0x10000, // SET_MISSION_OBJECTIVES
  0x200, // SET_SWITCH
  0x1020, // SET_COUNTDOWN_TIMER
  0x8000, // RUN_AI_SCRIPT
  0x8001, // RUN_AI_SCRIPT_AT_LOCATION
  0x10040, // LEADERBOARD_CONTROL
  0x10041, // LEADERBOARD_CONTROL_AT_LOCATION
  0x10400, // LEADERBOARD_RESOURCES
  0x10040, // LEADERBOARD_KILLS
  0x10800, // LEADERBOARD_POINTS
  0x44, // KILL_UNIT
  0x4045, // KILL_UNIT_AT_LOCATION
  0x44, // REMOVE_UNIT
  0x4045, // REMOVE_UNIT_AT_LOCATION
  0x2424, // SET_RESOURCES
  0x2824, // SET_SCORE
  0x1, // MINIMAP_PING
  0x50, // TALKING_PORTRAIT
  0x0, // MUTE_UNIT_SPEECH
  0x0, // UNMUTE_UNIT_SPEECH
  0x40000, // LEADERBOARD_COMPUTERS
  0x12040, // LEADERBOARD_GOAL_CONTROL
  0x12041, // LEADERBOARD_GOAL_CONTROL_AT_LOCATION
  0x12400, // LEADERBOARD_GOAL_RESOURCES
  0x12040, // LEADERBOARD_GOAL_KILLS
  0x12800, // LEADERBOARD_GOAL_POINTS
  0x80045, // MOVE_LOCATION
  0x4047, // MOVE_UNIT
  0x2000, // LEADERBOARD_GREED
  0x10000, // SET_NEXT_SCENARIO
  0x40045, // SET_DOODAD_STATE
  0x40045, // SET_INVINCIBILITY
  0x4045, // CREATE_UNIT
  0x2064, // SET_DEATHS
  0xc7, // ISSUE_ORDER
  0x10000, // COMMENT
  0x404d, // GIVE_UNIT
  0x6045, // SET_UNIT_HP
  0x6045, // SET_UNIT_ENERGY
  0x6045, // SET_UNIT_SHIELDS
  0x6005, // SET_UNIT_RESOURCE
  0x6045, // SET_UNIT_HANGAR
  0x0, // PAUSE_COUNTDOWN_TIMER
  0x0, // UNPAUSE_COUNTDOWN_TIMER
  0x0, // DRAW
  0x104, // SET_ALLIANCE
]

const COMPARISION_TYPES = [
  'AtLeast',
  'AtMost',
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  'Exactly',
]

const MODIFIER_TYPES = [
  'Set',
  'Add',
  'Subtract',
]

const UNIT_ORDERS = [
  'Move',
  'Patrol',
  'Attack',
]

const ALLIANCE_STATES = [
  'Enemy',
  'Ally',
  'AlliedVictory',
]

const CONDITION_SWITCH_STATES = [
  'Set',
  'Clear',
]

const ACTION_SWITCH_STATES = [
  'Set',
  'Clear',
  'Toggle',
  undefined,
  undefined,
  undefined,
  undefined,
  'Randomize',
]

const ACTION_STATES = [
  'Set',
  'Clear',
  'Toggle',
]

const RESOURCE_TYPES = [
  'Ore',
  'Gas',
  'OreAndGas',
]

const SCORE_TYPES = [
  'Total',
  'Units',
  'Buildings',
  'UnitsAndBuildings',
  'Kills',
  'Razings',
  'KillsAndRazings',
  'Custom',
]

class Triggers {
  constructor(strings, buffer) {
    this._buffer = buffer
    this._strings = strings
  }

  [Symbol.iterator]() {
    return this.iterateFrom(0)
  }

  iterateFrom(pos) {
    return new TriggerIterator(this._strings, this._buffer, pos * 2400)
  }

  get size() {
    return this._buffer.length / 2400
  }
}

class TriggerIterator {
  constructor(strings, buffer, pos) {
    this._buffer = buffer
    this._pos = pos
    this._strings = strings
  }

  [Symbol.iterator]() {
    return this
  }

  next() {
    if (this._pos + 2400 > this._buffer.length) {
      return { done: true }
    }
    const trigger = new Trigger(this._strings, this._buffer, this._pos)
    this._pos += 2400
    return {
      value: trigger,
    }
  }
}

class Trigger {
  constructor(strings, buffer, pos) {
    this._buffer = buffer
    this._pos = pos
    this._strings = strings
  }

  players() {
    let pos = this._pos + 2372
    let result = []
    for (let i = 0; i < 27; i++) {
      if (this._buffer[pos + i] !== 0) {
        result.push(i)
      }
    }
    return result
  }

  conditions() {
    return new ConditionIterator(this._buffer, this._pos, 0, false)
  }

  allConditions() {
    return new ConditionIterator(this._buffer, this._pos, 0, true)
  }

  actions() {
    return new ActionIterator(this._strings, this._buffer, this._pos + 320, 0, false)
  }

  allActions() {
    return new ActionIterator(this._strings, this._buffer, this._pos + 320, 0, true)
  }

  rawByteView() {
    return this._buffer.slice(this._pos, this._pos + 2400)
  }
}

class ConditionIterator {
  constructor(buffer, pos, index, alsoDisabled) {
    this._buffer = buffer
    this._pos = pos
    this._index = index
    this._alsoDisabled = alsoDisabled
  }

  [Symbol.iterator]() {
    return this
  }

  next() {
    for (;;) {
      const pos = this._pos
      if (this._index === 16 || this._buffer[pos + 15] === 0) {
        return { done: true }
      }
      this._pos += 20
      this._index += 1
      if (!this._alsoDisabled && this._buffer[pos + 17] & 0x2 !== 0) {
        continue
      }
      const condition = new TriggerCondition(this._buffer, pos)
      return {
        value: condition,
      }
    }
  }
}

class TriggerCondition {
  constructor(buffer, pos) {
    this._buffer = buffer
    this._pos = pos
  }

  id() {
    return this._buffer[this._pos + 15]
  }

  isDisabled() {
    return this._buffer[this._pos + 17] & 0x2 !== 0
  }

  params() {
    const id = this.id()
    const bits = id > 0 && id <= CONDITION_PARAM_BITS.length ? CONDITION_PARAM_BITS[id - 1] : 0
    const buf = this._buffer
    const pos = this._pos
    return {
      location: bits & 0x1 ? buf[pos + 0] - 1 : undefined,
      player: bits & 0x2 ? buf.readUInt32LE(pos + 4) : undefined,
      amount: bits & 0x4 ? buf.readUInt32LE(pos + 8) : undefined,
      comparisionType: bits & 0x4 ? nameOrUnknown(COMPARISION_TYPES, buf[pos + 14]) : undefined,
      unitId: bits & 0x8 ? buf.readUInt16LE(pos + 12) : undefined,
      switchId: bits & 0x10 ? buf[pos + 16] : undefined,
      switchState:
        bits & 0x10 ? nameOrUnknown(CONDITION_SWITCH_STATES, buf[pos + 14] - 2) : undefined,
      resourceType: bits & 0x20 ? nameOrUnknown(RESOURCE_TYPES, buf[pos + 16]) : undefined,
      scoreType: bits & 0x40 ? nameOrUnknown(SCORE_TYPES, buf[pos + 16]) : undefined,
    }
  }

  rawByteView() {
    return this._buffer.slice(this._pos, this._pos + 20)
  }
}

class ActionIterator {
  constructor(strings, buffer, pos, index, alsoDisabled) {
    this._buffer = buffer
    this._pos = pos
    this._index = index
    this._alsoDisabled = alsoDisabled
    this._strings = strings
  }

  [Symbol.iterator]() {
    return this
  }

  next() {
    for (;;) {
      const pos = this._pos
      if (this._index === 64 || this._buffer[pos + 26] === 0) {
        return { done: true }
      }
      this._pos += 32
      this._index += 1
      if (!this._alsoDisabled && this._buffer[pos + 28] & 0x2 !== 0) {
        continue
      }
      const action = new TriggerAction(this._buffer, pos, this._strings)
      return {
        value: action,
      }
    }
  }
}

class TriggerAction {
  constructor(buffer, pos, strings) {
    this._buffer = buffer
    this._pos = pos
    this._strings = strings
  }

  id() {
    return this._buffer[this._pos + 26]
  }

  isDisabled() {
    return this._buffer[this._pos + 28] & 0x2 !== 0
  }

  params() {
    const id = this.id()
    const bits = id > 0 && id <= ACTION_PARAM_BITS.length ? ACTION_PARAM_BITS[id - 1] : 0
    const buf = this._buffer
    const pos = this._pos
    let amount = undefined
    if (bits & 0x1000) {
      amount = buf.readUInt32LE(pos + 12)
    } else if (bits & 0x2000) {
      amount = buf.readUInt32LE(pos + 20)
    }
    return {
      location: bits & 0x1 ? buf[pos + 0] - 1 : undefined,
      destLocation: bits & 0x2 ? buf[pos + 20] - 1 : undefined,
      movedLocation: bits & 0x80000 ? buf[pos + 20] - 1 : undefined,
      player: bits & 0x4 ? buf.readUInt32LE(pos + 16) : undefined,
      destPlayer: bits & 0x8 ? buf.readUInt32LE(pos + 20) : undefined,
      time: bits & 0x10 ? buf.readUInt32LE(pos + 12) : undefined,
      modifierType: bits & 0x20 ? nameOrUnknown(MODIFIER_TYPES, buf[pos + 27] - 7) : undefined,
      unitId: bits & 0x40 ? buf.readUInt16LE(pos + 24) : undefined,
      unitOrder: bits & 0x80 ? nameOrUnknown(UNIT_ORDERS, buf[pos + 27]) : undefined,
      unitAmount: bits & 0x4000 ? buf[pos + 27] : undefined,
      allianceStatus:
        bits & 0x100 ? nameOrUnknown(ALLIANCE_STATES, buf.readUInt16LE(pos + 24)) : undefined,
      switchId: bits & 0x200 ? buf.readUInt32LE(pos + 20) : undefined,
      switchState: bits & 0x200 ? nameOrUnknown(ACTION_SWITCH_STATES, buf[pos + 27] - 4) : undefined,
      resourceType:
        bits & 0x400 ? nameOrUnknown(RESOURCE_TYPES, buf.readUInt16LE(pos + 24)) : undefined,
      scoreType:
        bits & 0x800 ? nameOrUnknown(SCORE_TYPES, buf.readUInt16LE(pos + 24)) : undefined,
      aiScript: bits & 0x8000 ? buf.readUInt32BE(pos + 20) : undefined,
      alwaysDisplay: bits & 0x100000 ? (buf[pos + 28] & 0x4) !== 0 : undefined,
      text: bits & 0x10000 ? this._strings.get(buf.readUInt32LE(pos + 4)) : undefined,
      soundFile: bits & 0x20000 ? this._strings.get(buf.readUInt32LE(pos + 8)) : undefined,
      state: bits & 0x40000 ? nameOrUnknown(ACTION_STATES, buf[pos + 27] - 4) : undefined,
      amount,
    }
  }

  rawByteView() {
    return this._buffer.slice(this._pos, this._pos + 20)
  }
}

function nameOrUnknown(names, index) {
  const name = names[index]
  return name === undefined ? 'Unknown' : name
}

module.exports = {
  Triggers,
  actionIds,
  conditionIds,
}
