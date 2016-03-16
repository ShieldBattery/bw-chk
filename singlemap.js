// singlemap.js <map.scx> [<tileset_directory>]
import fs from 'fs'
import BufferList from 'bl'
import {PNG} from 'pngjs'
import ScmExtractor from 'scm-extractor'
import Chk, {Tilesets, SpriteGroup} from './index.js'

const out = fs.createReadStream(process.argv[2])
  .pipe(ScmExtractor())
  .pipe(fs.createWriteStream('extracted.chk'))

const dataDir = process.argv[3] || '.'

out.on('finish', () => {
  const stream = fs.createReadStream('extracted.chk')
    .pipe(BufferList(function(err, buf) {
      if (err) {
        console.log(err)
        return
      }
      printMapInfo(buf).then(() => {}, err => { console.log(err); console.log(err.stack) });
  }))
  stream.on('error', (err) => {
    console.log(err)
  })
})

async function printMapInfo(buf) {
  const map = new Chk(buf)
  const tilesetNames = ['badlands', 'platform', 'install',
    'ashworld', 'jungle', 'desert', 'ice', 'twilight']
  const tilesets = new Tilesets
  try {
    for (const entry of tilesetNames.entries()) {
      const path = dataDir + '/tileset/' + entry[1]
      await tilesets.addFile(entry[0], path + '.cv5', path + '.vx4', path + '.vr4', path + '.wpe')
    }
  } catch (e) {
    console.log('Could not load tilesets: ' + e)
  }

  const units = [[214, 'thingy/startloc.grp'], [176, 'neutral/min01.grp'],
        [177, 'neutral/min01.grp'], [178, 'neutral/min03.grp'], [188, 'neutral/geyser.grp']]
  const sprites = new SpriteGroup
  for (const entry of units) {
    const path = dataDir + '/unit/' + entry[1]
    sprites.addUnitLazy(entry[0], path)
  }

  console.log('Title: ' + map.title)
  console.log('Description: ' + map.description)
  console.log('Tileset: ' + map.tileset)
  console.log('Size: ' + map.size[0] + 'x' + map.size[1])
  console.log('Forces:')
  for (const force of map.forces) {
    console.log('  ' + force.name + ': ' + force.players.length + ' players')
  }
  if (map.maxPlayers(true) != map.maxPlayers(false)) {
    console.log('NOTE: DIFFERENT AMOUNT OF PLAYERS IN MELEE: ' + map.maxPlayers(false))
  }

  const minimap_width = map.size[0] * 8
  const minimap_height = map.size[1] * 8
  try {
    const minimap = await map.minimapImage(tilesets, sprites, minimap_width, minimap_height)
    if (minimap !== undefined) {
      const image = new PNG({
        width: minimap_width,
        height: minimap_height,
        inputHasAlpha: false,
      })
      image.data = minimap
      image.pack().pipe(fs.createWriteStream('minimap.png'))
    } else {
      console.log('Could not create minimap image')
    }
  } catch (err) {
    console.log('Could not create minimap image', err.stack)
  }
}

