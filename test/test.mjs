'use strict';

import BufferList from 'bl'
import Chk from '../index.js'
import fs from 'fs'
import {test} from 'tape'

async function getMap(filename) {
  return await new Promise((res, rej) => {
    fs.createReadStream('test/' + filename)
      .pipe(Chk.createStream((err, chk) => {
        if (err) {
          rej(err)
        } else {
          res(chk)
        }
    }))
  })
}

function nonExtendedTilesetFileAccess() {
  return Chk.customFileAccess(fname => {
    if (fname.endsWith('.vx4ex')) {
      return Promise.reject(new Error('This does not exist'))
    }
    // Give dummy 2-byte files for non-tileset files (Valid 0-frame grp)
    if (!fname.startsWith('tileset')) {
      return Promise.resolve(Buffer.alloc(2))
    } else {
      // Just using dummy ashworld-named tileset here for everything
      const filePath = 'test/bwdata/' + fname.replace(/\\/g, '/')
        .replace('jungle', 'ashworld')
        .replace('twilight', 'ashworld')
      return new Promise((res, rej) => {
        fs.createReadStream(filePath)
          .pipe(new BufferList((err, buf) => {
            if (err) {
              rej(err)
            } else {
              res(buf)
            }
          }))
      })
    }
  })
}

function extendedTilesetFileAccess() {
  return Chk.customFileAccess(fname => {
    if (fname.endsWith('.vx4')) {
      return Promise.reject(new Error('This does not exist'))
    }
    // Give dummy 0-byte files for non-tileset files
    if (!fname.startsWith('tileset')) {
      return Promise.resolve(Buffer.alloc(2))
    } else {
      // Just using dummy ashworld-named tileset here for everything
      const filePath = 'test/bwdata/' + fname.replace(/\\/g, '/')
        .replace('jungle', 'ashworld')
        .replace('twilight', 'ashworld')
      return new Promise((res, rej) => {
        fs.createReadStream(filePath)
          .pipe(new BufferList((err, buf) => {
            if (err) {
              rej(err)
            } else {
              res(buf)
            }
          }))
      })
    }
  })
}

test('Simple map', async t => {
  const map = await getMap('simple.chk')
  t.plan(6)
  t.deepEqual(map.title, 'Untitled Scenario.')
  t.deepEqual(map.description, 'Destroy all enemy buildings.')
  t.deepEqual(map.size, [64, 64])
  t.deepEqual(map.maxPlayers(true), 8)
  t.deepEqual(map.maxPlayers(false), 8)
  t.deepEqual(map.forces[0].flags, 15)
})

test('Weird forces', async t => {
  const map = await getMap('forces.chk')
  t.plan(6)
  for (let i = 0; i < 4; i += 1) {
    t.deepEqual(map.forces[i].players, [{
      id: i, race: 5, computer: false, type: 'human', typeId: 6,
    }])
  }
  t.deepEqual(map.maxPlayers(true), 4)
  t.deepEqual(map.maxPlayers(false), 8)
})

test('Incomplete forces', async t => {
  const map = await getMap('forces2.chk')
  t.plan(3)
  t.deepEqual(map.forces[0].players.length, 2)
  t.deepEqual(map.maxPlayers(false), 2)
  t.deepEqual(map.maxPlayers(true), 0)
})

test('Section abuse', async t => {
  const map = await getMap('sections.chk')
  t.plan(2)
  t.deepEqual(map.title, '\x04S.A.T. \x06Control \x072 \x03[1.1]')
  t.deepEqual(map.size, [128, 128])
})

test('Minimap, nonext vx4', async t => {
  // The test vx4 file has tiles filled with vr4 id 0x1, which in turn
  // is full of palette color 0x1, which is 0xffffff
  const map = await getMap('simple.chk')
  const minimap = await map.image(nonExtendedTilesetFileAccess(), 32, 32)
  t.plan(1)
  t.deepEqual(minimap, Buffer.alloc(32 * 32 * 3, 0xff))
})

