/**
 * Ensure node-pty's `spawn-helper` binaries are executable.
 *
 * node-pty ships prebuilt binaries; on macOS it execs a `spawn-helper` to
 * fork the shell. Some install/rebuild steps (e.g. electron-builder
 * install-app-deps re-extracting the package) drop the executable bit, which
 * makes every PTY spawn fail with "Failed to spawn shell". This restores +x.
 */
const fs = require('fs')
const path = require('path')

const prebuilds = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds')

function fixDir(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      fixDir(full)
    } else if (entry.name === 'spawn-helper') {
      try {
        fs.chmodSync(full, 0o755)
        console.log(`[fix-pty-perms] chmod +x ${path.relative(process.cwd(), full)}`)
      } catch (err) {
        console.warn(`[fix-pty-perms] could not chmod ${full}: ${err.message}`)
      }
    }
  }
}

fixDir(prebuilds)
