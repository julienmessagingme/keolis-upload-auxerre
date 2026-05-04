const cron = require('node-cron');
const { syncAuxerre } = require('./sync.service');

const SCHEDULE = '0 22 * * *'; // tous les jours a 22h00 Europe/Paris
const TZ = 'Europe/Paris';

/**
 * Lance le cron de sync MessagingMe au boot du process.
 * Idempotent : appeler plusieurs fois ne cree pas plusieurs schedules
 * (on utilise une variable module pour memoriser).
 */
let started = false;

function startStatsCron() {
  if (started) return;
  started = true;

  cron.schedule(SCHEDULE, async () => {
    console.log(JSON.stringify({ level: 'info', msg: 'stats cron tick: syncAuxerre start' }));
    try {
      const result = await syncAuxerre();
      console.log(JSON.stringify({ level: 'info', msg: 'syncAuxerre done', ...result }));
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error', msg: 'syncAuxerre fatal',
        err: err.message,
      }));
    }
  }, { timezone: TZ });

  console.log(JSON.stringify({
    level: 'info', msg: 'stats cron scheduled',
    schedule: SCHEDULE, timezone: TZ,
  }));
}

module.exports = { startStatsCron };
