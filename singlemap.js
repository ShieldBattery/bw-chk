import fs from 'fs'
import BufferList from 'bl'
import ScmExtractor from 'scm-extractor'
import Chk from './index.js'
import 'process'

const out = fs.createReadStream(process.argv[2])
  .pipe(ScmExtractor())
  .pipe(fs.createWriteStream('extracted.chk'))

out.on('finish', () => {
  fs.createReadStream('extracted.chk')
    .pipe(BufferList(function(err, buf) {
      if (err) {
        console.log(err)
        return
      }
      const map = new Chk(buf)

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
  }))
})
