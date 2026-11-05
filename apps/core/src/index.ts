// ✔ It won’t run
// ✔ But nexe will include the packages
// ✔ And Knex will continue to work as it does now

// if (false) {
//   require('better-sqlite3');
//   require('pg');
//   require('mysql');
//   require('tedious');
// }
//--------
import { fileURLToPath } from 'url';
import { TaskFactory } from '@task/TaskFactory';
//--------
// import { DatabaseManager } from '@database/DatabaseManager';
// import { Model } from 'objection';
// import { TaskService } from '@database/services/TaskService';

// // Initialize knex & bind to Objection
// const knex = DatabaseManager.init();
// Model.knex(knex);
//--------

(async () => {
  try {
    // // Run migrations
    // await DatabaseManager.migrate();
    // const tasks = await TaskService.getAll();

    // Runs the workflow file given on the command line, or the math example by default.
    const file =
      process.argv[2] ??
      fileURLToPath(new URL('../../../examples/actions/math/math.yml', import.meta.url));
    const task = await TaskFactory.fromFile(
      file,
      'abcdefghijklmnopqrstuvwxyz',
      'abcdefghijklmnopqrstuvwxyz'
    );
    const result = await task.run();
  } catch (error: any) {}
})();