test('Minimap, ext vx4', async t => {
  // The test vx4ex file has tiles filled with vr4 id 0x2, which in turn
  // is full of palette color 0x2, which is 0x808080
  const map = await getMap('simple.chk')
  const minimap = await map.image(extendedTilesetFileAccess(), 32, 32)
  t.plan(1)
  t.deepEqual(minimap, Buffer.alloc(32 * 32 * 3, 0x80))
})

test('Invalid tile in MTXM', async t => {
  try {
    const map = await getMap('minimap.chk')
    const minimap = await map.image(nonExtendedTilesetFileAccess(), 128, 128)
    t.plan(1)
    t.notDeepEqual(minimap, undefined)
  } catch (e) {
    t.comment(e.stack)
    throw e
  }
})

test('Invalid unit', async t => {
  try {
    const map = await getMap('invalid_unit.chk')
    const minimap = await map.image(nonExtendedTilesetFileAccess(), 128, 128)
    t.plan(1)
    t.notDeepEqual(minimap, undefined)
  } catch (e) {
    t.comment(e.stack)
    throw e
  }
})

test('Out-of-bounds sprite', async t => {
  try {
    // The map has 11 sprites but one of them is an invalid, out-of-bounds one
    const map = await getMap('oob_sprite.chk')
    const minimap = await map.image(nonExtendedTilesetFileAccess(), 128, 128)
    t.plan(2)
    t.notDeepEqual(minimap, undefined)
    t.deepEqual(map.sprites.length, 10)
  } catch (e) {
    t.comment(e.stack)
    throw e
  }
})

test('Encoding heuristic (949)', async t => {
  // Note: 4.chk is a Korean map which has been edited later to have Western text.
  // As such, the heuristic is more fragile than usual.
  // If the heuristic is taught to ignore location names, it should always be recognized as 949.
  const files = fs.readdirSync('test/kor_encoding')
  t.plan(files.length)
  for (const file of files) {
    t.comment(file)
    const map = await getMap('kor_encoding/' + file)
    t.deepEqual(map.encoding(), 'cp949')
  }
})

test('Encoding heuristic (1252)', async t => {
  const files = fs.readdirSync('test/wes_encoding')
  t.plan(files.length)
  for (const file of files) {
    t.comment(file)
    const map = await getMap('wes_encoding/' + file)
    t.deepEqual(map.encoding(), 'cp1252')
  }
})

test('Encoding heuristic (Mixed)', async t => {
  const map = await getMap('mixed_encoding_1.chk')
  t.deepEqual(map.encoding(), 'mixed')
  t.deepEqual(map.title, '\x06피아노\x03 마스터\x04v5.3A')
  t.deepEqual(
      map.description,
      '제작 : 믹넛 TTNSM / korea\r\n' +
      '아이디어 : DeratoY (EDAC)\r\n\r\n' +
      'Thanks for Artanis / 맛있는빙수 / Terran_Wraith\r\n' +
      'Thanks for You'
  )
})

test('Encoding heuristic (Mixed 2)', async t => {
  const map = await getMap('mixed_encoding_2.chk')
  t.deepEqual(map.encoding(), 'mixed')
  t.deepEqual(map.description, 'Défendre Map by Sadrio Fuck you No join me ist not me, not sex')
})

test('Encoding heuristic (UTF-8)', async t => {
  const map = await getMap('utf8_encoding_1.chk')
  t.deepEqual(map.encoding(), 'utf8')
  t.deepEqual(
      map.description,
      'Fall asleep in the mirror,\r\n' +
      'Inside of this endless forever repeating nightmare\r\n' +
      'Please be stuck here like this forever\r\n\r\n' +
      'Created by - 효진(CrystalDrag)\r\n' +
      'Version 1.31'
  )
})

test('Unusual player types', async t => {
  try {
    // Various player types
    const map = await getMap('player_types.chk')
    t.plan(7)
    t.deepEqual(map.forces[1].players[0].typeId, 2)
    t.deepEqual(map.forces[2].players[0].typeId, 1)
    t.deepEqual(map.forces[2].players[1].typeId, 4)
    t.deepEqual(map.forces[2].players[2].typeId, 7)
    t.deepEqual(map.forces[2].players[2].type, 'neutral')
    t.deepEqual(map.forces[3].players[1].typeId, 3)
    t.deepEqual(map.forces[3].players[1].type, 'rescueable')
  } catch (e) {
    t.comment(e.stack)
    throw e
  }
})

