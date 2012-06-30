brackets-related-files
========================

Related files calculation for Brackets.

Copy (or git clone) this folder into the `brackets/src/extensions/user` folder and restart Brackets.
Click on the project name in the sidebar to see the list of recently opened folders (the list only
starts being maintained when you first use the extension, so you won't see folders from before you
installed it).

The extension is designed to run in the background, with the current master branch of Brackets it runs
in a blocking manner.  It works better on large projects with pull request #1009 (Async.doSequentiallyInBackground support).
