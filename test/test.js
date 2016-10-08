'use strict';

import Chk, {Tilesets} from '../'
import BufferList from 'bl'
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
    const tilesets = new Tilesets()
    tilesets.init('bwdata')
    const map = await getMap('minimap.chk')
    const minimap = map.image(tilesets, undefined, 128, 128)
    t.plan(1)
    t.notDeepEqual(minimap, undefined)
  } catch (e) {
    t.comment(e.stack)
    throw e
  }
})