test('Extended string section', async t => {
  // Various player types
  const map = await getMap('extended_strings.chk')
  t.plan(2)
  t.deepEqual(map.title, '\x07Polyp\x06oid \x061\x03.32')
  t.deepEqual(
      map.description,
      '\x04Usually harmless.\r\n' +
      '\x04However, there is a small risk of \x07malignancy.\r\n\r\n' +
      'Created by KM-\r\n' +
      'Released 2020.05.17.',
  )
})

test('Trigger conditions', async t => {
  const map = await getMap('triggers.chk')
  let first = true
  t.plan(21 * 2 + 2)
  const ids = Chk.conditionIds()
  const check = (t, cond, id, paramsCompare) => {
    t.deepEqual(cond.id(), id)
    const paramsIn = cond.params()
    let params = {}
    for (const [k, v] of Object.entries(paramsIn).filter(([key, val]) => val !== undefined)) {
      params[k] = v
    }
    t.deepEqual(params, paramsCompare)
  }
  for (const trigger of map.triggers()) {
    const conditions = trigger.conditions()
    if (first) {
      check(
          t, conditions.next().value, ids.ACCUMULATE,
          { player: 3, amount: 888, comparisionType: 'AtMost', resourceType: 'Gas' },
      )
      check(
          t, conditions.next().value, ids.ALWAYS,
          { },
      )
      check(
          t, conditions.next().value, ids.BRING,
          { player: 3, amount: 888, unitId: 7, location: 5, comparisionType: 'Exactly' },
      )
      check(
          t, conditions.next().value, ids.COMMAND,
          { player: 3, amount: 888, unitId: 7, comparisionType: 'Exactly' },
      )
      check(
          t, conditions.next().value, ids.COMMAND_LEAST,
          { unitId: 8 },
      )
      check(
          t, conditions.next().value, ids.COMMAND_LEAST_AT,
          { unitId: 8, location: 5 },
      )
      check(
          t, conditions.next().value, ids.COMMAND_MOST,
          { unitId: 8 },
      )
      check(
          t, conditions.next().value, ids.COMMAND_MOST_AT,
          { unitId: 8, location: 5 },
      )
      check(
          t, conditions.next().value, ids.COUNTDOWN_TIMER,
          { amount: 888, comparisionType: 'AtLeast' },
      )
      check(
          t, conditions.next().value, ids.DEATHS,
          { amount: 888, comparisionType: 'AtLeast', player: 3, unitId: 8 },
      )
      check(
          t, conditions.next().value, ids.ELAPSED_TIME,
          { amount: 888, comparisionType: 'AtLeast' },
      )
      check(
          t, conditions.next().value, ids.HIGHEST_SCORE,
          { scoreType: 'KillsAndRazings', },
      )
      check(
          t, conditions.next().value, ids.KILL,
          { amount: 888, comparisionType: 'AtMost', player: 3, unitId: 8 },
      )
      check(
          t, conditions.next().value, ids.LEAST_KILLS,
          { unitId: 8 },
      )
      check(
          t, conditions.next().value, ids.LEAST_RESOURCES,
          { resourceType: 'OreAndGas' },
      )
      check(
          t, conditions.next().value, ids.LOWEST_SCORE,
          { scoreType: 'KillsAndRazings' },
      )
      t.deepEqual(conditions.next().done, true)
    } else {
      check(
          t, conditions.next().value, ids.MOST_KILLS,
          { unitId: 34 },
      )
      check(
          t, conditions.next().value, ids.MOST_RESOURCES,
          { resourceType: 'Ore' },
      )
      check(
          t, conditions.next().value, ids.OPPONENTS,
          { comparisionType: 'Exactly', player: 18, amount: 5 },
      )
      check(
          t, conditions.next().value, ids.SCORE,
          { comparisionType: 'Exactly', player: 18, amount: 68, scoreType: 'Buildings' },
      )
      check(
          t, conditions.next().value, ids.SWITCH,
          { switchId: 4, switchState: 'Set' },
      )
      t.deepEqual(conditions.next().done, true)
      break
    }
    first = false
  }
})

