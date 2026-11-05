The Tipeline desktop application has the following sections

- Home
  Quick actions buttons
  Create new task
  Build App
  Explore (or not sure if install, the idea is user can search and install a new task or app from the cloud)
  Recent activity
  List of latest runs
  will be displayed in a table
  Chart completed / failed
  Notifications (or alerts)
  Upcoming schedule
- Tasks
  - This will display the list of tasks in a table and a search filter in the top
- Schedules
  - This will display the scheduled tasks in a table and a search filter in the top
- Apps
  - These will be displayed in cards and a search filter in the top
- Variables
  - List of variables displayed in a table and a search filter in the top
- Alerts
  - Latest list alerts in a table and a search filter in the top
- Explore
  - Will have 2 tabs, one for displaying the tasks and another one for displaying the apps
  - This will be from fetched from tipeline.com
- Settings
  - List of settings
- Help
  - Link to the external documentation

---

The internal pages

- Task Detail: displays tabs -> info, pipelines, statistics, schedules, etc.
  - Task Info: This will display 2 columns one for the form that run the task, at the left. At the right the details of the Task like desciription, version, identifier, etc
  - Pipelines: a search filter and a table to display the list of pielines ran by that task. (every run is a pipeline)
  - Statistics: thinking in remove it because not sure what kind of useful thing can i add here
  - Schedules will show the list of cron tasks for this task
- Task Edit: Displays 3 columns. The first column will display the list steps (actions) group by the type, the user can drag the actions to the center column. The center column displays the list of steps, this list is draggable so the user can change the position of the steps. The steps can have sub steps like simpleLoop. at the top of these column will have some controls to save, run , pause, stop, step. Right column displays the Variables, the Task Variables and Global Variables
  - Deleting an action does not show a confirm dialog. Instead it shows a toast ("Action deleted") with an Undo button, matching Figma/Notion/VS Code style editors. The undo buffer only holds the last deleted action, lives in memory only (not persisted), and is lost when navigating away from the task or refreshing. This intentionally covers builder/canvas changes only, not task-level things like renaming. It's designed so it can grow into full multi-step undo/redo later (e.g. Cmd+Z) without reworking the capture point, if that's ever needed.
- New Task: For with the ncessary to create a new task

- App Detail: dashboard like salesforce. So, it will have tabs with different kind of information.
- App Edit: drag and drop components to create a dashboard like salesforce (will have blocks, forms, layouts, buttons, pagers, etc). Everything here will be connected to the tasks. So for example i want to display a table in the dasboard, I can use the information results saved in every run in order to display the table iformation or create a button to fire a task.
-

Questions

- First i need feedback about the structure of these pages. Things to remove, things to add, recommendations, etc.
- I don't know exactly what to add in the homepage. I don't want to add a lot of things. Not sure if remove it and keep only Task page as the main page. Or not sure if it's important in this kind of project so i should add relevant things.
