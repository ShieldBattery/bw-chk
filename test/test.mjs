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