test('Trigger actions', async t => {
  const map = await getMap('triggers.chk')
  t.plan(52 * 2 + 1)
  const ids = Chk.actionIds()
  const check = (t, act, id, paramsCompare) => {
    t.deepEqual(act.id(), id)
    const paramsIn = act.params()
    let params = {}
    for (const [k, v] of Object.entries(paramsIn).filter(([key, val]) => val !== undefined)) {
      params[k] = v
    }
    t.deepEqual(params, paramsCompare)
  }
  const firstTrigger = map.triggers()[Symbol.iterator]().next().value
  const actions = firstTrigger.actions()
  check(
      t, actions.next().value, ids.CENTER_VIEW,
      { location: 9 },
  )
  check(
      t, actions.next().value, ids.COMMENT,
      { text: 'comment test 123' },
  )
  check(
      t, actions.next().value, ids.CREATE_UNIT,
      { unitId: 1, unitAmount: 92, location: 9, player: 5 },
  )
  check(
      t, actions.next().value, ids.CREATE_UNIT_WITH_PROPERTIES,
      { unitId: 1, unitAmount: 92, location: 9, player: 5 },
  )
  check(
      t, actions.next().value, ids.DEFEAT,
      { },
  )
  check(
      t, actions.next().value, ids.DISPLAY_TEXT,
      { text: 'display text 1', alwaysDisplay: true },
  )
  check(
      t, actions.next().value, ids.DISPLAY_TEXT,
      { text: 'display\r\ntext\r\n2', alwaysDisplay: false },
  )
  check(
      t, actions.next().value, ids.DRAW,
      { },
  )
  check(
      t, actions.next().value, ids.GIVE_UNIT,
      { unitId: 124, unitAmount: 0, location: 9, player: 5, destPlayer: 6 },
  )
  check(
      t, actions.next().value, ids.KILL_UNIT,
      { unitId: 124, player: 5 },
  )
  check(
      t, actions.next().value, ids.KILL_UNIT_AT_LOCATION,
      { unitId: 124, unitAmount: 0, location: 9, player: 5 },
  )
  check(
      t, actions.next().value, ids.LEADERBOARD_CONTROL_AT_LOCATION,
      { unitId: 124, location: 9, text: 'lb ctrl@' },
  )
  check(
      t, actions.next().value, ids.LEADERBOARD_CONTROL,
      { unitId: 124, text: 'lb ctrl' },
  )
  check(
      t, actions.next().value, ids.LEADERBOARD_GREED,
      { amount: 6666 },
  )
  check(
      t, actions.next().value, ids.LEADERBOARD_KILLS,
      { unitId: 124, text: 'lb kill' },
  )
  check(
      t, actions.next().value, ids.LEADERBOARD_POINTS,
      { scoreType: 'Custom', text: 'lb points' },
  )
  check(
      t, actions.next().value, ids.LEADERBOARD_RESOURCES,
      { resourceType: 'OreAndGas', text: 'lb $' },
  )
  check(
      t, actions.next().value, ids.MINIMAP_PING,
      { location: 4 },
  )
  check(
      t, actions.next().value, ids.SET_UNIT_ENERGY,
      { amount: 66, player: 5, location: 4, unitId: 124, unitAmount: 6 },
  )
  check(
      t, actions.next().value, ids.SET_UNIT_HANGAR,
      { amount: 4, player: 5, location: 4, unitId: 124, unitAmount: 6 },
  )
  check(
      t, actions.next().value, ids.SET_UNIT_HP,
      { amount: 55, player: 5, location: 4, unitId: 124, unitAmount: 6 },
  )
  check(
      t, actions.next().value, ids.SET_UNIT_RESOURCE,
      { amount: 555, player: 5, location: 4, unitAmount: 6 },
  )
  check(
      t, actions.next().value, ids.SET_UNIT_SHIELDS,
      { amount: 55, player: 5, location: 4, unitId: 124, unitAmount: 6 },
  )
  check(
      t, actions.next().value, ids.MOVE_LOCATION,
      { movedLocation: 3, location: 4, player: 5, unitId: 124 },
  )
  check(
      t, actions.next().value, ids.MOVE_UNIT,
      { destLocation: 3, location: 4, player: 5, unitId: 124, unitAmount: 6 },
  )
  check(
      t, actions.next().value, ids.MUTE_UNIT_SPEECH,
      { },
  )
  check(
      t, actions.next().value, ids.ISSUE_ORDER,
      { location: 6, unitOrder: 'Patrol', player: 2, unitId: 32, destLocation: 3 },
  )
  check(
      t, actions.next().value, ids.PAUSE,
      { },
  )
  check(
      t, actions.next().value, ids.PAUSE_COUNTDOWN_TIMER,
      { },
  )
  check(
      t, actions.next().value, ids.PLAY_WAV,
      { soundFile: 'sound\\Bullet\\DragBull.wav', time: 1448 },
  )
  check(
      t, actions.next().value, ids.PRESERVE_TRIGGER,
      { },
  )
  check(
      t, actions.next().value, ids.REMOVE_UNIT,
      { unitId: 32, player: 2 },
  )
  check(
      t, actions.next().value, ids.REMOVE_UNIT_AT_LOCATION,
      { unitId: 32, player: 2, location: 6, unitAmount: 6, },
  )
  check(
      t, actions.next().value, ids.RUN_AI_SCRIPT,
      { aiScript: 0x2b566932 },
  )
  check(
      t, actions.next().value, ids.RUN_AI_SCRIPT_AT_LOCATION,
      { aiScript: 0x544d4578, location: 6 },
  )
  check(
      t, actions.next().value, ids.SET_ALLIANCE,
      { player: 2, allianceStatus: 'AlliedVictory' },
  )
  check(
      t, actions.next().value, ids.SET_COUNTDOWN_TIMER,
      { amount: 75, modifierType: 'Subtract' },
  )
  check(
      t, actions.next().value, ids.SET_DEATHS,
      { amount: 5555, modifierType: 'Add', unitId: 32, player: 2 },
  )
  check(
      t, actions.next().value, ids.SET_DOODAD_STATE,
      { location: 6, state: 'Toggle', unitId: 7, player: 2 },
  )
  check(
      t, actions.next().value, ids.SET_INVINCIBILITY,
      { location: 6, state: 'Set', unitId: 32, player: 2 },
  )
  check(
      t, actions.next().value, ids.SET_MISSION_OBJECTIVES,
      { text: 'mission objective text' },
  )
  check(
      t, actions.next().value, ids.SET_NEXT_SCENARIO,
      { text: 'nextmap.scx' },
  )
  check(
      t, actions.next().value, ids.SET_RESOURCES,
      { player: 2, modifierType: 'Set', amount: 5555, resourceType: 'OreAndGas'},
  )
  check(
      t, actions.next().value, ids.SET_SCORE,
      { player: 2, modifierType: 'Add', amount: 5555, scoreType: 'Total'},
  )
  check(
      t, actions.next().value, ids.SET_SWITCH,
      { switchId: 10, switchState: 'Randomize' },
  )
  check(
      t, actions.next().value, ids.TALKING_PORTRAIT,
      { unitId: 1, time: 75, },
  )
  check(
      t, actions.next().value, ids.TRANSMISSION,
      {
        alwaysDisplay: true,
        text: 'transmission text',
        unitId: 1,
        location: 6,
        modifierType: 'Add', 
        amount: 5555,
        soundFile: 'sound\\Bullet\\DragBull.wav',
        time: 1448,
      },
  )
  check(
      t, actions.next().value, ids.UNMUTE_UNIT_SPEECH,
      { },
  )
  check(
      t, actions.next().value, ids.UNPAUSE,
      { },
  )
  check(
      t, actions.next().value, ids.UNPAUSE_COUNTDOWN_TIMER,
      { },
  )
  check(
      t, actions.next().value, ids.VICTORY,
      { },
  )
  check(
      t, actions.next().value, ids.WAIT,
      { time: 8500 },
  )
  t.deepEqual(actions.next().done, true)
})
