# Optional bundled binaries

A build may drop an `mpv/` folder here (containing `mpv` / `mpv.exe` and its
libraries) and it will be packaged into the app's resources. Cinema Hall looks
there first, before the system install and `PATH`.

Nothing is required: when this folder is empty the app uses whichever mpv is
installed on the machine, and falls back to the built-in web player if there is
none.
