import fs from 'fs'
import BufferList from 'bl'
import ScmExtractor from 'scm-extractor'
import Chk from './index.js'
import 'process'

let goodMaps = 0
let scmExErrs = 0
let chkErrs = 0

let promise = checkmaps(process.argv[2])

promise.then(() => {
  console.log('Good maps: ' + goodMaps)
  console.log('scm-extractor errors: ' + scmExErrs)
  console.log('bw-chk errors: ' + chkErrs)
})

function checkmap(filename) {
  function readmap(filename, res, rej) {
    const mpq = fs.createReadStream(filename)
    const chk = mpq.pipe(ScmExtractor())
      .pipe(BufferList((err, buf) => {
        res()
        if (err) {
          console.log('scm-extractor: ' + err + ' (' + filename + ')')
          scmExErrs += 1
          return
        }
        try {
          const map = new Chk(buf)
        }
        catch (err) {
          console.log('bw-chk: ' + err + ' (' + filename + ')')
          chkErrs += 1
          return
        }
        goodMaps += 1
      }))
    mpq.on('error', (err) => {
      // Too many file descriptors
      if (err.code === 'EMFILE') {
        setTimeout(() => {
          readmap(filename, res, rej)
        }, 1000)
      } else {
        console.log('huoh: ' + err)
        console.log('Code: ' + err.code + '//' + err.errno)
        throw err
      }
    })
  }
  return new Promise((res, rej) => readmap(filename, res, rej))
}

function checkentry(filename) {
  return new Promise((res, rej) => {
    fs.stat(filename, async function(err, stats) {
      if (err) {
        console.log(err)
        rej()
        return
      }
      if (stats.isFile()) {
        const extension = filename.slice(-4)
        if (extension === '.scm' || extension === '.scx') {
          await checkmap(filename)
        }
      } else if (stats.isDirectory()) {
        await checkmaps(filename)
      }
      res()
    })
  })
}

function checkmaps(path) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, async function(err, files) {
      if (err) {
        reject(err)
        return
      }
      await Promise.all(files.map(file => checkentry(path + '/' + file)))
      resolve()
    })
  })
}
