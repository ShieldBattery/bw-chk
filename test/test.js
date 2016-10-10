'use strict';

import BufferList from 'bl'
import Chk from '../'
import fs from 'fs'
import {test} from 'tape'

async function getMap(filename) {
  const buf = await new Promise(res => {
    fs.createReadStream('test/' + filename)
      .pipe(new BufferList((err, buf) => {
        if (err) {
          throw err
        }
        res(buf)
    }))
  })
  return new Chk(buf)
}

test('Simple map', async t => {
  const map = await getMap('simple.chk')
  t.plan(5)
  t.deepEqual(map.title, 'Untitled Scenario.')
  t.deepEqual(map.description, 'Destroy all enemy buildings.')
  t.deepEqual(map.size, [64, 64])
  t.deepEqual(map.maxPlayers(true), 8)
  t.deepEqual(map.maxPlayers(false), 8)
})

test('Weird forces', async t => {
  const map = await getMap('forces.chk')
  t.plan(6)
  for (let i = 0; i < 4; i += 1) {
    t.deepEqual(map.forces[i].players, [{id: i, race: 5, computer: false}])
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

test('Invalid tile in MTXM', async t => {
  try {
    const map = await getMap('minimap.chk')
    const minimap = map.image(Chk.fsFileAccess('bwdata'), 128, 128)
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
    const minimap = map.image(Chk.fsFileAccess('bwdata'), 128, 128)
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
    const minimap = map.image(Chk.fsFileAccess('bwdata'), 128, 128)
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
    const map = await getMap('kor_encoding/' + file)
    t.comment(file)
    t.deepEqual(map.encoding, 'cp949')
  }
})

test('Encoding heuristic (1252)', async t => {
  const files = fs.readdirSync('test/wes_encoding')
  t.plan(files.length)
  for (const file of files) {
    const map = await getMap('wes_encoding/' + file)
    t.comment(file)
    t.deepEqual(map.encoding, 'cp1252')
  }
})
